import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PORT, resolvePort } from "../../src/port";

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
