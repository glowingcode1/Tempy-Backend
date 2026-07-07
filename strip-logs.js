// strip-logs.js — removes all  calls, single or multi-line
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (entry.name.endsWith(".js")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

// Finds  with balanced parens starting at `open` (index of the "(")
function matchBalanced(src, open) {
  let depth = 0,
    inStr = null,
    i = open;
  for (; i < src.length; i++) {
    const c = src[i],
      prev = src[i - 1];
    if (inStr) {
      if (c === inStr && prev !== "\\") inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1; // unbalanced
}

function stripFile(file) {
  let src = fs.readFileSync(file, "utf8");
  let out = "",
    i = 0,
    removed = 0;
  const re = /console\s*\.\s*log\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out += src.slice(i, m.index);
    const openParen = m.index + m[0].length - 1;
    const close = matchBalanced(src, openParen);
    if (close === -1) {
      // unbalanced; bail on this match, keep original
      out += src.slice(m.index, re.lastIndex);
      i = re.lastIndex;
      continue;
    }
    let end = close + 1;
    if (src[end] === ";") end++; // eat trailing semicolon
    // if the call sat alone on its line, drop the whole (now blank) line
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    const before = src.slice(lineStart, m.index);
    const after = src.slice(end).match(/^[^\n]*/)[0];
    if (/^\s*$/.test(before) && /^\s*$/.test(after)) {
      const nl = src.indexOf("\n", end);
      end = nl === -1 ? src.length : nl + 1;
      out = out.slice(0, out.length - before.length); // drop leading indent too
    }
    i = end;
    re.lastIndex = end;
    removed++;
  }
  out += src.slice(i);
  if (removed > 0) {
    fs.writeFileSync(file, out, "utf8");
    console.error(`  ${removed} removed → ${path.relative(ROOT, file)}`);
  }
  return removed;
}

const files = walk(ROOT);
let total = 0;
for (const f of files) total += stripFile(f);
console.error(
  `\nDone. Removed ${total} console.log call(s) across ${files.length} file(s).`,
);
