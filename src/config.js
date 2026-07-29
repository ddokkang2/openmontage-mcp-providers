import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { UserError } from "./errors.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledProvidersDir = join(packageRoot, "providers");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UserError(`JSON 파일을 읽을 수 없습니다: ${path}\n${error.message}`);
  }
}

function validateProvider(provider, source) {
  if (!provider?.id || !provider?.transport?.command) {
    throw new UserError(`잘못된 provider 설정입니다: ${source}`);
  }
  provider.transport.args ??= [];
  provider.tools ??= {};
  provider.protocol ??= {};
  return provider;
}

function loadDirectory(path) {
  if (!existsSync(path)) {
    return [];
  }
  return readdirSync(path)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => validateProvider(readJson(join(path, name)), join(path, name)));
}

export function loadProviders(configPath = undefined) {
  const providers = new Map(
    loadDirectory(bundledProvidersDir).map((provider) => [provider.id, provider]),
  );

  if (configPath) {
    const absolute = resolve(configPath);
    const custom = readJson(absolute);
    const entries = Array.isArray(custom) ? custom : custom.providers ?? [custom];
    for (const provider of entries) {
      const valid = validateProvider(provider, absolute);
      providers.set(valid.id, valid);
    }
  }

  return providers;
}

export function getProvider(id, configPath = undefined) {
  const providers = loadProviders(configPath);
  const provider = providers.get(id);
  if (!provider) {
    throw new UserError(
      `알 수 없는 provider: ${id}\n사용 가능: ${[...providers.keys()].join(", ")}`,
    );
  }
  return structuredClone(provider);
}

export { packageRoot };
