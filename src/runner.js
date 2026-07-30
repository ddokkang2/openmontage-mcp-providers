import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  assertModelVisible,
  buildGenerationCall,
  buildQueryCall,
  inspectProvider,
} from "./adapters.js";
import { ProviderError, UserError } from "./errors.js";
import {
  extractGenerationId,
  extractStatus,
  extractUrls,
  isFailedStatus,
  isSuccessfulStatus,
  unwrapToolResult,
} from "./normalize.js";

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

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

function assertPaidApproval(provider, options) {
  if (!options.confirmPaidGeneration) {
    throw new UserError(
      "이 명령은 유료 생성 작업을 제출합니다. 승인한다면 --yes를 추가하세요.",
    );
  }
  if (provider.requiresCostApproval && !options.approvedCost) {
    throw new UserError(
      `${provider.displayName}은 모델별 비용 승인이 필요합니다. ` +
        "catalog로 비용을 확인한 뒤 --approved-cost에 확인한 비용을 그대로 적으세요.",
    );
  }
}

export async function inspectProviderReadOnly(connection, provider) {
  const toolsResult = await connection.listTools();
  const inspection = await inspectProvider(connection, provider, toolsResult);
  return { toolsResult, ...inspection };
}

export async function generateVideo(connection, provider, options) {
  assertPaidApproval(provider, options);
  if (!options.model || !options.prompt) {
    throw new UserError("--model과 --prompt는 필수입니다.");
  }

  const toolsResult = await connection.listTools();
  const inspection = await inspectProvider(connection, provider, toolsResult);
  assertModelVisible(provider, inspection, options.model);

  const planTool = provider.tools.plan;
  if (planTool && (toolsResult.tools ?? []).some((tool) => tool.name === planTool)) {
    await connection.callTool(planTool, {
      prompt: options.prompt,
      durationHint: Number(options.duration),
      aspectRatioHint: options.aspectRatio,
    });
  }

  const generation = buildGenerationCall(provider, toolsResult, options);
  const submitted = await connection.callTool(generation.tool.name, generation.args);
  const generationId = extractGenerationId(
    submitted,
    provider.protocol.generationIdField,
  );
  const submittedUrls = extractUrls(submitted);
  if (!generationId && submittedUrls.length === 0) {
    throw new ProviderError(
      "생성 응답에서 작업 ID나 결과 URL을 찾지 못했습니다.",
      unwrapToolResult(submitted),
    );
  }

  let queried = submitted;
  const startedAt = Date.now();
  const timeoutMs = Number(options.timeoutSeconds ?? 900) * 1000;
  const pollMs = Number(options.pollSeconds ?? 10) * 1000;
  while (Date.now() - startedAt < timeoutMs) {
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
        taskTraceId: generation.taskTraceId,
        status: status ?? "completed",
        url,
        outputPath,
        prompt: options.prompt,
        model: options.model,
        duration: options.duration,
        resolution: options.resolution,
        approvedCost: options.approvedCost,
      };
    }
    if (isFailedStatus(status)) {
      throw new ProviderError(
        `${provider.displayName} 생성 작업 실패: ${status}`,
        unwrapToolResult(queried),
      );
    }
    if (!generationId) {
      break;
    }
    await delay(pollMs);
    const query = buildQueryCall(
      provider,
      toolsResult,
      generationId,
      generation.taskTraceId,
    );
    queried = await connection.callTool(query.tool.name, query.args);
  }

  throw new ProviderError(
    `생성 대기 시간이 초과되었습니다. 자동 재제출하지 않습니다. task=${generationId ?? "unknown"}`,
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
