import assert from "node:assert/strict";
import test from "node:test";

import { getProvider, loadProviders } from "../src/config.js";

test("bundled Kling provider is loadable", () => {
  const providers = loadProviders();
  assert.equal(providers.has("kling"), true);
  const provider = getProvider("kling");
  assert.equal(provider.tools.textToVideo, "text_to_video");
  assert.match(provider.transport.args.join(" "), /https:\/\/kling\.ai\/mcp/);
});
