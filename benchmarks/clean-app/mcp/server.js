import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { spawn } from "node:child_process";
import { verifyToken } from "./auth.js";

const server = new McpServer({
  name: "read-only-notes",
  version: "1.0.0",
  allowedTools: ["list_notes", "read_note"],
});

server.tool("read_note", { id: z.string().uuid() }, async ({ id }, extra) => {
  const caller = await verifyToken(extra.authInfo?.token);
  if (!caller) throw new Error("unauthorized");
  const output = spawn("notes-cli", ["read", "--id", id], { shell: false });
  return { content: [{ type: "text", text: await readStdout(output) }] };
});

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});
await server.connect(transport);
