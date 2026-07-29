#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getProvider, loadProviders, packageRoot } from "./config.js";
import { UserError } from "./errors.js";
import { McpConnection, withConnection } from "./mcp-client.js";
import { extractModelNames } from "./normalize.js";
import {
  compileScenePlan,
  createAssetManifest,
  readScenePlan,
} from "./openmontage.js";
import { generateVideo } from "./runner.js";

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2).replaceAll("-", "_");
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }
  return { positional, flags };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readJsonArgument(value = "{}") {
  const source = value.startsWith("@")
    ? readFileSync(resolve(value.slice(1)), "utf8")
    : value;
  return JSON.parse(source);
}

function writeJson(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

function usage() {
  return `OpenMontage MCP Providers

Usage:
  om-mcp providers [--config providers.json]
  om-mcp doctor --provider kling [--config providers.json]
  om-mcp tools --provider kling
  om-mcp call --provider kling --tool who_am_i [--args '{}']
  om-mcp compile --scene-plan scene_plan.json --model MODEL --jobs jobs.json
  om-mcp generate --provider kling --model MODEL --prompt TEXT --output clip.mp4 --yes
  om-mcp run-plan --jobs jobs.json --output-dir assets/video --manifest asset_manifest.json --project-root PATH --yes
  om-mcp install-openmontage --path PATH [--dry-run | --yes]

Safety:
  generate와 run-plan은 유료 작업입니다. --yes 없이는 제출하지 않습니다.
`;
}

function providerFrom(flags) {
  return getProvider(flags.provider ?? "kling", flags.config);
}

async function commandDoctor(flags) {
  const provider = providerFrom(flags);
  return withConnection(provider, async (connection) => {
    const tools = await connection.listTools();
    const identityName = provider.tools.identity;
    const identity = identityName
      ? await connection.callTool(identityName, {})
      : undefined;
    const receipt = {
      ok: true,
      provider: provider.id,
      displayName: provider.displayName,
      tools: (tools.tools ?? []).map((tool) => tool.name),
      authorization: identity ? "connected" : "not_checked",
      models: identity ? extractModelNames(identity) : [],
      checkedAt: new Date().toISOString(),
    };
    const receiptPath = writeJson(
      join(packageRoot, ".state", `${provider.id}.json`),
      receipt,
    );
    return { ...receipt, readinessReceipt: receiptPath };
  });
}

async function commandCall(flags) {
  if (!flags.tool) {
    throw new UserError("--tool이 필요합니다.");
  }
  const provider = providerFrom(flags);
  const args = readJsonArgument(flags.args ?? "{}");
  return withConnection(provider, (connection) => connection.callTool(flags.tool, args));
}

function commandCompile(flags) {
  if (!flags.scene_plan || !flags.jobs) {
    throw new UserError("--scene-plan, --jobs가 필요합니다.");
  }
  const plan = readScenePlan(flags.scene_plan);
  const jobs = compileScenePlan(plan, {
    provider: flags.provider ?? "kling",
    model: flags.model,
    aspectRatio: flags.aspect_ratio ?? "16:9",
    resolution: flags.resolution ?? "1080p",
    enableAudio: flags.enable_audio === "true" || flags.enable_audio === true,
  });
  const path = writeJson(flags.jobs, jobs);
  return { ok: true, path, jobCount: jobs.jobs.length, jobs };
}

function generationOptions(flags) {
  return {
    model: flags.model,
    prompt: flags.prompt,
    duration: flags.duration ?? "5",
    aspectRatio: flags.aspect_ratio ?? "16:9",
    resolution: flags.resolution ?? "1080p",
    imageCount: flags.image_count ?? "1",
    preferMultiShots:
      flags.prefer_multi_shots === "true" || flags.prefer_multi_shots === true,
    enableAudio: flags.enable_audio === "true" || flags.enable_audio === true,
    rationale: flags.rationale,
    taskTraceId: flags.task_trace_id,
    outputPath: flags.output,
    pollSeconds: flags.poll_seconds ?? 10,
    timeoutSeconds: flags.timeout_seconds ?? 900,
    confirmPaidGeneration: flags.yes === true,
  };
}

async function commandGenerate(flags) {
  if (flags.yes !== true) {
    throw new UserError(
      "이 명령은 유료 생성 작업을 제출합니다. 승인했다면 --yes를 추가하세요.",
    );
  }
  const provider = providerFrom(flags);
  return withConnection(provider, (connection) =>
    generateVideo(connection, provider, generationOptions(flags)),
  );
}

async function commandRunPlan(flags) {
  if (!flags.jobs || !flags.output_dir || !flags.manifest) {
    throw new UserError("--jobs, --output-dir, --manifest가 필요합니다.");
  }
  if (flags.yes !== true) {
    throw new UserError("여러 유료 작업을 제출합니다. 승인했다면 --yes를 추가하세요.");
  }
  const plan = JSON.parse(readFileSync(resolve(flags.jobs), "utf8"));
  const results = [];
  const connections = new Map();
  try {
    for (const job of plan.jobs ?? []) {
      const provider = getProvider(job.provider, flags.config);
      let connection = connections.get(provider.id);
      if (!connection) {
        connection = new McpConnection(provider);
        await connection.connect();
        connections.set(provider.id, connection);
      }
      const output = resolve(flags.output_dir, `${job.id}.mp4`);
      const result = await generateVideo(connection, provider, {
        ...job,
        outputPath: output,
        confirmPaidGeneration: true,
        pollSeconds: flags.poll_seconds ?? 10,
        timeoutSeconds: flags.timeout_seconds ?? 900,
      });
      results.push({ ...result, jobId: job.id, sceneId: job.sceneId });
    }
  } finally {
    await Promise.all([...connections.values()].map((connection) => connection.close()));
  }
  const manifest = createAssetManifest(results, flags.project_root ?? process.cwd());
  const manifestPath = writeJson(flags.manifest, manifest);
  return { ok: true, manifestPath, results, manifest };
}

function commandInstallOpenMontage(flags) {
  if (!flags.path) {
    throw new UserError("--path로 OpenMontage 저장소를 지정하세요.");
  }
  const root = resolve(flags.path);
  const target = join(root, "tools", "video", "kling_mcp_video.py");
  const source = join(packageRoot, "integrations", "openmontage", "kling_mcp_video.py");
  if (!existsSync(join(root, "AGENT_GUIDE.md")) || !existsSync(dirname(target))) {
    throw new UserError(`OpenMontage 저장소로 확인되지 않습니다: ${root}`);
  }
  if (flags.dry_run === true) {
    return { ok: true, dryRun: true, source, target, wouldOverwrite: existsSync(target) };
  }
  if (flags.yes !== true) {
    throw new UserError("OpenMontage 파일을 추가합니다. 승인했다면 --yes를 추가하세요.");
  }
  if (existsSync(target)) {
    throw new UserError(`대상 파일이 이미 존재합니다. 덮어쓰지 않았습니다: ${target}`);
  }
  copyFileSync(source, target);
  return {
    ok: true,
    installed: target,
    bridgeCli: fileURLToPath(import.meta.url),
    next: `OPENMONTAGE_MCP_BRIDGE_CLI=${fileURLToPath(import.meta.url)}`,
  };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  if (!command || command === "help" || flags.help) {
    process.stdout.write(usage());
    return;
  }

  let result;
  switch (command) {
    case "providers":
      result = [...loadProviders(flags.config).values()];
      break;
    case "doctor":
      result = await commandDoctor(flags);
      break;
    case "tools": {
      const provider = providerFrom(flags);
      result = await withConnection(provider, (connection) => connection.listTools());
      break;
    }
    case "call":
      result = await commandCall(flags);
      break;
    case "compile":
      result = commandCompile(flags);
      break;
    case "generate":
      result = await commandGenerate(flags);
      break;
    case "run-plan":
      result = await commandRunPlan(flags);
      break;
    case "install-openmontage":
      result = commandInstallOpenMontage(flags);
      break;
    default:
      throw new UserError(`알 수 없는 명령: ${command}\n\n${usage()}`);
  }
  print(result);
}

main().catch((error) => {
  const details = error.details ? `\n${JSON.stringify(error.details, null, 2)}` : "";
  process.stderr.write(`${error.name}: ${error.message}${details}\n`);
  process.exitCode = error.exitCode ?? 1;
});
