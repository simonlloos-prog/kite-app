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

A run comes out step by step over about 50 min. With --reuse-from and --meta-only, it is published
as soon as FIRST_STEP is out, then completed on each pass: meta.json then lists the hours of the new
run followed by the later hours of what was published before, and "runThrough" gives the last hour
of the new run until it is complete.
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
# A run comes out about 3 h after its time: earlier steps are already in the past, never shown.
FIRST_STEP = 3
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
    """Most recent run (every 3 h) with this step already published."""
    now = datetime.now(timezone.utc)
    t = now.replace(hour=now.hour - now.hour % 3, minute=0, second=0, microsecond=0)
    for _ in range(8):
        run = t.strftime("%Y-%m-%dT%H:%M:%SZ")
        if exists(file_url(run, max_step)):
            return run
        t -= timedelta(hours=3)
    sys.exit("No AROME run found in the last 24 h")


def available_steps(run: str, max_step: int) -> int:
    """How many consecutive steps of this run, from +0 h, are out."""
    with ThreadPoolExecutor(12) as pool:
        found = list(pool.map(lambda s: exists(file_url(run, s)), range(max_step + 1)))
    return found.index(False) if False in found else len(found)


def download(url: str, dest: Path) -> Path:
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "kite-app-pipeline"})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
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


def reuse_published(base: str, run: str, grid: dict, out: Path, copy_files: bool = True) -> bool:
    """Reuse the published data when it is already this run on this grid.

    AROME runs every 3 h but AROME-PI every hour: this keeps the hourly update to a few MB
    instead of 1.2 GB of GRIB files. Without copy_files, only meta.json is written: the hour
    files stay where they are published (R2) and are not uploaded again.
    """
    meta = read_published(base)
    if meta is None:
        return False
    folder = data_folder(run, grid)
    if meta.get("run") != run or meta.get("grid") != grid or not all(f.startswith(f"{folder}/") for f in meta["files"]):
        return False
    for name in meta["files"] if copy_files else ():
        dest = out / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        download(f"{base}/{name}", dest)
    meta.pop("pi", None)  # Rebuilt by fetch_aromepi.py.
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"run {run} already published: reused {len(meta['files'])} hour files{'' if copy_files else ' (left in place)'}")
    return True


def hour_of(run_time: datetime, step: int) -> str:
    return (run_time + timedelta(hours=step)).strftime("%Y-%m-%dT%H:%MZ")


def write_hours(run: str, steps: list[int], folder: str, out: Path, shape: tuple[int, int]) -> tuple[list[str], list[str]]:
    """Download these steps and write their hour files: their validity times and file names."""
    (out / folder).mkdir(parents=True, exist_ok=True)
    run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    times, files = [], []
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(6) as pool:
        downloads = {s: pool.submit(download, file_url(run, s), Path(tmp) / f"{s:02d}.grib2") for s in steps}
        for s in steps:
            path = downloads[s].result()
            fields = read_fields(path)
            path.unlink()
            name = f"{folder}/h{s:02d}.bin"
            (out / name).write_bytes(encode(fields, shape))
            times.append(hour_of(run_time, s))
            files.append(name)
            print(f"  +{s:02d}h ok")
    return times, files


def read_published(base: str) -> dict | None:
    """meta.json currently online, None when nothing is published yet.

    Any other failure stops the pipeline: publishing without it would drop the later hours
    of the previous run and download the whole new run again on every pass.
    Cloudflare answers 403 (error 1010) to Python's default User-Agent: send our own.
    """
    req = urllib.request.Request(f"{base}/meta.json", headers={"User-Agent": "kite-app-pipeline"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        sys.exit(f"cannot read the published meta.json: HTTP {e.code}")


def publish_progress(base: str, run: str, max_step: int, grid: dict, out: Path) -> None:
    """Write the steps of this run not published yet, and a meta.json with every hour known.

    Only the new hour files are written: the others stay where they are published (R2).
    """
    pub = read_published(base)
    same_grid = pub is not None and pub.get("grid") == grid
    folder = data_folder(run, grid)
    have = sum(f.startswith(f"{folder}/") for f in pub["files"]) if same_grid and pub.get("run") == run else 0
    available = available_steps(run, max_step)

    if have >= available or (not have and available <= min(FIRST_STEP, max_step)):
        if pub is None:
            sys.exit(f"run {run}: nothing published and only {available} steps out")
        pub.pop("pi", None)  # Rebuilt by fetch_aromepi.py.
        (out / "meta.json").write_text(json.dumps(pub, indent=1))
        print(f"run {run}: nothing new ({available} steps out, {have} published)")
        return

    run_time = datetime.strptime(run, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    new_times, new_files = write_hours(run, list(range(have, available)), folder, out, (grid["rows"], grid["cols"]))
    last = hour_of(run_time, available - 1)
    times = [hour_of(run_time, s) for s in range(have)] + new_times
    files = [f"{folder}/h{s:02d}.bin" for s in range(have)] + new_files
    # Beyond the new run: the hours already published, until it reaches them.
    tail = [(t, f) for t, f in zip(pub["times"], pub["files"]) if t > last] if same_grid else []
    meta = {
        "model": MODEL,
        "run": run,
        "grid": grid,
        "scale": SCALE,
        "times": times + [t for t, _ in tail],
        "files": files + [f for _, f in tail],
    }
    if available <= MAX_STEP:
        meta["runThrough"] = last
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"run {run}: +{have} to +{available - 1} h added, {len(tail)} later hours kept from the previous data")


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
    p.add_argument(
        "--meta-only",
        action="store_true",
        help="with --reuse-from: publish the run progressively, writing only the hour files not published yet",
    )
    args = p.parse_args()

    progressive = bool(args.reuse_from and args.meta_only)
    run = args.run or latest_run(min(FIRST_STEP, args.max_step) if progressive else args.max_step)
    print(f"run {run}")
    rows = round((BOX["north"] - BOX["south"]) / STEP) + 1
    cols = round((BOX["east"] - BOX["west"]) / STEP) + 1
    grid = {"south": BOX["south"], "west": BOX["west"], "step": STEP, "rows": rows, "cols": cols}
    args.out.mkdir(parents=True, exist_ok=True)
    if progressive:
        publish_progress(args.reuse_from, run, args.max_step, grid, args.out)
        return
    if args.reuse_from and reuse_published(args.reuse_from, run, grid, args.out):
        return
    times, files = write_hours(run, list(range(args.max_step + 1)), data_folder(run, grid), args.out, (rows, cols))

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
