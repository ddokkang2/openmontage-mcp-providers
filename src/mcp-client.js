import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { UserError } from "./errors.js";

function windowsSafeTransport(transport) {
  const result = structuredClone(transport);
  if (
    process.platform === "win32" &&
    result.command.toLowerCase().endsWith(".cmd")
  ) {
    return {
      ...result,
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", transport.command, ...(transport.args ?? [])],
    };
  }
  return result;
}

export class McpConnection {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.client = new Client({
      name: options.clientName ?? "openmontage-mcp-providers",
      version: options.clientVersion ?? "0.2.0",
    });
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) {
      return this;
    }
    const kind = this.provider.transport.type ?? "stdio";
    if (kind === "streamable-http") {
      const headers = {};
      const envName = this.provider.transport.bearerTokenEnv;
      if (envName) {
        const token = process.env[envName];
        if (!token) {
          throw new UserError(
            `${this.provider.displayName ?? this.provider.id} 연결에 환경변수 ${envName}가 필요합니다.`,
          );
        }
        headers.Authorization = `Bearer ${token}`;
      }
      this.transport = new StreamableHTTPClientTransport(
        new URL(this.provider.transport.url),
        { requestInit: { headers } },
      );
    } else if (kind === "stdio") {
      const transportOptions = windowsSafeTransport(this.provider.transport);
      this.transport = new StdioClientTransport({
        ...transportOptions,
        stderr: "pipe",
      });
      this.transport.stderr?.on("data", (chunk) => {
        if (process.env.OM_MCP_DEBUG === "1") {
          process.stderr.write(chunk);
        }
      });
    } else {
      throw new UserError(`지원하지 않는 MCP transport 형식입니다: ${kind}`);
    }
    await this.client.connect(this.transport);
    this.connected = true;
    return this;
  }

  async listTools() {
    await this.connect();
    return this.client.listTools();
  }

  async callTool(name, args = {}) {
    await this.connect();
    return this.client.callTool({ name, arguments: args });
  }

  async close() {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    await this.client.close();
  }
}

export async function withConnection(provider, callback) {
  const connection = new McpConnection(provider);
  try {
    await connection.connect();
    return await callback(connection);
  } finally {
    await connection.close();
  }
}
