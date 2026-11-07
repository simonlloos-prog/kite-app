"""Add the latest wind measured at stations near the spots to the data written by fetch_arome.py.

- Météo-France "Données Publiques Observation" API (DPObs, same key as AROME-PI): the last
  6-minute record of a few stations. Other stations in the area are inland, or have no
  anemometer (Lacanau, Soorts-Hossegor). Gusts are rarely filled in: kept when present.
- Weameter, Andernos and Lachanau (private stations, Weameter agreed): their live file, no key. It also gives
  the instant wind; the 10-minute mean and max gust compare with Météo-France's 10-minute mean.
- Holfuy beacons (their owners agreed): the file Holfuy's station page draws its graphs from,
  no key. Not an API: it may change without notice, and the beacon then just goes missing.
  About 5 days, one reading every 2 min, km/h as integers, times in Paris local time. We take
  the last 10 minutes: mean speed, max gust, mean direction.

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
import math
import re
from datetime import datetime, timedelta, timezone
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
WEAMETER = "https://weameter.com/stations/{}/windrtv2.json"
# Station slug → name and position (from its page: not in the live file).
WEAMETER_STATIONS = {
    "andernos": ("Andernos", 44.744, -1.102),
    "lachanau": ("Lachanau", 45.165, -1.076),
}
HOLFUY = "https://holfuy.com/dynamic/graphs/tdarr{}.js"
# Beacon id → name and position (from its page's map link).
BEACONS = {
    "1995": ("CVA", 44.660952, -1.144144),
    "1383": ("Les Arbousiers", 44.64617, -1.19999),
    "1491": ("La Hume", 44.64542, -1.11327),
    "1317": ("La Jenny", 44.8566, -1.21987),
}
KMH_TO_KN = 1 / 1.852


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


def weameter(slug: str) -> dict | None:
    """Weameter's live file: knots, epoch seconds; Average["0"] is the last 10 minutes.
    The server only answers compressed requests (406 otherwise)."""
    name, lat, lon = WEAMETER_STATIONS[slug]
    req = urllib.request.Request(WEAMETER.format(slug), headers={"Accept-Encoding": "gzip", "User-Agent": "kite-app"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            d = json.loads(gzip.decompress(body) if r.headers.get("Content-Encoding") == "gzip" else body)
        last10 = d["Average"]["0"]
        return {
            "id": f"weameter-{slug}",
            "name": name,
            "source": "Weameter",
            "lat": lat,
            "lon": lon,
            "time": datetime.fromtimestamp(d["current"]["epoch"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "speed": round(last10["wspeed"], 1),
            "dir": last10["wdir"],
            "gust": round(last10["gmax"], 1),
        }
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as e:
        print(f"  {name} unavailable: {e}", file=sys.stderr)
        return None


def paris_to_utc(local: datetime) -> datetime:
    """EU rule: summer time (UTC+2) from the last Sunday of March to the last Sunday of
    October, switching at 01:00 UTC. Avoids tzdata, missing from Python on Windows."""

    def last_sunday(month: int) -> datetime:
        d = datetime(local.year, month, 31, 1, tzinfo=timezone.utc)
        return d - timedelta(days=(d.weekday() + 1) % 7)

    for offset in (2, 1):
        utc = (local - timedelta(hours=offset)).replace(tzinfo=timezone.utc)
        if (offset == 2) == (last_sunday(3) <= utc < last_sunday(10)):
            return utc
    return utc


def holfuy(beacon: str) -> dict | None:
    name, lat, lon = BEACONS[beacon]
    req = urllib.request.Request(HOLFUY.format(beacon), headers={"User-Agent": "kite-app"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            js = r.read().decode("utf-8")
        # var unt = ['2026/11/07 17:08:58', ...]; var gd_speed = [5, 6, ...]; ...
        arrays = {k: [x.strip(" '\n") for x in v.split(",")] for k, v in re.findall(r"var\s+(\w+)\s*=\s*\[(.*?)\];", js, re.S)}
        times = [paris_to_utc(datetime.strptime(t.strip(), "%Y/%m/%d %H:%M:%S")) for t in arrays["unt"]]
        speed, gust, dirs = (list(map(float, arrays[k])) for k in ("gd_speed", "gd_gust", "gd_direction"))
        assert len(times) == len(speed) == len(gust) == len(dirs) > 0, "arrays of different lengths"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, AssertionError) as e:
        print(f"  {name} unavailable: {e}", file=sys.stderr)
        return None
    last = [i for i, t in enumerate(times) if t > times[-1] - timedelta(minutes=10)]
    # Mean direction as a vector, weighted by speed: 350° and 10° average to north, not south.
    u = sum(speed[i] * math.sin(math.radians(dirs[i])) for i in last)
    v = sum(speed[i] * math.cos(math.radians(dirs[i])) for i in last)
    return {
        "id": f"holfuy-{beacon}",
        "name": name,
        "source": "Holfuy",
        "lat": lat,
        "lon": lon,
        "time": f"{times[-1]:%Y-%m-%dT%H:%M:%SZ}",
        "speed": round(sum(speed[i] for i in last) / len(last) * KMH_TO_KN, 1),
        "dir": round(math.degrees(math.atan2(u, v)) % 360) if u or v else round(dirs[-1]),
        "gust": round(max(gust[i] for i in last) * KMH_TO_KN, 1),
    }


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
    for o in [*map(weameter, WEAMETER_STATIONS), *map(holfuy, BEACONS)]:
        if o:
            obs.append(o)
            print(f"  {o['name']} {o['time']}: {o['speed']} kn from {o['dir']} deg")
    meta["obs"] = obs
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f"observations: {len(obs)} stations")


if __name__ == "__main__":
    main()
