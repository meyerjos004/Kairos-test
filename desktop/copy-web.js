// Copies the site (repo root) into desktop/web so the app ships the exact version it was built from.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), out = path.join(__dirname, "web"), skip = new Set(["desktop", "tests", "tools", ".github", ".git", "node_modules", "supabase"]);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
let n = 0; (function cp(src, dst) { for (const e of fs.readdirSync(src, { withFileTypes: true })) { if (src === root && (skip.has(e.name) || e.name.startsWith("."))) continue; if (e.name.endsWith(".md") || e.name.endsWith(".py")) continue;
  const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); cp(s, d); } else { fs.copyFileSync(s, d); n++; } } })(root, out);
console.log("copied", n, "files into desktop/web");
