"""Add the latest MFWAM 0.025° wave forecast to the data written by fetch_arome.py.

MFWAM is Météo-France's wave model. Its open-data run (4 a day, 00/06/12/18 UTC, up to +51 h)
comes out in one block 4 h 30 to 5 h 20 after its time, on the same bucket as AROME. We keep, on
the MFWAM grid cut to BOX (0.025°, its own lattice, coarser than AROME):
  hs   significant height of combined wind waves and swell   (discipline 10, cat 0, number 3)
  tp   peak wave period                                      (10, 0, 34)
  dir  direction of the dominant waves, where they come from: of the wind sea (10, 0, 4) or of
       the primary swell (10, 0, 194, Météo-France local), whichever is higher (10, 0, 5 and 192)
The local numbers 192-197 are, from their values, the primary (192 height, 194 direction,
195 period) and secondary swell (193, 196, 197). The primary swell alone went wrong when a storm
came in (22 nov. 2026): 3.6 m of wind sea from the west, and a 0.2 m swell from the south shown
as the direction of the whole 3.6 m. The mean direction (10, 0, 14) mixes both: a 1 m wind sea
from the south and a 1.2 m swell from the west gave the south-west. The dominant one goes with
the peak period, which is that of the highest waves too, like Windguru's direction.
Then, for the card of a tapped wave label (since 23 nov. 2026), the three wave systems, each
with its height, mean period and direction (where it comes from):
  sea_h, sea_tp, sea_dir   wind sea                 (10, 0, 5), (10, 0, 6), (10, 0, 4)
  sw1_h, sw1_tp, sw1_dir   primary swell            (10, 0, 192), (10, 0, 195), (10, 0, 194)
  sw2_h, sw2_tp, sw2_dir   secondary swell          (10, 0, 193), (10, 0, 197), (10, 0, 196)
A system missing at a sea cell (no swell) is written as 0 m.

Output, next to the AROME files:
  <out>/wave-<run>_<grid>.bin  uint8, hours one after another, then fields in FIELDS order, then
                         rows (row 0 = south) and columns (col 0 = west). 255 = land (no value)
                         for every field. Heights (hs, *_h) in HS_SCALE m, periods (tp, *_tp) in
                         TP_SCALE s, directions (dir, *_dir) in 360/256°.
  <out>/meta.json        gains a "wave" entry: run, grid, fields, validity times (UTC), file name

With --reuse-from, a run already published is kept as it is (its file stays in R2), and so is
the published one when the bucket fails: waves only change every 6 h.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import eccodes
import numpy as np

from fetch_arome import BOX, BUCKET, data_folder, download, exists, read_published

MODEL = "MFWAM 0.025°"
STEP = 0.025
MAX_STEP = 51
# The run comes out in one block: this step (the last of the continuous series, +49 and +50
# are missing) tells it is there.
READY_STEP = 48
SYSTEMS = ["sea", "sw1", "sw2"]
FIELDS = ["hs", "tp", "dir"] + [f"{s}_{k}" for s in SYSTEMS for k in ("h", "tp", "dir")]
# GRIB fields read: dir is worked out from the heights and directions of the wind sea and the
# primary swell (dominant_dir).
GRIB = {
    "hs": (10, 0, 3),
    "tp": (10, 0, 34),
    "sea_h": (10, 0, 5),
    "sea_tp": (10, 0, 6),
    "sea_dir": (10, 0, 4),
    "sw1_h": (10, 0, 192),
    "sw1_tp": (10, 0, 195),
    "sw1_dir": (10, 0, 194),
    "sw2_h": (10, 0, 193),
    "sw2_tp": (10, 0, 197),
    "sw2_dir": (10, 0, 196),
}
# How dir is made, in meta.json and in the file name: a run published by an older rule is redone.
DIR_RULE = "dominant"
HS_SCALE = 0.05  # m per unit: up to 12.7 m
TP_SCALE = 0.1  # s per unit: up to 25.4 s
LAND = 255


def file_url(run: str, step: int) -> str:
    return f"{BUCKET}/{run}/vague-surcote/MFWAM/0025/SP1/vague-surcote-MFWAM__0025__SP1__{step:03d}H__{run}.grib2"


def latest_run(now: datetime) -> str | None:
    """Most recent run (every 6 h) already out, None if none in the last day."""
    t = now.replace(hour=now.hour - now.hour % 6, minute=0, second=0, microsecond=0)
    for _ in range(5):
        run = t.strftime("%Y-%m-%dT%H:%M:%SZ")
        if exists(file_url(run, READY_STEP)):
            return run
        t -= timedelta(hours=6)
    return None


def grid_of_box() -> dict:
    rows = round((BOX["north"] - BOX["south"]) / STEP) + 1
    cols = round((BOX["east"] - BOX["west"]) / STEP) + 1
    return {"south": BOX["south"], "west": BOX["west"], "step": STEP, "rows": rows, "cols": cols}


def dominant_dir(g: dict[str, np.ndarray]) -> np.ndarray:
    """Direction of the wind sea or of the primary swell, whichever is higher; either when the
    other is missing (no wind sea, no swell)."""
    sea = np.nan_to_num(g["sea_h"], nan=-1)
    swell = np.nan_to_num(g["sw1_h"], nan=-1)
    d = np.where(sea >= swell, g["sea_dir"], g["sw1_dir"])
    return np.where(np.isnan(d), np.where(sea >= swell, g["sw1_dir"], g["sea_dir"]), d)


def read_fields(path: Path) -> dict[str, np.ndarray]:
    """FIELDS cropped to BOX, row 0 = south, NaN on land."""
    g = read_grib(path)
    return {**g, "dir": dominant_dir(g)}


def read_grib(path: Path) -> dict[str, np.ndarray]:
    """GRIB fields cropped to BOX, row 0 = south, NaN on land."""
    wanted = {v: k for k, v in GRIB.items()}
    out: dict[str, np.ndarray] = {}
    with open(path, "rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            try:
                key = tuple(eccodes.codes_get(h, k) for k in ("discipline", "parameterCategory", "parameterNumber"))
                if key not in wanted:
                    continue
                ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
                lat1 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees")
                lon1 = eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees")
                assert eccodes.codes_get(h, "jScansPositively") == 0, "expected north → south rows"
                assert eccodes.codes_get(h, "iScansNegatively") == 0, "expected west → east columns"
                missing = eccodes.codes_get(h, "missingValue")
                values = eccodes.codes_get_values(h).reshape(nj, ni)
                values = np.where(values == missing, np.nan, values)
                out[wanted[key]] = crop(values, lat1, lon1)
            finally:
                eccodes.codes_release(h)
    absent = set(GRIB) - set(out)
    if absent:
        raise RuntimeError(f"{path.name}: no {', '.join(sorted(absent))}")
    return out


def crop(values: np.ndarray, lat1: float, lon1: float) -> np.ndarray:
    """BOX out of a north → south, west → east grid starting at (lat1, lon1), row 0 = south."""
    j_north = round((lat1 - BOX["north"]) / STEP)
    j_south = round((lat1 - BOX["south"]) / STEP)
    i_west = round(((BOX["west"] - lon1) % 360) / STEP)
    i_east = round(((BOX["east"] - lon1) % 360) / STEP)
    return values[j_north : j_south + 1, i_west : i_east + 1][::-1].copy()


def kind(name: str) -> str:
    """height, period or direction, from the field name."""
    return "dir" if name.endswith("dir") else "tp" if name.endswith("tp") else "h"


def encode(fields: dict[str, np.ndarray]) -> bytes:
    land = np.isnan(fields["hs"])

    def one(name: str) -> np.ndarray:
        v = np.nan_to_num(fields[name])  # A system missing at a sea cell: 0 m.
        if kind(name) == "dir":
            # 0-255 for 0-360°: every value is a direction, land is told by hs.
            return np.round(v / 360 * 256) % 256
        return np.clip(np.round(v / (TP_SCALE if kind(name) == "tp" else HS_SCALE)), 0, 254)

    return b"".join(np.where(land, LAND, one(f)).astype(np.uint8).tobytes() for f in FIELDS)


MAX_GAP = 3  # hours: +48 → +51, the steps Météo-France never publishes


def fill_gaps(by_step: dict[int, dict[str, np.ndarray]]) -> list[int]:
    """Missing hours between two published ones (+49 and +50), linearly in time: otherwise the
    map is blank for two hours. Direction through its unit vector, so 350° and 10° give 0°."""
    filled = []
    known = sorted(by_step)
    for a, b in zip(known, known[1:]):
        if b - a < 2 or b - a > MAX_GAP:
            continue
        fa, fb = by_step[a], by_step[b]
        for s in range(a + 1, b):
            t = (s - a) / (b - a)

            def mix(k: str) -> np.ndarray:
                if kind(k) != "dir":
                    return (1 - t) * fa[k] + t * fb[k]
                ra, rb = np.radians(fa[k]), np.radians(fb[k])
                e = (1 - t) * np.sin(ra) + t * np.sin(rb)
                n = (1 - t) * np.cos(ra) + t * np.cos(rb)
                return np.degrees(np.arctan2(e, n)) % 360

            by_step[s] = {k: mix(k) for k in FIELDS}
            filled.append(s)
    return filled


def write_run(run: str, steps: list[int], grid: dict, out: Path) -> dict:
    """Download these steps and write the run file: the "wave" entry of meta.json."""
    run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    shape = (grid["rows"], grid["cols"])
    by_step: dict[int, dict[str, np.ndarray]] = {}
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(6) as pool:
        downloads = {s: pool.submit(download, file_url(run, s), Path(tmp) / f"{s:03d}.grib2") for s in steps}
        for s in steps:
            path = downloads[s].result()
            by_step[s] = read_fields(path)
            path.unlink()
            assert by_step[s]["hs"].shape == shape, f"+{s} h: grid {by_step[s]['hs'].shape}, expected {shape}"
    filled = fill_gaps(by_step)
    parts = [encode(by_step[s]) for s in sorted(by_step)]
    times = [f"{run_time + timedelta(hours=s):%Y-%m-%dT%H:%MZ}" for s in sorted(by_step)]
    if filled:
        print(f"  interpolated: {', '.join(f'+{s} h' for s in filled)}")
    # Grid and fields fingerprint in the name: phones cache these files forever.
    name = f"wave-{data_folder(run, {**grid, 'fields': FIELDS, 'dir': DIR_RULE})}.bin"
    (out / name).write_bytes(b"".join(parts))
    print(f"wrote {name}, {len(times)} hours, {len(b''.join(parts)) // 1024} KB")
    return {
        "model": MODEL,
        "run": run,
        "grid": grid,
        "fields": FIELDS,
        "dir": DIR_RULE,
        "scales": {"hs": HS_SCALE, "tp": TP_SCALE},
        "times": times,
        "file": name,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="folder holding meta.json from fetch_arome.py")
    p.add_argument("--reuse-from", help="published data URL (…/data): keep its wave run when it is the latest")
    p.add_argument("--run", help="run to use, e.g. 2026-11-14T06:00:00Z (default: latest out)")
    args = p.parse_args()

    meta_path = args.out / "meta.json"
    meta = json.loads(meta_path.read_text())
    published = (read_published(args.reuse_from) or {}).get("wave") if args.reuse_from else None
    grid = grid_of_box()
    now = datetime.now(timezone.utc)

    def keep(why: str) -> None:
        if published and published.get("grid") == grid:
            meta["wave"] = published
            print(f"MFWAM {why}: kept the published run {published['run']}")
        else:
            meta.pop("wave", None)
            print(f"MFWAM {why}: no wave data")
        meta_path.write_text(json.dumps(meta, indent=1))

    try:
        run = args.run or latest_run(now)
        if run is None:
            return keep("no run out in the last day")
        if published and published.get("run") == run and published.get("grid") == grid and published.get("dir") == DIR_RULE and published.get("fields") == FIELDS:
            return keep(f"run {run} already published")
        print(f"MFWAM run {run}")
        run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        # Hours already past are never shown: from the hour before now.
        first = max(1, int((now - run_time).total_seconds() // 3600) - 1) if not args.run else 1
        with ThreadPoolExecutor(12) as pool:
            out_steps = [s for s, ok in zip(range(first, MAX_STEP + 1), pool.map(lambda s: exists(file_url(run, s)), range(first, MAX_STEP + 1))) if ok]
        meta["wave"] = write_run(run, out_steps, grid, args.out)
    except (RuntimeError, AssertionError, urllib.error.URLError) as e:
        print(f"MFWAM failed: {e}", file=sys.stderr)
        return keep("unavailable")
    meta_path.write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
