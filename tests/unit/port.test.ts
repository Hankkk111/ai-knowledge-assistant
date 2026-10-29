import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PORT, describeListenError, resolvePort } from "../../src/port";

test("resolvePort defaults to 3000 when PORT is unset or blank", () => {
  assert.equal(DEFAULT_PORT, 3000);
  assert.equal(resolvePort({}), DEFAULT_PORT);
  assert.equal(resolvePort({ PORT: "   " }), DEFAULT_PORT);
});

test("resolvePort uses a valid PORT value", () => {
  assert.equal(resolvePort({ PORT: "8080" }), 8080);
  assert.equal(resolvePort({ PORT: " 4000 " }), 4000);
  assert.equal(resolvePort({ PORT: "65535" }), 65535);
});

test("resolvePort falls back to the default for invalid PORT values", () => {
  for (const value of ["abc", "0", "65536", "-1", "3000.5", "1e3", "80abc"]) {
    assert.equal(resolvePort({ PORT: value }), DEFAULT_PORT, `PORT=${value}`);
  }
});

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

test("describeListenError explains a port that is already in use", () => {
  assert.match(describeListenError(errnoError("EADDRINUSE"), 3000) ?? "", /Port 3000 is already in use/);
});

test("describeListenError explains a privileged port", () => {
  assert.match(describeListenError(errnoError("EACCES"), 80) ?? "", /Permission denied to listen on port 80/);
});

test("describeListenError leaves other errors to be rethrown", () => {
  assert.equal(describeListenError(errnoError("ENOTFOUND"), 3000), undefined);
});
