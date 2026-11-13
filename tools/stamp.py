#!/usr/bin/env python3
"""stamp.py (KING_STAMP, Nov 13 2026): set every local asset's ?v= in index.html to the current commit, so a new
index.html never loads last version's JS/CSS from the browser cache (GitHub Pages caches files ~10 min).
Run right before committing a release:  python3 tools/stamp.py && git commit -am "stamp"
Release note: when moving test -> live, leave out commits titled TEST-ONLY (red icon / KAIROS TEST name)."""
import re, subprocess, pathlib, time
root = pathlib.Path(__file__).resolve().parent.parent
try: v = subprocess.run(["git", "-C", str(root), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip() or str(int(time.time()))
except Exception: v = str(int(time.time()))
p = root / "index.html"; s = p.read_text()
n = 0
def rep(m):
    global n; n += 1; return f'{m.group(1)}="{m.group(2)}?v={v}"'
s = re.sub(r'(src|href)="((?:app|config)\.js|style\.css)(?:\?v=[^"]*)?"', rep, s)
p.write_text(s); print(f"stamped {n} assets with v={v}")
