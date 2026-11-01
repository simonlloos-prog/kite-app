"""Download the latest AROME 0.01° run from Météo-France open data and cut the kite area.

Output, read by the app (see src/lib/wind/arome.ts):
  <out>/meta.json          run, grid, validity times (UTC) and file list
  <out>/<run>_<grid>/hNN.bin  one file per forecast hour, rows*cols cells each,
                           row 0 = south, col 0 = west:
                             int8  u    (eastward wind, SCALE kn per unit)
                             int8  v    (northward wind)
                             uint8 gust (SCALE kn per unit, 255 = missing)

Source: https://www.data.gouv.fr/datasets/paquets-arome-resolution-0-01deg
(Licence Ouverte 2.0), package SP1: 10 m wind and hourly max gust components.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import eccodes
import numpy as np

BUCKET = "https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt"
MODEL = "AROME 0.01°"
MAX_STEP = 51
# Gironde and Landes coast, Gironde estuary → Capbreton, well offshore and inland to the edge of
# Bordeaux: 231 × 141 points, ~98 KB per hour.
BOX = {"south": 43.55, "north": 45.85, "west": -2.00, "east": -0.60}
STEP = 0.01
SCALE = 0.5  # kn per stored unit: int8 covers ±63.5 kn
MS_TO_KN = 1.943844


def file_url(run: str, step: int) -> str:
    return f"{BUCKET}/{run}/arome/001/SP1/arome__001__SP1__{step:02d}H__{run}.grib2"


def exists(url: str) -> bool:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as r:
            return r.status == 200
    except urllib.error.URLError:
        return False


def latest_run(max_step: int) -> str:
    """Most recent run (every 3 h) whose last wanted step is already published."""
    now = datetime.now(timezone.utc)
    t = now.replace(hour=now.hour - now.hour % 3, minute=0, second=0, microsecond=0)
    for _ in range(8):
        run = t.strftime("%Y-%m-%dT%H:%M:%SZ")
        if exists(file_url(run, max_step)):
            return run
        t -= timedelta(hours=3)
    sys.exit("No complete AROME run found in the last 24 h")


def download(url: str, dest: Path) -> Path:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f, 1 << 20)
            return dest
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  retry {attempt + 1} {url}: {e}", file=sys.stderr)
    raise RuntimeError(f"download failed: {url}")


def read_fields(path: Path) -> dict[str, np.ndarray]:
    """10 m wind and gust components, cropped to BOX, row 0 = south."""
    wanted = {"10u", "10v", "max_10efg", "max_10nfg"}
    out: dict[str, np.ndarray] = {}
    with open(path, "rb") as f:
        while (h := eccodes.codes_grib_new_from_file(f)) is not None:
            try:
                name = eccodes.codes_get(h, "shortName")
                if name not in wanted:
                    continue
                ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
                lat1 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees")
                lon1 = eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees")
                assert eccodes.codes_get(h, "jScansPositively") == 0, "expected north → south rows"
                assert eccodes.codes_get(h, "iScansNegatively") == 0, "expected west → east columns"
                values = eccodes.codes_get_values(h).reshape(nj, ni)
                j_north = round((lat1 - BOX["north"]) / STEP)
                j_south = round((lat1 - BOX["south"]) / STEP)
                i_west = round(((BOX["west"] - lon1) % 360) / STEP)
                i_east = round(((BOX["east"] - lon1) % 360) / STEP)
                out[name] = values[j_north : j_south + 1, i_west : i_east + 1][::-1].copy()
            finally:
                eccodes.codes_release(h)
    return out


def encode(fields: dict[str, np.ndarray], shape: tuple[int, int]) -> bytes:
    def comp(name: str) -> np.ndarray:
        return np.clip(np.round(fields[name] * MS_TO_KN / SCALE), -127, 127).astype(np.int8)

    u, v = comp("10u"), comp("10v")
    if "max_10efg" in fields and "max_10nfg" in fields:
        gust_kn = np.hypot(fields["max_10efg"], fields["max_10nfg"]) * MS_TO_KN
        gust = np.clip(np.round(gust_kn / SCALE), 0, 254).astype(np.uint8)
    else:
        # The analysis (step 0) has no max over the previous hour.
        gust = np.full(shape, 255, np.uint8)
    return u.tobytes() + v.tobytes() + gust.tobytes()


def data_folder(run: str, grid: dict) -> str:
    """Folder of the hour files: run + grid fingerprint.

    Phones cache hour files forever (they never change once published), so a file whose
    content changes must get a new name: republishing a run on another area once served
    old-size files from the cache ("Fichier AROME inattendu").
    """
    fingerprint = hashlib.sha1(json.dumps(grid, sort_keys=True).encode()).hexdigest()[:8]
    return f"{run.replace(':', '')}_{fingerprint}"


def reuse_published(base: str, run: str, grid: dict, out: Path) -> bool:
    """Copy the published hour files when they are already this run on this grid.

    AROME runs every 3 h but AROME-PI every hour: this keeps the hourly update to a few MB
    instead of 1.2 GB of GRIB files.
    """
    try:
        with urllib.request.urlopen(f"{base}/meta.json", timeout=30) as r:
            meta = json.load(r)
    except (urllib.error.URLError, ValueError):
        return False
    folder = data_folder(run, grid)
    if meta.get("run") != run or meta.get("grid") != grid or not all(f.startswith(f"{folder}/") for f in meta["files"]):
        return False
    for name in meta["files"]:
        dest = out / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        download(f"{base}/{name}", dest)
    meta.pop("pi", None)  # Rebuilt by fetch_aromepi.py.
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"run {run} already published: reused {len(meta['files'])} hour files")
    return True


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--max-step", type=int, default=MAX_STEP, help="last forecast hour (lower it to test)")
    p.add_argument("--run", help="run to use, e.g. 2026-11-01T15:00:00Z (default: latest complete)")
    p.add_argument(
        "--reuse-from",
        help="published data URL (…/data): when it already holds the latest run on the same grid, "
        "copy it instead of downloading the GRIB files again",
    )
    args = p.parse_args()

    run = args.run or latest_run(args.max_step)
    print(f"run {run}")
    rows = round((BOX["north"] - BOX["south"]) / STEP) + 1
    cols = round((BOX["east"] - BOX["west"]) / STEP) + 1
    grid = {"south": BOX["south"], "west": BOX["west"], "step": STEP, "rows": rows, "cols": cols}
    if args.reuse_from and reuse_published(args.reuse_from, run, grid, args.out):
        return
    run_dir = args.out / data_folder(run, grid)
    run_dir.mkdir(parents=True, exist_ok=True)
    run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)

    steps = list(range(args.max_step + 1))
    times, files = [], []
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(6) as pool:
        downloads = {s: pool.submit(download, file_url(run, s), Path(tmp) / f"{s:02d}.grib2") for s in steps}
        for s in steps:
            path = downloads[s].result()
            fields = read_fields(path)
            path.unlink()
            name = f"{run_dir.name}/h{s:02d}.bin"
            (args.out / name).write_bytes(encode(fields, (rows, cols)))
            times.append((run_time + timedelta(hours=s)).strftime("%Y-%m-%dT%H:%MZ"))
            files.append(name)
            print(f"  +{s:02d}h ok")

    meta = {
        "model": MODEL,
        "run": run,
        "grid": grid,
        "scale": SCALE,
        "times": times,
        "files": files,
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {len(files)} hours, {rows}x{cols} cells, to {args.out}")


if __name__ == "__main__":
    main()
