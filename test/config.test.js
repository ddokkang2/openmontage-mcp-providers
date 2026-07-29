import assert from "node:assert/strict";
import test from "node:test";

import { getProvider, loadProviders } from "../src/config.js";

test("all bundled providers are loadable", () => {
  const providers = loadProviders();
  assert.deepEqual([...providers.keys()], [
    "bbanana",
    "higgsfield",
    "kling",
    "magnific",
  ]);
  const provider = getProvider("kling");
  assert.equal(provider.tools.textToVideo, "text_to_video");
  assert.match(provider.transport.args.join(" "), /https:\/\/kling\.ai\/mcp/);
  const bbanana = getProvider("bbanana");
  assert.equal(bbanana.transport.type, "streamable-http");
  assert.equal(bbanana.transport.bearerTokenEnv, "BBANANA_MCP_TOKEN");
});
