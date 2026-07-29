import assert from "node:assert/strict";
import test from "node:test";

import { compileScenePlan, createAssetManifest } from "../src/openmontage.js";

const plan = {
  version: "1.0",
  scenes: [
    {
      id: "s1",
      type: "generated",
      description: "Bottle on marble",
      start_seconds: 0,
      end_seconds: 5,
      movement: "slow dolly",
      required_assets: [
        {
          type: "video",
          description: "Perfume hero",
          source: "generate",
        },
      ],
    },
  ],
};

test("compiles OpenMontage scene plan into MCP jobs", () => {
  const compiled = compileScenePlan(plan, {
    model: "kling-video-v3_0_omni",
    aspectRatio: "9:16",
  });
  assert.equal(compiled.jobs.length, 1);
  assert.equal(compiled.jobs[0].sceneId, "s1");
  assert.equal(compiled.jobs[0].duration, "5");
  assert.match(compiled.jobs[0].prompt, /Perfume hero/);
});

test("normalizes completed jobs into an OpenMontage asset manifest", () => {
  const manifest = createAssetManifest(
    [
      {
        jobId: "s1-video-1",
        sceneId: "s1",
        provider: "kling",
        model: "model-1",
        prompt: "prompt",
        outputPath: "assets/video/s1.mp4",
        url: "https://example.com/s1.mp4",
      },
    ],
    process.cwd(),
  );
  assert.equal(manifest.version, "1.0");
  assert.equal(manifest.assets[0].source_tool, "kling_mcp_video");
  assert.equal(manifest.assets[0].scene_id, "s1");
});
