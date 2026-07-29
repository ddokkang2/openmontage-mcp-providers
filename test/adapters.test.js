import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationCall, buildQueryCall } from "../src/adapters.js";
import { getProvider } from "../src/config.js";

const tools = {
  tools: [
    {
      name: "video_generate",
      inputSchema: {
        type: "object",
        required: ["video"],
        properties: { video: { type: "object" } },
      },
    },
    {
      name: "creation_status",
      inputSchema: {
        type: "object",
        required: ["creationIdentifier"],
        properties: { creationIdentifier: { type: "string" } },
      },
    },
  ],
};

test("maps canonical video options to Magnific clips", () => {
  const provider = getProvider("magnific");
  const call = buildGenerationCall(provider, tools, {
    model: "bytedance-seedance-mini-2.0",
    prompt: "Perfume bottle",
    duration: "5",
    aspectRatio: "9:16",
    resolution: "720p",
    enableAudio: true,
  });
  assert.equal(call.tool.name, "video_generate");
  assert.deepEqual(call.args.video.clips, [
    {
      slug: "bytedance-seedance-mini-2.0",
      prompt: "Perfume bottle",
      duration: 5,
      aspectRatio: "9:16",
      resolution: "720p",
      withSoundEffects: true,
    },
  ]);
});

test("maps a Magnific creation id to creation_status", () => {
  const provider = getProvider("magnific");
  const call = buildQueryCall(provider, tools, "creation-123", "trace");
  assert.deepEqual(call.args, { creationIdentifier: "creation-123" });
});
