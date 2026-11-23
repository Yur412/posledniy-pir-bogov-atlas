import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanExt = new Set([".html", ".css", ".js"]);
const ignoreDirs = new Set([".git", "node_modules", ".github"]);
const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!ignoreDirs.has(ent.name)) walk(path.join(dir, ent.name));
    } else if (scanExt.has(path.extname(ent.name).toLowerCase())) {
      files.push(path.join(dir, ent.name));
    }
  }
}
walk(root);
const missing = new Set();
const remoteAdobe = [];
const localRefs = [];
const re = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^)'"]+)["']?\s*\)/gi;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  while ((m = re.exec(text))) {
    const ref = (m[1] || m[2] || "").trim();
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(ref)) {
      if (/^https?:\/\/(?:www\.)?at\.adobe\.com\//i.test(ref)) remoteAdobe.push({ file: path.relative(root, file), ref });
      continue;
    }
    const clean = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
    if (!clean) continue;
    const target = path.resolve(clean.startsWith("/") ? root : path.dirname(file), clean.startsWith("/") ? "." + clean : clean);
    if (!target.startsWith(root + path.sep) && target !== root) continue;
    localRefs.push({ file: path.relative(root, file), ref });
    if (!fs.existsSync(target)) missing.add(path.relative(root, target));
  }
}
console.log(`Scanned ${files.length} source files; found ${localRefs.length} local references.`);
if (missing.size) {
  console.error("Missing local resources:");
  for (const p of [...missing].sort()) console.error(" - " + p);
  process.exitCode = 1;
} else console.log("All explicitly referenced local resources exist.");
if (remoteAdobe.length) {
  console.warn(`WARNING: ${remoteAdobe.length} Adobe-hosted links remain; migrate originals before enabling strict mode.`);
  for (const x of remoteAdobe.slice(0, 20)) console.warn(` - ${x.file}: ${x.ref}`);
}
