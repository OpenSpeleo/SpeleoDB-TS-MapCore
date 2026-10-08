import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!readFileSync(join(root, "bun.lock"), "utf8").trim()) {
  throw new Error("bun.lock must not be empty.");
}

// A parent workspace must not mask drift in the standalone package lock.
const temporary = mkdtempSync(join(tmpdir(), "speleodb-map-core-lock-"));
try {
  for (const file of ["package.json", "bun.lock", "bunfig.toml"]) {
    copyFileSync(join(root, file), join(temporary, file));
  }
  const result = spawnSync(
    process.execPath,
    ["install", "--frozen-lockfile", "--lockfile-only", "--ignore-scripts"],
    { cwd: temporary, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
