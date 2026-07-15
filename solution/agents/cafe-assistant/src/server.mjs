import "dotenv/config";
import express from "express";
import cors from "cors";
import { A2AExpressApp, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createCafeTools } from "./tools.mjs";

const CAP_SERVICE_URL = process.env.CAP_SERVICE_URL || "http://localhost:4004";

function resolveAppUrl() {
  const vcap = process.env.VCAP_APPLICATION;
  if (vcap) {
    const { application_uris } = JSON.parse(vcap);
    if (application_uris?.[0]) return `https://${application_uris[0]}`;
  }
  return `http://localhost:${process.env.PORT ?? "8081"}`;
}

const SYSTEM_PROMPT = `You are a friendly café assistant for the office cafeteria.
You help colleagues browse the menu, find items that match their dietary needs,
place orders, check order status, and cancel items if needed.

Rules:
- NEVER ask clarifying questions unless absolutely necessary. Make reasonable assumptions and act.
- ALWAYS use your tools to answer. Do NOT respond from memory or general knowledge.
- When a user asks about the menu or what's available: call browseMenu immediately.
- When a user mentions dietary needs (vegan, vegetarian, gluten free): call getItemsByDietary immediately.
- When a user wants to order something: browse the menu first to find the item ID, then call placeOrder.
- Present prices in EUR with the euro symbol.
- If an order fails with ITEM_OUT_OF_STOCK or ITEM_UNAVAILABLE, report this clearly.
- Keep responses concise. Use markdown formatting for menu items.
- If the user says "hi" or greets you, respond briefly and suggest browsing the menu.`;

class CafeAssistantExecutor {
  async execute(context, eventBus) {
    // 1. Register task (matching CodeJam pattern — full metadata)
    eventBus.publish({
      kind: "task",
      id: context.taskId,
      contextId: context.contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [],
    });

    // 2. Signal working state
    eventBus.publish({
      kind: "status-update",
      taskId: context.taskId,
      contextId: context.contextId,
      status: { state: "working", timestamp: new Date().toISOString() },
      final: false,
    });

    try {
      // Extract user message
      const userMessage = context.userMessage?.parts
        ?.filter(p => p.kind === "text")
        ?.map(p => p.text)
        ?.join("") ?? "";

      console.log(`[CafeAssistant] Received: "${userMessage}"`);

      // Extract JWT token for forwarding to CAP service
      const authToken = context.task?.metadata?.authToken || "";

      // Create tools with JWT forwarding
      const tools = createCafeTools(CAP_SERVICE_URL, authToken);

      // Create ReAct agent
      const llm = new OrchestrationClient({
        promptTemplating: { model: { name: "gpt-4o", version: "latest" } },
      });
      const agent = createReactAgent({ llm, tools });

      // Invoke (stateless — each A2A task is independent)
      const result = await agent.invoke({
        messages: [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userMessage)],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const response = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      console.log(`[CafeAssistant] Response: "${response.substring(0, 100)}..."`);

      // 3. Publish result artifact
      eventBus.publish({
        kind: "artifact-update",
        taskId: context.taskId,
        contextId: context.contextId,
        artifact: {
          artifactId: "cafe_response",
          name: "cafe_response",
          parts: [{ kind: "text", text: response }],
        },
      });

      // 4. Signal completion
      eventBus.publish({
        kind: "status-update",
        taskId: context.taskId,
        contextId: context.contextId,
        status: { state: "completed", timestamp: new Date().toISOString() },
        final: true,
      });
    } catch (error) {
      console.error(`[CafeAssistant] Error:`, error.message);
      eventBus.publish({
        kind: "status-update",
        taskId: context.taskId,
        contextId: context.contextId,
        status: { state: "failed", timestamp: new Date().toISOString() },
        final: true,
      });
    }

    eventBus.finished();
  }

  async cancelTask(taskId) {
    console.log(`[CafeAssistant] Task ${taskId} cancelled`);
  }
}

// Agent Card
const agentCard = {
  name: "Café Assistant",
  description: "Friendly café assistant for the office cafeteria. Helps browse the menu, find dietary options, place orders, check order status, and get meal recommendations.",
  url: resolveAppUrl(),
  version: "1.0.0",
  protocolVersion: "0.3.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "cafe_assist",
      name: "Café Assistant",
      description: "Browse menu, place orders, get recommendations, check order status",
      tags: ["cafe", "menu", "orders", "recommendations"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
};

// Server
const app = express();
app.use(cors());
app.use(express.json());

const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), new CafeAssistantExecutor());
new A2AExpressApp(requestHandler).setupRoutes(app);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8081");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Café Assistant Agent listening on port ${PORT}`);
  console.log(`Agent Card: ${resolveAppUrl()}/.well-known/agent.json`);
  console.log(`CAP Service: ${CAP_SERVICE_URL}`);
});
