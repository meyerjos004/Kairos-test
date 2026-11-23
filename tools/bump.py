# KING_CACHEBUST: give every local css/js a fresh ?v= so browsers load the new build (GitHub Pages caches hard)
import re, time, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / "index.html"; s = p.read_text(); v = time.strftime("%m%d%H%M")
s = re.sub(r'((?:href|src)="(?!http)[\w./-]+\.(?:css|js))\?v=[\w.-]+"', lambda m: f'{m.group(1)}?v={v}"', s)
p.write_text(s); print("bumped to", v)
