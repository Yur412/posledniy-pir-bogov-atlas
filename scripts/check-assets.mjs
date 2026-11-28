import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanExt = new Set([".html", ".css", ".js"]);
const ignoreDirs = new Set([".git", "node_modules", ".github"]);
const sources = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!ignoreDirs.has(ent.name)) walk(path.join(dir, ent.name));
    } else if (scanExt.has(path.extname(ent.name).toLowerCase())) {
      sources.push(path.join(dir, ent.name));
    }
  }
}
walk(root);

const missing = new Set();
const adobe = [];
const localRefs = [];
const refPattern = /(?:src|href)\\s*=\\s*["']([^"']+)["']|url\\(\\s*["']?([^)'" ]+)["']?\\s*\\)/gi;
for (const file of sources) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  while ((match = refPattern.exec(text))) {
    const ref = (match[1] || match[2] || "").trim();
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|#|\\/\\/|data:|atlasdata:)/i.test(ref)) {
      if (/^https?:\\/\\/(?:www\\.)?at\\.adobe\\.com\\//i.test(ref)) adobe.push({ file: path.relative(root, file), ref });
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
console.log(`Scanned ${sources.length} HTML/CSS/JS files; found ${localRefs.length} local resource references.`);
if (missing.size) {
  console.error("Missing local resources:");
  for (const file of [...missing].sort()) console.error(" - " + file);
  process.exitCode = 1;
} else {
  console.log("PASS: all explicitly referenced local resources exist.");
}
if (adobe.length) {
  console.warn(`WARNING: ${adobe.length} Adobe-hosted links remain (external availability is not checked).`);
  for (const item of adobe) console.warn(` - ${item.file}: ${item.ref}`);
}
