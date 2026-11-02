"""Add the tide at the Bassin d'Arcachon inlet to the data written by fetch_arome.py.

Open-Meteo Marine (no key, CC BY 4.0): hourly sea level above mean sea level, tide and surge,
at the grid point off the Cap Ferret. The model is coarse and sits outside the Bassin, so the
app only uses where each hour falls between low and high water, not the heights themselves:
it greys the Bassin when the tide is too low to sail.

Output: <out>/meta.json gains a "tide" entry: hourly times (UTC, same format as "times") and
heights in metres, from a day before the run to a day past its last hour, so that the app
always sees a low and a high water around any hour. Without it, the Bassin is never greyed.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

POINT = (44.625, -1.25)
URL = (
    "https://marine-api.open-meteo.com/v1/marine?latitude={}&longitude={}"
    "&hourly=sea_level_height_msl&timezone=GMT&past_days=2&forecast_days=4"
)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, required=True, help="folder holding meta.json from fetch_arome.py")
    args = p.parse_args()

    meta_path = args.out / "meta.json"
    meta = json.loads(meta_path.read_text())
    try:
        with urllib.request.urlopen(URL.format(*POINT), timeout=60) as r:
            hourly = json.load(r)["hourly"]
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
        print(f"tide unavailable: {e}", file=sys.stderr)
        return

    # Keep a day either side of the AROME hours: enough for a full tide cycle around each.
    first, last = meta["times"][0], meta["times"][-1]
    times, heights = [], []
    for t, h in zip(hourly["time"], hourly["sea_level_height_msl"]):
        t += "Z"
        if h is not None and _hours(first, t) >= -24 and _hours(t, last) >= -24:
            times.append(t)
            heights.append(round(h, 2))
    meta["tide"] = {"times": times, "heights": heights}
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f"tide: {len(times)} hours")


def _hours(a: str, b: str) -> float:
    """Hours from a to b, both "YYYY-MM-DDTHH:MMZ"."""
    fmt = "%Y-%m-%dT%H:%MZ"
    return (datetime.strptime(b, fmt) - datetime.strptime(a, fmt)).total_seconds() / 3600


if __name__ == "__main__":
    main()
