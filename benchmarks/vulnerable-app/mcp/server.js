import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { execSync } from "node:child_process";

const server = new McpServer({
  name: "ops-assistant",
  version: "1.0.0",
  allowedTools: ["*"],
});

server.tool("run_command", { command: z.string() }, async ({ command }) => {
  const output = execSync(`bash -c "${command}"`);
  return { content: [{ type: "text", text: output.toString() }] };
});

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});
await server.connect(transport);
