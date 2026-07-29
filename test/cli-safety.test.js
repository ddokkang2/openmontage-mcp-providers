import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

test("paid generation is blocked before opening an MCP connection", () => {
  const cli = join(import.meta.dirname, "..", "src", "cli.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "generate",
      "--provider",
      "kling",
      "--model",
      "fake-model",
      "--prompt",
      "must not submit",
      "--output",
      "blocked.mp4",
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--yes/);
  assert.doesNotMatch(result.stderr, /mcp-remote|kling\.ai/);
});

test("cost-governed generation is blocked before connection without approved cost", () => {
  const cli = join(import.meta.dirname, "..", "src", "cli.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "generate",
      "--provider",
      "bbanana",
      "--model",
      "fake-model",
      "--prompt",
      "must not submit",
      "--output",
      "blocked.mp4",
      "--yes",
    ],
    {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, BBANANA_MCP_TOKEN: "not-used" },
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--approved-cost/);
  assert.doesNotMatch(result.stderr, /fetch failed|bbanana\.ai/);
});
