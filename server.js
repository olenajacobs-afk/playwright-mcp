import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium } from "playwright";
import { z } from "zod";

const server = new Server(
  { name: "playwright-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(
  z.object({
    method: z.literal("tools/list")
  }),
  async () => ({
    tools: [
      {
        name: "open_page",
        description: "Open a webpage using Playwright",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" }
          },
          required: ["url"]
        }
      }
    ]
  })
);

server.setRequestHandler(
  z.object({
    method: z.literal("tools/call"),
    params: z.object({
      name: z.string(),
      arguments: z.unknown().optional()
    })
  }),
  async (request) => {
    if (request.params.name === "open_page") {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      const args = request.params.arguments ?? {};
      const url = typeof args === "object" && args && "url" in args ? args.url : undefined;
      if (typeof url !== "string") {
        await browser.close();
        return { content: [{ type: "text", text: "Error: Missing required argument 'url'" }] };
      }

      await page.goto(url);
      const title = await page.title();
      await browser.close();
      return { content: [{ type: "text", text: title }] };
    }

    return { content: [{ type: "text", text: `Error: Unknown tool '${request.params.name}'` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
