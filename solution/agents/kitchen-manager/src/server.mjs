import "dotenv/config";
import express from "express";
import cors from "cors";
import { A2AExpressApp, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createKitchenTools } from "./tools.mjs";

const CAP_SERVICE_URL = process.env.CAP_SERVICE_URL || "http://localhost:4004";

function resolveAppUrl() {
  const vcap = process.env.VCAP_APPLICATION;
  if (vcap) {
    const { application_uris } = JSON.parse(vcap);
    if (application_uris?.[0]) return `https://${application_uris[0]}`;
  }
  return `http://localhost:${process.env.PORT ?? "8082"}`;
}

const SYSTEM_PROMPT = `You are the Kitchen Manager for the office cafeteria.
You manage inventory, stock levels, and restocking decisions.

Rules:
- NEVER ask clarifying questions. Make reasonable assumptions and act.
- ALWAYS use your tools. Do NOT respond from memory or general knowledge.
- To see all stock levels: call getLowStockItems (NOT checkStock with "all")
- To check one specific item: call checkStock with the item's UUID
- To analyze demand and decide whether to restock: call getItemDemand with the item UUID
- To get details of a restock request: call getRestockDetails with the request UUID
- When asked "should I restock X": call getRestockDetails to get the item, then call getItemDemand to analyze order history, then give a recommendation
- checkStock requires a valid UUID, never pass "all" or other text
- Be organized, concise, and data-driven in recommendations`;

class KitchenManagerExecutor {
  async execute(context, eventBus) {
    // Register task
    eventBus.publish({ kind: "task" });
    eventBus.publish({
      kind: "status-update",
      status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Looking into your request..." }] } },
      final: false,
    });

    try {
      // Extract user message
      const userMessage = context.userMessage?.parts
        ?.filter(p => p.kind === "text")
        ?.map(p => p.text)
        ?.join(" ") || "";

      // Extract JWT token from request headers for forwarding to CAP service
      const authToken = context.task?.metadata?.authToken || "";

      // Create tools with JWT forwarding
      const tools = createKitchenTools(CAP_SERVICE_URL, authToken);

      // Create ReAct agent
      const llm = new OrchestrationClient({
        promptTemplating: { model: { name: "gpt-4o", version: "latest" } },
      });
      const agent = createReactAgent({ llm, tools });

      // Invoke
      const result = await agent.invoke({
        messages: [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userMessage)],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const response = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      // Publish result
      eventBus.publish({
        kind: "artifact-update",
        artifact: {
          artifactId: "kitchen_response",
          parts: [{ kind: "text", text: response }],
        },
      });

      eventBus.publish({
        kind: "status-update",
        status: { state: "completed", message: { role: "agent", parts: [{ kind: "text", text: "Done!" }] } },
        final: true,
      });
    } catch (error) {
      eventBus.publish({
        kind: "status-update",
        status: { state: "failed", message: { role: "agent", parts: [{ kind: "text", text: `Error: ${error.message}` }] } },
        final: true,
      });
    }

    eventBus.finished();
  }

  async cancelTask(taskId) {
    console.log(`[KitchenManager] Task ${taskId} cancelled`);
  }
}

// Agent Card
const agentCard = {
  name: "Kitchen Manager",
  description: "Kitchen Manager for the office cafeteria. Handles stock and inventory management, restocking requests, fulfillment tracking, and finding alternative items when stock is low.",
  url: resolveAppUrl(),
  version: "1.0.0",
  protocolVersion: "0.3.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "kitchen_manage",
      name: "Kitchen Manager",
      description: "Check stock levels, manage restock requests, find alternatives for out-of-stock items",
      tags: ["kitchen", "stock", "inventory", "restock"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
};

// Server
const app = express();
app.use(cors());
app.use(express.json());

const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), new KitchenManagerExecutor());
new A2AExpressApp(requestHandler).setupRoutes(app);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8082");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Kitchen Manager Agent listening on port ${PORT}`);
  console.log(`Agent Card: ${resolveAppUrl()}/.well-known/agent.json`);
  console.log(`CAP Service: ${CAP_SERVICE_URL}`);
});
