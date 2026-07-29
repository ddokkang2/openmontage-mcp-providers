import { ProviderError, UserError } from "./errors.js";
import { unwrapToolResult } from "./normalize.js";
import { uuidV7 } from "./trace-id.js";

function toolMap(toolsResult) {
  return new Map((toolsResult.tools ?? []).map((tool) => [tool.name, tool]));
}

export function resolveTool(provider, toolsResult, role, { required = true } = {}) {
  const available = toolMap(toolsResult);
  const configured = provider.tools?.[role];
  const candidates = provider.tools?.[`${role}Candidates`] ?? [];
  const name = [configured, ...candidates].filter(Boolean).find((item) => available.has(item));
  if (!name && required) {
    throw new ProviderError(
      `${provider.displayName} MCP에서 ${role} 도구를 찾지 못했습니다. ` +
        `현재 도구: ${[...available.keys()].join(", ")}`,
    );
  }
  return name ? available.get(name) : undefined;
}

function addFirstAccepted(target, properties, aliases, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  const key = aliases.find((alias) => Object.hasOwn(properties, alias));
  if (key) {
    target[key] = value;
  }
}

function missingRequired(schema, args) {
  return (schema?.required ?? []).filter((name) => args[name] === undefined);
}

export function buildSchemaArguments(tool, options, mode = "generate") {
  const schema = tool?.inputSchema ?? {};
  const properties = schema.properties ?? {};
  const args = {};

  if (mode === "catalog") {
    addFirstAccepted(args, properties, ["modality", "type", "media_type"], "video");
  } else if (mode === "query") {
    addFirstAccepted(
      args,
      properties,
      ["taskId", "task_id", "generationId", "generation_id", "creationId", "creation_id", "id"],
      options.generationId,
    );
  } else {
    addFirstAccepted(args, properties, ["prompt", "text_prompt", "textPrompt", "text"], options.prompt);
    addFirstAccepted(args, properties, ["model", "model_id", "modelId"], options.model);
    addFirstAccepted(
      args,
      properties,
      ["duration", "duration_seconds", "durationSeconds", "seconds"],
      options.duration,
    );
    addFirstAccepted(args, properties, ["resolution", "size", "quality"], options.resolution);
    addFirstAccepted(
      args,
      properties,
      ["aspect_ratio", "aspectRatio", "ratio"],
      options.aspectRatio,
    );
    addFirstAccepted(
      args,
      properties,
      ["enable_audio", "enableAudio", "audio", "sound"],
      options.enableAudio,
    );
    addFirstAccepted(args, properties, ["tier", "mode"], options.tier);
    Object.assign(args, options.providerOptions ?? {});
  }

  const missing = missingRequired(schema, args);
  if (missing.length > 0) {
    throw new UserError(
      `${tool.name}에 필요한 인수를 자동 매핑하지 못했습니다: ${missing.join(", ")}. ` +
        `--provider-options JSON으로 값을 지정하세요.`,
    );
  }
  return args;
}

function klingNameValueArguments(options) {
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

export function buildGenerationCall(provider, toolsResult, options) {
  const tool = resolveTool(provider, toolsResult, "textToVideo");
  if (provider.adapter === "kling") {
    const protocol = provider.protocol;
    const taskTraceId = options.taskTraceId ?? uuidV7();
    return {
      tool,
      taskTraceId,
      args: {
        [protocol.modelField]: options.model,
        [protocol.argumentsField]: klingNameValueArguments(options),
        [protocol.inputsField]: options.inputs ?? [],
        [protocol.rationaleField]:
          options.rationale ?? "OpenMontage MCP video generation",
        [protocol.traceField]: taskTraceId,
      },
    };
  }
  if (provider.adapter === "bbanana") {
    return {
      tool,
      taskTraceId: options.taskTraceId ?? uuidV7(),
      args: {
        model: options.model,
        prompt: options.prompt,
        duration: options.duration,
        resolution: options.resolution,
        aspect_ratio: options.aspectRatio,
        ...(options.tier ? { tier: options.tier } : {}),
        ...(options.providerOptions ?? {}),
      },
    };
  }
  if (provider.adapter === "magnific") {
    const clip = {
      slug: options.model,
      prompt: options.prompt,
      duration: Number(options.duration),
      aspectRatio: options.aspectRatio,
      resolution: options.resolution,
      ...(options.enableAudio ? { withSoundEffects: true } : {}),
    };
    const providerOptions = options.providerOptions ?? {};
    return {
      tool,
      taskTraceId: options.taskTraceId ?? uuidV7(),
      args: {
        ...providerOptions,
        video: {
          ...(providerOptions.video ?? {}),
          clips: providerOptions.video?.clips ?? [clip],
        },
      },
    };
  }
  return {
    tool,
    taskTraceId: options.taskTraceId ?? uuidV7(),
    args: buildSchemaArguments(tool, options),
  };
}

export function buildQueryCall(provider, toolsResult, generationId, taskTraceId) {
  const tool = resolveTool(provider, toolsResult, "query");
  if (provider.adapter === "kling") {
    return {
      tool,
      args: {
        [provider.protocol.queryGenerationIdField]: generationId,
        [provider.protocol.traceField]: taskTraceId,
      },
    };
  }
  if (provider.adapter === "bbanana") {
    return { tool, args: { taskId: generationId } };
  }
  if (provider.adapter === "magnific") {
    return { tool, args: { creationIdentifier: generationId } };
  }
  return {
    tool,
    args: buildSchemaArguments(tool, { generationId }, "query"),
  };
}

export async function estimateGenerationCost(connection, provider, options) {
  const toolsResult = await connection.listTools();
  const generation = buildGenerationCall(provider, toolsResult, options);
  const pricingTool = resolveTool(provider, toolsResult, "pricing", { required: false });
  if (pricingTool) {
    const result = await connection.callTool(pricingTool.name, {
      tool: generation.tool.name,
      arguments: generation.args,
    });
    return {
      provider: provider.id,
      model: options.model,
      generationTool: generation.tool.name,
      pricingTool: pricingTool.name,
      estimate: unwrapToolResult(result),
    };
  }
  const catalogTool = resolveTool(provider, toolsResult, "catalog");
  const catalogArgs = buildSchemaArguments(catalogTool, {}, "catalog");
  const catalog = await connection.callTool(catalogTool.name, catalogArgs);
  return {
    provider: provider.id,
    model: options.model,
    generationTool: generation.tool.name,
    pricingTool: catalogTool.name,
    estimate: unwrapToolResult(catalog),
    note: "모델 항목에서 선택한 tier, duration, resolution의 credit cost를 확인하세요.",
  };
}

export async function inspectProvider(connection, provider, toolsResult) {
  const result = { identity: undefined, catalog: undefined };
  const identityTool = resolveTool(provider, toolsResult, "identity", { required: false });
  if (identityTool && (identityTool.inputSchema?.required ?? []).length === 0) {
    result.identity = await connection.callTool(identityTool.name, {});
  }
  const catalogTool = resolveTool(provider, toolsResult, "catalog", { required: false });
  if (catalogTool) {
    const args = buildSchemaArguments(catalogTool, {}, "catalog");
    result.catalog = await connection.callTool(catalogTool.name, args);
  }
  return result;
}

export function assertModelVisible(provider, inspection, model) {
  if (!inspection?.identity && !inspection?.catalog) {
    return;
  }
  const haystack = JSON.stringify({
    identity: unwrapToolResult(inspection.identity),
    catalog: unwrapToolResult(inspection.catalog),
  });
  if (!haystack.includes(model)) {
    throw new UserError(
      `${provider.displayName}의 현재 모델 목록에서 "${model}"을 찾지 못했습니다. ` +
        "catalog 명령으로 정확한 모델 ID와 옵션을 확인하세요.",
    );
  }
}
