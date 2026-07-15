import "dotenv/config";
import express from "express";
import cors from "cors";
import { A2AExpressApp, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createGrievanceTools } from "./tools.mjs";

const CAP_SERVICE_URL = process.env.CAP_SERVICE_URL || "http://localhost:4004";

function resolveAppUrl() {
  const vcap = process.env.VCAP_APPLICATION;
  if (vcap) {
    const { application_uris } = JSON.parse(vcap);
    if (application_uris?.[0]) return `https://${application_uris[0]}`;
  }
  return `http://localhost:${process.env.PORT ?? "8083"}`;
}

const SYSTEM_PROMPT = `You are the Grievance Manager for the office cafeteria.
You handle customer feedback, complaints, and ensure every concern is addressed
with empathy, professionalism, and a commitment to resolution.

Guidelines:
- Always acknowledge the customer's feelings and frustrations first
- Review complaint details thoroughly before responding
- Provide clear, actionable resolutions when resolving complaints
- Use the AI response generator for crafting empathetic replies when appropriate
- Track open complaints and follow up proactively
- Escalate recurring issues and identify patterns in feedback
- Be warm, understanding, and solution-oriented in all interactions
- Present feedback ratings and details clearly`;

class GrievanceManagerExecutor {
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
      const tools = createGrievanceTools(CAP_SERVICE_URL, authToken);

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
          artifactId: "grievance_response",
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
    console.log(`[GrievanceManager] Task ${taskId} cancelled`);
  }
}

// Agent Card
const agentCard = {
  name: "Grievance Manager",
  description: "Grievance Manager for the office cafeteria. Handles customer feedback, complaints, resolutions, and generates empathetic responses to ensure customer satisfaction.",
  url: resolveAppUrl(),
  version: "1.0.0",
  protocolVersion: "0.3.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "grievance_manage",
      name: "Grievance Manager",
      description: "Submit feedback, review complaints, resolve issues, generate empathetic responses",
      tags: ["complaints", "feedback", "resolution", "customer-service"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
};

// Server
const app = express();
app.use(cors());
app.use(express.json());

const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), new GrievanceManagerExecutor());
new A2AExpressApp(requestHandler).setupRoutes(app);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8083");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Grievance Manager Agent listening on port ${PORT}`);
  console.log(`Agent Card: ${resolveAppUrl()}/.well-known/agent.json`);
  console.log(`CAP Service: ${CAP_SERVICE_URL}`);
});
