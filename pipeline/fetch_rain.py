"""Add the AROME 0.01° rain and storm index to the data written by fetch_arome.py.

AROME's package SP2 comes out with SP1 (same run, same grid, within a minute), ~18 MB an hour.
We keep, on the AROME grid cut to BOX:
  rr    precipitation of the hour, mm: rain + snow + graupel (0, 1, 65 / 66 / 75), accumulated
        since the run start in the GRIB, so step N minus step N-1
  cape  CAPE, J/kg (0, 7, 6), instant: the energy storms can draw on

Output, next to the AROME files:
  <out>/rain-<run>_<grid>.bin  uint8, hours one after another, then fields (rr, cape), then rows
                         (row 0 = south) and columns. rr in RR_SCALE mm, cape in CAPE_SCALE J/kg.
  <out>/meta.json        gains a "rain" entry: run, fields, scales, validity times (UTC), file

The AROME run comes out step by step (fetch_arome.py publishes it as it goes, "runThrough"): the
rain is made for the steps out, then made again when REDO_AFTER more steps or the whole run are
out, rather than downloading every step again on each pass. Meanwhile, and if the bucket fails,
the rain already published is kept (with --reuse-from): its hours match by validity time.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile

import eccodes
import numpy as np

from fetch_arome import BOX, BUCKET, FIRST_STEP, MAX_STEP, STEP, data_folder, download, read_published

FIELDS = ["rr", "cape"]
REDO_AFTER = 12  # steps
RR_SCALE = 0.1  # mm per unit: up to 25.4 mm in the hour
CAPE_SCALE = 20  # J/kg per unit: up to 5 080
PRECIP = {(0, 1, 65), (0, 1, 66), (0, 1, 75)}  # rain, snow, graupel
CAPE = (0, 7, 6)


def file_url(run: str, step: int) -> str:
    return f"{BUCKET}/{run}/arome/001/SP2/arome__001__SP2__{step:02d}H__{run}.grib2"


def read_sp2(path: Path) -> tuple[np.ndarray, np.ndarray | None]:
    """Precipitation accumulated since the run start (mm) and CAPE, cropped to BOX, row 0 = south."""
    total: np.ndarray | None = None
    cape: np.ndarray | None = None
    with open(path, "rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            try:
                key = tuple(eccodes.codes_get(h, k) for k in ("discipline", "parameterCategory", "parameterNumber"))
                if key not in PRECIP and key != CAPE:
                    continue
                ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
                lat1 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees")
                lon1 = eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees")
                assert eccodes.codes_get(h, "jScansPositively") == 0, "expected north → south rows"
                values = eccodes.codes_get_values(h).reshape(nj, ni)
                j_north = round((lat1 - BOX["north"]) / STEP)
                j_south = round((lat1 - BOX["south"]) / STEP)
                i_west = round(((BOX["west"] - lon1) % 360) / STEP)
                i_east = round(((BOX["east"] - lon1) % 360) / STEP)
                box = values[j_north : j_south + 1, i_west : i_east + 1][::-1].copy()
                if key == CAPE:
                    cape = box
                else:
                    total = box if total is None else total + box
            finally:
                eccodes.codes_release(h)
    if total is None:
        raise RuntimeError(f"{path.name}: no precipitation")
    return total, cape


def encode(rr: np.ndarray, cape: np.ndarray | None) -> bytes:
    a = np.clip(np.round(np.maximum(rr, 0) / RR_SCALE), 0, 254).astype(np.uint8)
    c = np.zeros_like(a) if cape is None else np.clip(np.round(cape / CAPE_SCALE), 0, 254).astype(np.uint8)
    return a.tobytes() + c.tobytes()


def write_run(run: str, grid: dict, last_step: int, out: Path) -> dict:
    """Download SP2 for the run and write its rain file: the "rain" entry of meta.json."""
    run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    steps = list(range(FIRST_STEP, last_step + 1))
    print(f"AROME rain, run {run}, +{steps[0]} to +{steps[-1]} h")
    acc: dict[int, tuple[np.ndarray, np.ndarray | None]] = {}
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(6) as pool:
        need = [steps[0] - 1, *steps]
        jobs = {s: pool.submit(download, file_url(run, s), Path(tmp) / f"{s:02d}.grib2") for s in need}
        for s in need:
            path = jobs[s].result()
            acc[s] = read_sp2(path)
            path.unlink()
    parts = [encode(acc[s][0] - acc[s - 1][0], acc[s][1]) for s in steps]
    times = [f"{run_time + timedelta(hours=s):%Y-%m-%dT%H:%MZ}" for s in steps]
    name = f"rain-{data_folder(run, {**grid, 'fields': FIELDS})}.bin"
    (out / name).write_bytes(b"".join(parts))
    print(f"wrote {name}, {len(times)} hours, {len(b''.join(parts)) // 1024} KB")
    return {"run": run, "fields": FIELDS, "scales": {"rr": RR_SCALE, "cape": CAPE_SCALE}, "times": times, "file": name}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="folder holding meta.json from fetch_arome.py")
    p.add_argument("--reuse-from", help="published data URL (…/data): keep its rain while the run is incomplete")
    p.add_argument("--run", help="run to use (default: meta.json's)")
    p.add_argument("--last-step", type=int, default=MAX_STEP)
    args = p.parse_args()

    meta_path = args.out / "meta.json"
    meta = json.loads(meta_path.read_text())
    run = args.run or meta["run"]
    published = (read_published(args.reuse_from) or {}) if args.reuse_from else {}
    pub_rain = published.get("rain") if published.get("grid") == meta["grid"] else None

    def keep(why: str) -> None:
        if pub_rain:
            meta["rain"] = pub_rain
            print(f"rain {why}: kept the published run {pub_rain['run']}")
        else:
            meta.pop("rain", None)
            print(f"rain {why}: none")
        meta_path.write_text(json.dumps(meta, indent=1))

    run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    last = args.last_step
    if not args.run and meta.get("runThrough"):
        through = datetime.strptime(meta["runThrough"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        last = min(last, int((through - run_time).total_seconds() // 3600))
    have = FIRST_STEP + len(pub_rain["times"]) - 1 if pub_rain and pub_rain["run"] == run else -1
    if have >= last or (have >= 0 and last < args.last_step and last - have < REDO_AFTER):
        return keep(f"of run {run} up to +{have} h already published")
    try:
        meta["rain"] = write_run(run, meta["grid"], last, args.out)
    except (RuntimeError, AssertionError, urllib.error.URLError) as e:
        print(f"rain failed: {e}", file=sys.stderr)
        return keep("unavailable")
    meta_path.write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
