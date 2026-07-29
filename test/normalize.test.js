import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGenerationId,
  extractStatus,
  extractUrls,
  unwrapToolResult,
} from "../src/normalize.js";

const wrapped = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        generationId: "gen-123",
        status: "succeeded",
        outputs: [
          {
            videoUrl: "https://example.com/video-watermarked.mp4?token=x",
            urlWithoutWatermark: "https://example.com/video.mp4?token=x",
            coverUrl: "https://example.com/cover.jpg?token=x",
          },
        ],
      }),
    },
  ],
};

test("normalizes MCP text content", () => {
  assert.equal(unwrapToolResult(wrapped).generationId, "gen-123");
  assert.equal(extractGenerationId(wrapped), "gen-123");
  assert.equal(extractStatus(wrapped), "succeeded");
  assert.deepEqual(extractUrls(wrapped), [
    "https://example.com/video.mp4?token=x",
    "https://example.com/video-watermarked.mp4?token=x",
    "https://example.com/cover.jpg?token=x",
  ]);
});
