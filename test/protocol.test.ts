import { test } from "node:test";
import assert from "node:assert/strict";
import { run, NOT_FOUND } from "../src/protocol";
import { Executor, ExecResult } from "../src/gh";
import { ghHostFor } from "../src/registries";

// Obviously fake value; the real `gh` is never invoked in these tests.
const FAKE_TOKEN = "fake-token-for-tests";

function fakeGh(opts: { missing?: boolean; loggedIn?: boolean; login?: string } = {}) {
  const calls: string[][] = [];
  const exec: Executor = async (_cmd, args): Promise<ExecResult> => {
    calls.push(args);
    if (opts.missing) return { code: 127, stdout: "", stderr: "", notFound: true };
    if (opts.loggedIn === false) return { code: 1, stdout: "", stderr: "not logged in" };
    if (args[0] === "auth") return { code: 0, stdout: FAKE_TOKEN + "\n", stderr: "" };
    return { code: 0, stdout: (opts.login ?? "octocat") + "\n", stderr: "" };
  };
  return { exec, calls };
}

test("get returns credentials for ghcr.io", async () => {
  const { exec, calls } = fakeGh();
  const r = await run("get", "https://ghcr.io\n", { exec });
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout), { ServerURL: "https://ghcr.io", Username: "octocat", Secret: FAKE_TOKEN });
  assert.deepEqual(calls[0], ["auth", "token", "--hostname", "github.com"]);
});

test("get accepts docker.pkg.github.com and bare host names", async () => {
  const { exec } = fakeGh();
  for (const url of ["docker.pkg.github.com", "https://docker.pkg.github.com", "ghcr.io", "https://GHCR.IO/v2/"]) {
    const r = await run("get", url, { exec });
    assert.equal(r.code, 0, url);
  }
});

test("get refuses other registries with the standard not-found error", async () => {
  const { exec, calls } = fakeGh();
  for (const url of ["https://index.docker.io/v1/", "https://evil-ghcr.io", "https://ghcr.io.evil.test", "", "::bad::"]) {
    const r = await run("get", url, { exec });
    assert.equal(r.code, 1, url);
    // Docker's client reads this message on STDOUT, not stderr.
    assert.equal(r.stdout.trim(), NOT_FOUND);
    assert.equal(r.stderr, "");
  }
  assert.equal(calls.length, 0, "gh must not be called for unsupported registries");
});

test("get fails cleanly when gh is missing", async () => {
  const r = await run("get", "https://ghcr.io", { exec: fakeGh({ missing: true }).exec });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /gh\) was not found/);
  assert.equal(r.stderr, "");
});

test("get fails cleanly when gh is not logged in, without leaking output", async () => {
  const r = await run("get", "https://ghcr.io", { exec: fakeGh({ loggedIn: false }).exec });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /not logged in/);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(FAKE_TOKEN));
});

test("get fails when the login cannot be determined", async () => {
  const r = await run("get", "https://ghcr.io", { exec: fakeGh({ login: "" }).exec });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /GitHub login/);
});

test("store and erase are silent no-ops that never call gh", async () => {
  const { exec, calls } = fakeGh();
  const payload = JSON.stringify({ ServerURL: "https://ghcr.io", Username: "u", Secret: "s" });
  const r1 = await run("store", payload, { exec });
  const r2 = await run("erase", "https://ghcr.io", { exec });
  assert.deepEqual(r1, { code: 0, stdout: "", stderr: "" });
  assert.deepEqual(r2, { code: 0, stdout: "", stderr: "" });
  assert.equal(calls.length, 0);
});

test("list returns supported registries with the gh login, without requesting the token", async () => {
  const { exec, calls } = fakeGh({ login: "octocat" });
  const r = await run("list", "", { exec });
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout), {
    "https://ghcr.io": "octocat",
    "https://docker.pkg.github.com": "octocat",
  });
  assert.ok(calls.every((a) => a[0] !== "auth"), "list must not call gh auth token");
});

test("list is an empty map when gh is missing or not logged in", async () => {
  for (const opts of [{ missing: true }, { loggedIn: false }]) {
    const r = await run("list", "", { exec: fakeGh(opts).exec });
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.stdout), {});
  }
});

test("get refuses non-https schemes, non-default ports and embedded credentials", async () => {
  const { exec, calls } = fakeGh();
  for (const url of [
    "http://ghcr.io",
    "ftp://ghcr.io",
    "https://ghcr.io:8443/x",
    "ghcr.io:5000",
    "https://user:pass@ghcr.io",
    "https://user@ghcr.io",
    "user@ghcr.io",
  ]) {
    const r = await run("get", url, { exec });
    assert.equal(r.code, 1, url);
    assert.equal(r.stdout.trim(), NOT_FOUND, url);
  }
  assert.equal(calls.length, 0);
});

test("get accepts the explicit default https port", async () => {
  const r = await run("get", "https://ghcr.io:443", { exec: fakeGh().exec });
  assert.equal(r.code, 0);
});

test("unknown command exits non-zero", async () => {
  const r = await run("bogus", "", { exec: fakeGh().exec });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /unknown command/);
});

test("ghHostFor maps supported registries only", () => {
  assert.equal(ghHostFor("https://ghcr.io"), "github.com");
  assert.equal(ghHostFor("https://quay.io"), null);
});
