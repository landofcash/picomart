#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PicomartDeliveryDetailsV1Schema, AgentSeedSchema as OrderSeedSchema } from "@picomart/order-protocol/tempo-agent";
import { loadConfig } from "./config.js";
import { PendingIntentStore } from "./intentStore.js";
import { PicomartOrderFlow } from "./orderFlow.js";

const config = loadConfig();
const flow = new PicomartOrderFlow(config, new PendingIntentStore(config.dataDir));
const server = new McpServer(
  { name: "picomart", version: "1.0.2" },
  {
    instructions: [
      "For every approval_required Picomart order, present approvalUrl as a clickable link and show the returned QR image when the client exposes it.",
      "If the client does not expose the image, generate a QR locally from the exact approvalUrl, including its fragment.",
      "Never create another order merely to regenerate a missing QR, and never use an external QR-generation service.",
    ].join(" "),
  },
);

server.registerTool("create_picomart_order", {
  description: [
    "Create a Tempo Moderato PathUSD quote and return a browser-wallet approval URL plus QR image. Delivery details supplied here are visible to this local agent; only ciphertext is sent to the quote server.",
    "Present the clickable URL and QR; if the image is unavailable, locally render the exact URL without calling this tool again or using an external QR service.",
    "This tool cannot sign or submit transactions.",
  ].join(" "),
  inputSchema: {
    catalogSeed: OrderSeedSchema,
    items: z.array(z.object({
      productId: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      quantity: z.number().int().min(1).max(1_000_000),
    }).strict()).min(1).max(100),
    delivery: PicomartDeliveryDetailsV1Schema,
  },
}, async input => {
  try {
    const created = await flow.create(input);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(created.result) },
        { type: "image" as const, data: created.qrBase64, mimeType: "image/png" },
      ],
      structuredContent: created.result,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({
        status: "failed", code: "quote_failed",
        message: error instanceof Error ? error.message : "Quote creation failed.",
      }) }],
    };
  }
});

server.registerTool("get_picomart_order_status", {
  description: "Perform one public settlement-evidence check for an existing Picomart intent and confirm it when ready.",
  inputSchema: { intentId: OrderSeedSchema },
}, async ({ intentId }) => {
  const status = await flow.status(intentId);
  return { content: [{ type: "text" as const, text: JSON.stringify(status) }], structuredContent: status };
});

await server.connect(new StdioServerTransport());
