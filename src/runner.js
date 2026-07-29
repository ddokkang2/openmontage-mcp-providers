import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { ProviderError, UserError } from "./errors.js";
import {
  extractGenerationId,
  extractStatus,
  extractUrls,
  isFailedStatus,
  isSuccessfulStatus,
  unwrapToolResult,
} from "./normalize.js";
import { uuidV7 } from "./trace-id.js";

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function nameValueArguments(options) {
  const pairs = [
    ["prompt", options.prompt],
    ["duration", options.duration],
    ["aspect_ratio", options.aspectRatio],
    ["resolution", options.resolution],
    ["imageCount", options.imageCount],
    ["prefer_multi_shots", options.preferMultiShots],
    ["enable_audio", options.enableAudio],
  ];
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => ({ name, value: String(value) }));
}

export function buildGenerationRequest(provider, options) {
  const protocol = provider.protocol;
  const request = {
    [protocol.modelField]: options.model,
    [protocol.argumentsField]: nameValueArguments(options),
    [protocol.inputsField]: options.inputs ?? [],
    [protocol.rationaleField]: options.rationale ?? "OpenMontage MCP video generation",
    [protocol.traceField]: options.taskTraceId ?? uuidV7(),
  };
  return request;
}

function assertTool(toolsResult, name) {
  const names = new Set((toolsResult.tools ?? []).map((tool) => tool.name));
  if (!names.has(name)) {
    throw new ProviderError(`MCP 서버에 필요한 도구가 없습니다: ${name}`);
  }
}

function assertModelAdvertised(identityResult, model) {
  const normalized = unwrapToolResult(identityResult);
  const text = JSON.stringify(normalized);
  if (!text.includes(model)) {
    throw new UserError(
      `현재 계정의 who_am_i 결과에서 모델을 찾지 못했습니다: ${model}\n` +
        "doctor를 실행하고 표시된 정확한 모델명을 사용하세요.",
    );
  }
}

async function download(url, outputPath) {
  const absolute = resolve(outputPath);
  mkdirSync(dirname(absolute), { recursive: true });
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new ProviderError(`결과 다운로드 실패: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(absolute));
  return absolute;
}

function chooseMediaUrl(urls) {
  return (
    urls.find((url) => /\.(mp4|mov|webm)(\?|$)/i.test(url)) ??
    urls.find((url) => !/\bcover\b/i.test(url)) ??
    urls[0]
  );
}

export async function generateVideo(connection, provider, options) {
  if (!options.confirmPaidGeneration) {
    throw new UserError(
      "이 명령은 유료 생성 작업을 제출합니다. 승인했다면 --yes를 추가하세요.",
    );
  }
  if (!options.model || !options.prompt) {
    throw new UserError("--model과 --prompt는 필수입니다.");
  }

  const toolNames = provider.tools;
  const toolsResult = await connection.listTools();
  for (const name of [toolNames.identity, toolNames.textToVideo, toolNames.query]) {
    assertTool(toolsResult, name);
  }

  const traceField = provider.protocol.traceField;
  const taskTraceId = options.taskTraceId ?? uuidV7();
  const identity = await connection.callTool(toolNames.identity, {
    [traceField]: taskTraceId,
  });
  assertModelAdvertised(identity, options.model);

  const request = buildGenerationRequest(provider, { ...options, taskTraceId });
  const submitted = await connection.callTool(toolNames.textToVideo, request);
  const generationId = extractGenerationId(
    submitted,
    provider.protocol.generationIdField,
  );
  if (!generationId) {
    throw new ProviderError("생성 응답에서 generationId를 찾지 못했습니다.", submitted);
  }

  const startedAt = Date.now();
  const timeoutMs = Number(options.timeoutSeconds ?? 900) * 1000;
  const pollMs = Number(options.pollSeconds ?? 10) * 1000;
  let queried;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(pollMs);
    queried = await connection.callTool(toolNames.query, {
      [provider.protocol.queryGenerationIdField]: generationId,
      [traceField]: taskTraceId,
    });
    const status = extractStatus(queried);
    const urls = extractUrls(queried);
    if (urls.length > 0 && (!status || isSuccessfulStatus(status))) {
      const url = chooseMediaUrl(urls);
      const outputPath = options.outputPath
        ? await download(url, options.outputPath)
        : undefined;
      return {
        provider: provider.id,
        generationId,
        taskTraceId,
        status: status ?? "completed",
        url,
        outputPath,
        prompt: options.prompt,
        model: options.model,
        duration: options.duration,
        resolution: options.resolution,
      };
    }
    if (isFailedStatus(status)) {
      throw new ProviderError(`Kling 생성 작업 실패: ${status}`, unwrapToolResult(queried));
    }
  }

  throw new ProviderError(
    `생성 대기 시간이 초과되었습니다. 자동 재제출하지 않았습니다. generationId=${generationId}`,
    unwrapToolResult(queried),
  );
}

export function defaultOutputPath(directory, job) {
  const extension = extname(job.outputPath ?? "") || ".mp4";
  return resolve(directory, `${job.id}${extension}`);
}

export function outputExists(path) {
  return existsSync(resolve(path));
}
