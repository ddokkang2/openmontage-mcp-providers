const JSON_STARTS = new Set(["{", "["]);

function maybeJson(value) {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed || !JSON_STARTS.has(trimmed[0])) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function unwrapToolResult(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const content = Array.isArray(result.content) ? result.content : [];
  const parsed = content
    .filter((item) => item?.type === "text")
    .map((item) => maybeJson(item.text));

  if (parsed.length === 1) {
    return parsed[0];
  }
  if (parsed.length > 1) {
    return parsed;
  }
  return result.structuredContent ?? result;
}

export function walk(value, visit, path = []) {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...path, index]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, visit, [...path, key]);
    }
  }
}

export function findFirstByKeys(value, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let found;
  walk(value, (item, path) => {
    if (found !== undefined || path.length === 0) {
      return;
    }
    const key = String(path.at(-1)).toLowerCase();
    if (wanted.has(key) && (typeof item === "string" || typeof item === "number")) {
      found = String(item);
    }
  });
  return found;
}

export function extractGenerationId(result, preferredKey = "generationId") {
  const value = unwrapToolResult(result);
  return findFirstByKeys(value, [
    preferredKey,
    "generationId",
    "generation_id",
    "taskId",
    "task_id",
    "identifier",
    "creationIdentifier",
    "creation_identifier",
  ]);
}

export function extractStatus(result) {
  const value = unwrapToolResult(result);
  const status = findFirstByKeys(value, [
    "status",
    "state",
    "taskStatus",
    "task_status",
  ]);
  return status?.trim().toLowerCase();
}

export function extractUrls(result) {
  const value = unwrapToolResult(result);
  const candidates = [];
  walk(value, (item, path) => {
    if (typeof item !== "string" || !/^https?:\/\//i.test(item)) {
      return;
    }
    const key = String(path.at(-1) ?? "").toLowerCase();
    if (key.includes("url") || /\.(mp4|mov|webm|png|jpe?g)(\?|$)/i.test(item)) {
      let priority = 0;
      if (key.includes("withoutwatermark") || key.includes("without_watermark")) {
        priority += 100;
      }
      if (/\.(mp4|mov|webm)(\?|$)/i.test(item)) {
        priority += 50;
      }
      if (key.includes("cover")) {
        priority -= 25;
      }
      candidates.push({ url: item, priority });
    }
  });
  candidates.sort((left, right) => right.priority - left.priority);
  return [...new Set(candidates.map((candidate) => candidate.url))];
}

export function extractModelNames(result) {
  const value = unwrapToolResult(result);
  const models = [];
  walk(value, (item, path) => {
    if (
      typeof item === "string" &&
      (/^kling[-_]/i.test(item) ||
        /^kwaivgi\//i.test(item) ||
        ["slug", "service_name", "model", "model_id", "job_set_type"].includes(
          String(path.at(-1) ?? "").toLowerCase(),
        ))
    ) {
      models.push(item);
    }
  });
  if (typeof value === "string") {
    for (const match of value.matchAll(/^\s*(?:-\s*)?(?:slug|service_name|job_set_type):\s*([^\s,]+)/gim)) {
      models.push(match[1].replace(/^["']|["']$/g, ""));
    }
  }
  return [...new Set(models)].sort();
}

export function isSuccessfulStatus(status) {
  return new Set(["success", "succeed", "succeeded", "completed", "complete", "done"]).has(
    status,
  );
}

export function isFailedStatus(status) {
  return new Set(["failed", "failure", "error", "cancelled", "canceled", "timeout"]).has(
    status,
  );
}
