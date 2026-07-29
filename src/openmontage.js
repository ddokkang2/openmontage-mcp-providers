import { readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

import { UserError } from "./errors.js";
import { uuidV7 } from "./trace-id.js";

export function readScenePlan(path) {
  let plan;
  try {
    plan = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    throw new UserError(`scene plan을 읽을 수 없습니다: ${path}\n${error.message}`);
  }
  if (plan?.version !== "1.0" || !Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    throw new UserError("OpenMontage scene_plan 1.0 형식이 아닙니다.");
  }
  return plan;
}

function generatedVideoAssets(scene) {
  const required = Array.isArray(scene.required_assets) ? scene.required_assets : [];
  const requested = required.filter(
    (asset) => asset?.source === "generate" && ["video", "animation"].includes(asset?.type),
  );
  if (requested.length > 0) {
    return requested;
  }
  if (scene.type === "generated") {
    return [{ type: "video", description: scene.description, source: "generate" }];
  }
  return [];
}

function promptFor(scene, asset) {
  const shot = scene.shot_language ?? {};
  const parts = [
    asset.description || scene.description,
    scene.framing && `Framing: ${scene.framing}`,
    scene.movement && `Camera movement: ${scene.movement}`,
    shot.shot_size && `Shot size: ${shot.shot_size}`,
    shot.camera_movement && `Camera: ${shot.camera_movement}`,
    shot.lens_mm && `Lens: ${shot.lens_mm}mm`,
    shot.lighting_key && `Lighting: ${shot.lighting_key}`,
    shot.depth_of_field && `Depth of field: ${shot.depth_of_field}`,
    shot.color_temperature && `Color temperature: ${shot.color_temperature}`,
    scene.texture_keywords?.length && `Texture: ${scene.texture_keywords.join(", ")}`,
    scene.shot_intent && `Intent: ${scene.shot_intent}`,
  ];
  return parts.filter(Boolean).join(". ");
}

export function compileScenePlan(
  scenePlan,
  {
    provider = "kling",
    model,
    aspectRatio = "16:9",
    resolution = "1080p",
    enableAudio = false,
  } = {},
) {
  if (!model) {
    throw new UserError(
      "모델은 자동 추측하지 않습니다. doctor 결과에서 모델을 고른 뒤 --model로 지정하세요.",
    );
  }
  const taskTraceId = uuidV7();
  const jobs = [];

  for (const scene of scenePlan.scenes) {
    const duration = Number(scene.end_seconds) - Number(scene.start_seconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new UserError(`scene ${scene.id}의 시간이 올바르지 않습니다.`);
    }
    generatedVideoAssets(scene).forEach((asset, index) => {
      jobs.push({
        id: `${scene.id}-video-${index + 1}`,
        sceneId: scene.id,
        provider,
        tool: "textToVideo",
        model,
        prompt: promptFor(scene, asset),
        duration: String(Math.max(1, Math.round(duration))),
        aspectRatio,
        resolution,
        enableAudio,
        taskTraceId,
        rationale: `OpenMontage scene ${scene.id}에 필요한 생성형 영상 자산 제작`,
      });
    });
  }

  if (jobs.length === 0) {
    throw new UserError("source=generate인 video/animation 자산이 scene plan에 없습니다.");
  }

  return {
    version: "1.0",
    source: "openmontage/scene_plan",
    taskTraceId,
    jobs,
  };
}

export function createAssetManifest(results, projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const assets = results.map((result, index) => ({
    id: result.jobId ?? `mcp-video-${index + 1}`,
    type: "video",
    path: result.outputPath
      ? relative(root, resolve(result.outputPath)).replaceAll("\\", "/")
      : result.url,
    source_tool: `${result.provider}_mcp_video`,
    scene_id: result.sceneId,
    prompt: result.prompt,
    model: result.model,
    duration_seconds: result.duration ? Number(result.duration) : undefined,
    resolution: result.resolution,
    format: result.outputPath ? basename(result.outputPath).split(".").at(-1) : undefined,
    subtype: "generated",
    generation_summary: `Generated through ${result.provider} MCP`,
    provider: `${result.provider}_mcp`,
    original_url: result.url,
  }));

  for (const asset of assets) {
    for (const [key, value] of Object.entries(asset)) {
      if (value === undefined) {
        delete asset[key];
      }
    }
  }

  return {
    version: "1.0",
    assets,
    metadata: {
      cost_note: "MCP provider did not expose a normalized USD cost; check provider credits.",
    },
  };
}
