import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const SCRIPT = join(__dirname, "../../scripts/health-check.sh");

// Only argument handling is tested here: both cases exit before the script
// makes any HTTP request, so no server is needed.
function run(...args: string[]) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

describe("scripts/health-check.sh arguments", () => {
  test("--help prints usage and exits 0", () => {
    const result = run("--help");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:.*--remote-service/);
  });

  test("an unknown argument exits 2 instead of skipping checks", () => {
    const result = run("--remote-services");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown argument: --remote-services/);
    assert.doesNotMatch(result.stdout + result.stderr, /All checks passed/);
  });
});
