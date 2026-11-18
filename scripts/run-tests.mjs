// Runs the compiled tests. Lists files explicitly because `node --test` only
// expands glob patterns on Node >= 21, and shells differ across platforms.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "test");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => path.join(dir, f));
if (files.length === 0) {
  console.error("No compiled test files found in " + dir);
  process.exit(1);
}
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
