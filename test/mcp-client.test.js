import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { McpConnection } from "../src/mcp-client.js";
import { unwrapToolResult } from "../src/normalize.js";

test("connects to a generic stdio MCP server", async () => {
  const fixture = join(import.meta.dirname, "..", "fixtures", "mock-server.mjs");
  const connection = new McpConnection({
    id: "mock",
    transport: { command: process.execPath, args: [fixture] },
  });
  try {
    const tools = await connection.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ["echo"]);
    const result = await connection.callTool("echo", { hello: "world" });
    assert.deepEqual(unwrapToolResult(result), { echoed: { hello: "world" } });
  } finally {
    await connection.close();
  }
});
