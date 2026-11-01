"""Add the latest AROME-PI gusts (next 6 hours) to the data written by fetch_arome.py.

AROME-PI is Météo-France's hourly "immediate forecast" run. Through the API it has no mean
wind, only gusts: we take WIND_SPEED_GUST at 10 m, the max gust over the past hour, which is
exactly what AROME 0.01° gives as gust. The app compares the two to say whether the fresher
run expects stronger or weaker gusts.

Output, next to the AROME files:
  <out>/pi-<run>.bin   uint8 per cell and hour (SCALE kn per unit, 255 = missing),
                       hours one after another, same grid and layout as the AROME hours
  <out>/meta.json      gains a "pi" entry: run, validity times (UTC) and file name

Needs METEOFRANCE_API_KEY (an "API Key" from portail-api.meteofrance.fr, subscribed to
AROME-PI). Without it, or if the API fails, the AROME data is left untouched.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import eccodes
import numpy as np

from fetch_arome import MS_TO_KN, SCALE

WCS = "https://public-api.meteofrance.fr/public/aromepi/1.0/wcs/MF-NWP-HIGHRES-AROMEPI-001-FRANCE-WCS"
LAYER = "WIND_SPEED_GUST__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND"
HOURS = 6


def get(url: str, key: str) -> bytes:
    req = urllib.request.Request(url, headers={"apikey": key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  retry {attempt + 1}: {e}", file=sys.stderr)
    raise RuntimeError(f"AROME-PI request failed: {url.split('?')[0]}")


def latest_run(key: str) -> str:
    caps = get(f"{WCS}/GetCapabilities?service=WCS&version=2.0.1&language=fre", key).decode()
    runs = re.findall(rf"<wcs:CoverageId>{LAYER}___([0-9T.:-]+Z)</wcs:CoverageId>", caps)
    if not runs:
        raise RuntimeError("no AROME-PI gust coverage in the capabilities")
    return max(runs)


def gust_grid(key: str, run: str, valid: datetime, grid: dict) -> np.ndarray:
    """Gust in knots over the AROME grid (row 0 = south), NaN where not covered."""
    north = grid["south"] + (grid["rows"] - 1) * grid["step"]
    east = grid["west"] + (grid["cols"] - 1) * grid["step"]
    query = urllib.parse.urlencode(
        [
            ("service", "WCS"),
            ("version", "2.0.1"),
            ("coverageid", f"{LAYER}___{run}"),
            ("subset", f"time({valid:%Y-%m-%dT%H:%M:%SZ})"),
            ("subset", f"lat({grid['south']:.2f},{north:.2f})"),
            ("subset", f"long({grid['west']:.2f},{east:.2f})"),
            ("subset", "height(10)"),
            ("format", "application/wmo-grib"),
        ]
    )
    h = eccodes.codes_new_from_message(get(f"{WCS}/GetCoverage?{query}", key))
    try:
        ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
        lat1 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees")
        lon1 = (eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees") + 180) % 360 - 180
        assert eccodes.codes_get(h, "jScansPositively") == 0, "expected north → south rows"
        values = eccodes.codes_get_values(h).reshape(nj, ni) * MS_TO_KN
    finally:
        eccodes.codes_release(h)
    # Place the tile on the AROME grid: same 0.01° lattice, offsets from the corners.
    out = np.full((grid["rows"], grid["cols"]), np.nan)
    r_top = round((lat1 - grid["south"]) / grid["step"])
    c_left = round((lon1 - grid["west"]) / grid["step"])
    for j in range(nj):
        r = r_top - j
        if 0 <= r < grid["rows"]:
            c0, c1 = max(0, c_left), min(grid["cols"], c_left + ni)
            out[r, c0:c1] = values[j, c0 - c_left : c1 - c_left]
    return out


def key_from_env_file() -> str:
    """Local runs: the key lives in .env.local at the repo root (ignored by git)."""
    path = Path(__file__).resolve().parent.parent / ".env.local"
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "METEOFRANCE_API_KEY":
            return value.strip().strip("\"'")
    return ""


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="folder holding meta.json from fetch_arome.py")
    args = p.parse_args()

    key = os.environ.get("METEOFRANCE_API_KEY", "").strip() or key_from_env_file()
    if not key:
        print("METEOFRANCE_API_KEY not set: skipping AROME-PI")
        return
    meta_path = args.out / "meta.json"
    meta = json.loads(meta_path.read_text())
    grid = meta["grid"]

    try:
        run = latest_run(key)
        print(f"AROME-PI run {run}")
        run_time = datetime.strptime(run, "%Y-%m-%dT%H.%M.%SZ").replace(tzinfo=timezone.utc)
        hours, times = [], []
        for s in range(1, HOURS + 1):
            valid = run_time + timedelta(hours=s)
            hours.append(gust_grid(key, run, valid, grid))
            times.append(f"{valid:%Y-%m-%dT%H:%MZ}")
            print(f"  +{s}h ok")
    except (RuntimeError, AssertionError, eccodes.GribInternalError) as e:
        print(f"AROME-PI skipped: {e}", file=sys.stderr)
        return

    stacked = np.stack(hours)
    data = np.where(np.isnan(stacked), 255, np.clip(np.round(stacked / SCALE), 0, 254)).astype(np.uint8)
    name = f"pi-{run.replace('.', '')}.bin"
    (args.out / name).write_bytes(data.tobytes())
    meta["pi"] = {"run": f"{run_time:%Y-%m-%dT%H:%M:%SZ}", "times": times, "file": name}
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f"wrote {name}, {len(times)} hours")


if __name__ == "__main__":
    main()
