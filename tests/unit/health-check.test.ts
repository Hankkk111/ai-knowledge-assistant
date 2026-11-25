import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = join(__dirname, "../../scripts/health-check.sh");
// Ansible copies this file onto the EC2 host and runs it after each deploy.
const ANSIBLE_SCRIPT = join(__dirname, "../../infra/ansible/roles/app/files/health-check.sh");

describe("infra/ansible health-check.sh", () => {
  // The deployed copy previously fell behind fixes made to scripts/, so the
  // post-deploy check behaved differently from the one CI runs.
  test("is identical to scripts/health-check.sh", () => {
    assert.equal(
      readFileSync(ANSIBLE_SCRIPT, "utf8"),
      readFileSync(SCRIPT, "utf8"),
      "copy scripts/health-check.sh to infra/ansible/roles/app/files/ after editing it"
    );
  });
});

// Argument handling: both cases exit before the script makes any HTTP
// request, so no server is needed.
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

// Runs the script against a local server whose /health answers with `body`.
async function runAgainst(body: string, status = 200) {
  const server = createServer((_req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    // Async spawn: spawnSync would block the event loop and the server could
    // never answer the script's request.
    const child = spawn("bash", [SCRIPT], {
      env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}` },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    return { code, output };
  } finally {
    server.close();
  }
}

describe("scripts/health-check.sh /health check", () => {
  test("passes for the compact body the API sends", async () => {
    const { code, output } = await runAgainst('{"status":"ok"}');
    assert.equal(code, 0, output);
  });

  test("passes when the body has whitespace around the colon", async () => {
    const { code, output } = await runAgainst('{ "status": "ok" }');
    assert.equal(code, 0, output);
  });

  test("fails when the body reports another status", async () => {
    const { code, output } = await runAgainst('{"status": "degraded"}');
    assert.equal(code, 1);
    assert.match(output, /did not report status=ok/);
  });

  test("fails on a non-200 response", async () => {
    const { code, output } = await runAgainst('{"status":"ok"}', 503);
    assert.equal(code, 1);
    assert.match(output, /returned HTTP 503/);
  });
});
