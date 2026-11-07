"""Add the tide in the Bassin d'Arcachon to the data written by fetch_arome.py.

Source: api-maree.fr (key API_MAREE_KEY, CC BY): hourly water level at Arcachon (Jetée
d'Eyrac), computed from the Ifremer / PREVIMER harmonic constants (CC BY), recalibrated on the
REFMAR tide gauge. Against the SHOM predictions for Eyrac (7-8 Nov. 2026): high and low waters
10 to 17 min early, same coefficients. The credit in the app (ⓘ) is required.

Fallback, without the key or if the API fails: Open-Meteo Marine (no key, CC BY 4.0), sea level
at the grid point off the Cap Ferret. A coarse global model: 1 h 20 to 1 h 40 early on Eyrac.

The app subtracts the series' mean (level above mean sea level, whatever the zero) and uses it
for what dries in the Bassin and where each hour falls between low and high water.

Output: <out>/meta.json gains a "tide" entry: hourly times (UTC, same format as "times"),
heights in metres and their source, from a day before the run to a day past its last hour, so
that the app always sees a low and a high water around any hour. Without it, the Bassin is
never greyed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

FMT = "%Y-%m-%dT%H:%MZ"

API_MAREE = "https://api-maree.fr/water-levels?site=arcachon-jetee-d-eyrac&from={}&to={}&step=60&tz=UTC"

OPEN_METEO_POINT = (44.625, -1.25)
OPEN_METEO = (
    "https://marine-api.open-meteo.com/v1/marine?latitude={}&longitude={}"
    "&hourly=sea_level_height_msl&timezone=GMT&past_days=2&forecast_days=4"
)


def key_from_env_file() -> str:
    """Local runs: the key lives in .env.local at the repo root (ignored by git)."""
    path = Path(__file__).resolve().parent.parent / ".env.local"
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "API_MAREE_KEY":
            return value.strip().strip("\"'")
    return ""


def from_api_maree(key: str, first: datetime, last: datetime) -> list[tuple[str, float]]:
    url = API_MAREE.format(f"{first:%Y-%m-%dT%H:%M}", f"{last:%Y-%m-%dT%H:%M}")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json", "User-Agent": "kite-app"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)["data"]
    # "2026-11-07T00:00:00Z" → "2026-11-07T00:00Z"
    return [(f"{datetime.strptime(d['time'], '%Y-%m-%dT%H:%M:%SZ'):{FMT}}", d["height"]) for d in data]


def from_open_meteo() -> list[tuple[str, float]]:
    with urllib.request.urlopen(OPEN_METEO.format(*OPEN_METEO_POINT), timeout=60) as r:
        hourly = json.load(r)["hourly"]
    return [(t + "Z", h) for t, h in zip(hourly["time"], hourly["sea_level_height_msl"]) if h is not None]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="folder holding meta.json from fetch_arome.py")
    args = p.parse_args()

    meta_path = args.out / "meta.json"
    meta = json.loads(meta_path.read_text())
    # A day either side of the AROME hours: enough for a full tide cycle around each.
    first = datetime.strptime(meta["times"][0], FMT) - timedelta(hours=24)
    last = datetime.strptime(meta["times"][-1], FMT) + timedelta(hours=24)

    series, source = None, None
    key = os.environ.get("API_MAREE_KEY", "").strip() or key_from_env_file()
    if key:
        try:
            series, source = from_api_maree(key, first, last), "api-maree.fr (Eyrac)"
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            print(f"api-maree.fr unavailable, falling back to Open-Meteo: {e}", file=sys.stderr)
    else:
        print("API_MAREE_KEY not set: Open-Meteo instead")
    if series is None:
        try:
            series, source = from_open_meteo(), "Open-Meteo"
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            print(f"tide unavailable: {e}", file=sys.stderr)
            return

    kept = [(t, round(h, 2)) for t, h in series if first <= datetime.strptime(t, FMT) <= last]
    meta["tide"] = {"source": source, "times": [t for t, _ in kept], "heights": [h for _, h in kept]}
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f"tide: {len(kept)} hours from {source}")


if __name__ == "__main__":
    main()
