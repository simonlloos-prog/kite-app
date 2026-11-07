"""Add the latest wind measured at stations near the spots to the data written by fetch_arome.py.

- Météo-France "Données Publiques Observation" API (DPObs, same key as AROME-PI): the last
  6-minute record of a few stations. Other stations in the area are inland, or have no
  anemometer (Lacanau, Soorts-Hossegor). Gusts are rarely filled in: kept when present.
- Weameter, Andernos (private station, its owner agreed): its live file, no key. It also gives
  the instant wind; the 10-minute mean and max gust compare with Météo-France's 10-minute mean.

Output: <out>/meta.json gains an "obs" entry: one record per station that measured wind, with
its source, time (ISO UTC), mean speed (kn), direction it blows from (degrees) and gust (kn) if
any. Without a key, or if a request fails, that station is simply missing.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://public-api.meteofrance.fr/public/DPObs/v1/station/infrahoraire-6m?id_station={}&format=json"
MS_TO_KN = 3600 / 1852
# Station id → short name. Ids from the API's station list (liste-stations).
STATIONS = {
    "33236002": "Cap Ferret",
    "33529001": "Cazaux",
    "40046001": "Biscarrosse",
    "33540001": "Vendays-Montalivet",
    "17306004": "Royan",
    "40065002": "Capbreton",
}
WEAMETER = "https://weameter.com/stations/andernos/windrtv2.json"
# Position from the station page: not in its live file.
ANDERNOS = (44.744, -1.102)


def key_from_env_file() -> str:
    """Local runs: the key lives in .env.local at the repo root (ignored by git).
    Same as fetch_aromepi.py, without importing it (and eccodes)."""
    path = Path(__file__).resolve().parent.parent / ".env.local"
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "METEOFRANCE_API_KEY":
            return value.strip().strip("\"'")
    return ""


def latest(key: str, station: str) -> dict | None:
    req = urllib.request.Request(API.format(station), headers={"apikey": key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                records = json.load(r)
            return records[0] if records else None
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            print(f"  {station} retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(2)
    return None


def andernos() -> dict | None:
    """Weameter's live file: knots, epoch seconds; Average["0"] is the last 10 minutes.
    The server only answers compressed requests (406 otherwise)."""
    req = urllib.request.Request(WEAMETER, headers={"Accept-Encoding": "gzip", "User-Agent": "kite-app"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            d = json.loads(gzip.decompress(body) if r.headers.get("Content-Encoding") == "gzip" else body)
        last10 = d["Average"]["0"]
        return {
            "id": "weameter-andernos",
            "name": "Andernos",
            "source": "Weameter",
            "lat": ANDERNOS[0],
            "lon": ANDERNOS[1],
            "time": datetime.fromtimestamp(d["current"]["epoch"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "speed": round(last10["wspeed"], 1),
            "dir": last10["wdir"],
            "gust": round(last10["gmax"], 1),
        }
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as e:
        print(f"  Andernos unavailable: {e}", file=sys.stderr)
        return None


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="folder holding meta.json from fetch_arome.py")
    args = p.parse_args()

    meta_path = args.out / "meta.json"
    meta = json.loads(meta_path.read_text())

    obs = []
    key = os.environ.get("METEOFRANCE_API_KEY", "").strip() or key_from_env_file()
    if not key:
        print("METEOFRANCE_API_KEY not set: skipping Météo-France stations")
    for station, name in STATIONS.items() if key else ():
        r = latest(key, station)
        if not r or r.get("ff") is None or r.get("dd") is None:
            print(f"  {name}: no wind")
            continue
        o = {
            "id": station,
            "name": name,
            "source": "Météo-France",
            "lat": r["lat"],
            "lon": r["lon"],
            "time": r["validity_time"],
            "speed": round(r["ff"] * MS_TO_KN, 1),
            "dir": r["dd"],
        }
        if r.get("fxi10") is not None:
            o["gust"] = round(r["fxi10"] * MS_TO_KN, 1)
        obs.append(o)
        print(f"  {name} {o['time']}: {o['speed']} kn from {o['dir']} deg")
    if o := andernos():
        obs.append(o)
        print(f"  Andernos {o['time']}: {o['speed']} kn from {o['dir']} deg")
    meta["obs"] = obs
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f"observations: {len(obs)} stations")


if __name__ == "__main__":
    main()
