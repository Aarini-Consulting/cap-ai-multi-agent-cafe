# Exercise 7 — Build the Cafe Assistant Agent

In the previous exercises you built a complete CAP service with all the operations an AI agent needs. Now it is time to build the AI agent that will actually use it.

You will create the **Cafe Assistant** — a standalone agent that connects to your CAP service endpoints as tools. It uses the **[SAP Cloud SDK for AI](https://github.com/SAP/ai-sdk-js)** (`@sap-ai-sdk/langchain`) to call LLMs through SAP AI Core, and **[LangGraph](https://langchain-ai.github.io/langgraphjs/)** to structure the agent workflow. The agent implements the **[A2A (Agent-to-Agent) protocol](https://github.com/google/A2A)** so it can be discovered and orchestrated by other agents later.

---

## Key Concepts

### LangGraph

[**LangGraph**](https://langchain-ai.github.io/langgraphjs/) is an open-source library for building stateful, multi-step workflows with LLMs. It models your agent logic as a **graph** — a set of nodes (steps) connected by edges (transitions). LangGraph provides `createReactAgent`, a prebuilt [ReAct agent](https://react-lm.github.io/) that follows the Reason + Act loop: the LLM reasons about what to do, calls a tool, observes the result, and repeats until it has a final answer.

### SAP Cloud SDK for AI

[**SAP Cloud SDK for AI**](https://github.com/SAP/ai-sdk-js) is SAP's official SDK for interacting with SAP AI Core. The `OrchestrationClient` calls any model available in Generative AI Hub through a unified API — GPT-4o from Azure OpenAI, Claude from Anthropic, or Llama from Meta. You do not need to deploy models yourself; the SDK routes calls through the Orchestration Service.

### A2A Protocol

The [**Agent-to-Agent (A2A) protocol**](https://github.com/google/A2A) is an open standard for agent interoperability. Each agent exposes an **Agent Card** (a JSON manifest describing its capabilities) and handles tasks via a standard HTTP API. This allows agents to discover and communicate with each other without tight coupling.

### How They Work Together

LangGraph handles the agent workflow (reason → act → observe loop). The SAP Cloud SDK for AI handles LLM access and authentication. The A2A protocol handles agent discovery and inter-agent communication. Your CAP service provides the tools (menu, orders, stock) that the agent calls via HTTP.

```
User Message → A2A Protocol → LangGraph ReAct Agent → Tool Call → CAP Service
                                    ↑                      |
                                    └──── LLM (via SAP AI Core) ←──┘
```

---

## Overview

You will build the Cafe Assistant agent step by step:

1. Create the agent project structure with dependencies
2. Build an auth helper for calling the CAP service
3. Define tools with Zod schemas that call CAP service endpoints
4. Create the agent server with A2A protocol support
5. Configure environment variables
6. Run the agent and test it

After building the Cafe Assistant in detail, you will copy the Kitchen Manager and Grievance Manager agents from the solution — they follow the same pattern with different tools.

---

## Step 1: Create the Agent Project

The agent lives in a separate directory (`agents/cafe-assistant/`) alongside your CAP service. It is a standalone Node.js project that calls your CAP service over HTTP.

Create a directory my-cafe/agents/cafe-assistant/src

Create file `my-cafe/agents/cafe-assistant/package.json` and place the following code.

```json
{
  "name": "cafe-assistant-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.mjs",
    "dev": "node --watch src/server.mjs"
  },
  "dependencies": {
    "@a2a-js/sdk": "^0.2.4",
    "@sap-ai-sdk/langchain": "^2.11.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/core": "^1.2.0",
    "langchain": "^1.4.5",
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "zod": "^3.24.0",
    "dotenv": "^16.4.5"
  }
}
```

Install dependencies:

```bash
cd agents/cafe-assistant
npm install --legacy-peer-deps
```

> **Note:** The `--legacy-peer-deps` flag is needed because `@langchain/langgraph` and `@langchain/core` have a peer dependency version mismatch. This is safe and does not affect functionality.

> **What are these dependencies?**
>
> | Package | Purpose |
> |---|---|
> | `@sap-ai-sdk/langchain` | SAP Cloud SDK for AI — LangChain-compatible LLM client that routes through SAP AI Core |
> | `@langchain/langgraph` | LangGraph — provides `createReactAgent` for the ReAct loop |
> | `@langchain/core` | LangChain core — message types (`SystemMessage`, `HumanMessage`), tool definitions |
> | `zod` | Schema validation — defines the shape and types of tool inputs |
> | `@a2a-js/sdk` | A2A protocol SDK — handles agent discovery, task lifecycle, and inter-agent communication |
> | `express` | HTTP server |
> | `dotenv` | Loads environment variables from `.env` file |

---

## Step 2: Create the Auth Helper

The agent calls your CAP service over HTTP. In local development, the CAP service uses mocked auth (basic auth with `cafe-user:initial`). In production on Cloud Foundry, it uses JWT tokens. This helper handles both cases.

Create `agents/cafe-assistant/src/auth.mjs`:

```javascript
/**
 * Auth resolution order:
 * 1. JWT token forwarded from caller (e.g. Joule -> A2A -> agent)
 * 2. Client credentials from XSUAA binding (CF production)
 * 3. Basic auth fallback (local dev with CDS mocked auth)
 */

let _cachedToken = null;
let _tokenExpiry = 0;

async function getClientCredentialsToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const vcap = process.env.VCAP_SERVICES;
  if (!vcap) return null;

  const xsuaa = JSON.parse(vcap).xsuaa?.[0]?.credentials;
  if (!xsuaa) return null;

  const res = await fetch(`${xsuaa.url}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: xsuaa.clientid,
      client_secret: xsuaa.clientsecret,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  _cachedToken = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _cachedToken;
}

export async function resolveAuthHeaders(authToken) {
  let auth;
  if (authToken) {
    auth = `Bearer ${authToken}`;
  } else {
    const ccToken = await getClientCredentialsToken();
    if (ccToken) {
      auth = `Bearer ${ccToken}`;
    } else {
      const user = process.env.CAP_USER || "cafe-user";
      const pass = process.env.CAP_PASSWORD || "initial";
      auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    }
  }
  return { "Content-Type": "application/json", "Authorization": auth };
}
```

> **What's happening here?**
>
> The auth helper tries three strategies in order:
> 1. **JWT forwarding** — if a token is passed from the orchestrator (production A2A flow), use it directly
> 2. **Client credentials** — if running on Cloud Foundry with an XSUAA binding, fetch a token using client credentials grant
> 3. **Basic auth fallback** — for local development, use `cafe-user:initial` (matching the mocked auth from Exercise 3)
>
> This means the same agent code works locally and in production without any changes.

---

## Step 3: Define the Tools

Tools are the bridge between the AI agent and your CAP service. Each tool is a LangChain `tool()` with:
- A **name** the LLM uses to decide which tool to call
- A **description** the LLM reads to understand what the tool does
- A **Zod schema** that defines and validates the input parameters
- An **async function** that calls the CAP service endpoint and returns the result

Create `agents/cafe-assistant/src/tools.mjs`:

```javascript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveAuthHeaders } from "./auth.mjs";

export function createCafeTools(capServiceUrl, authToken) {
  async function get(path) {
    try {
      const headers = await resolveAuthHeaders(authToken);
      const res = await fetch(`${capServiceUrl}${path}`, { headers });
      const data = await res.json();
      if (!res.ok) return JSON.stringify({ error: data.error?.message || res.statusText });
      return JSON.stringify(data.value || data, null, 2);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  }

  async function post(path, body) {
    try {
      const headers = await resolveAuthHeaders(authToken);
      const res = await fetch(`${capServiceUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return JSON.stringify({ error: data.error?.code, message: data.error?.message });
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  }

  const browseMenu = tool(
    async () => get("/api/cafe/Menu"),
    {
      name: "browseMenu",
      description: "Browse the full cafe menu with prices, categories, dietary info, and stock quantities",
      schema: z.object({})
    }
  );

  const getItemsByDietary = tool(
    async ({ preference }) => get(`/api/cafe/getItemsByDietary(preference='${encodeURIComponent(preference)}')`),
    {
      name: "getItemsByDietary",
      description: "Find menu items matching a dietary preference (vegan, vegetarian, gluten_free, dairy_free)",
      schema: z.object({ preference: z.string() })
    }
  );

  const placeOrder = tool(
    async ({ items }) => post("/api/cafe/placeOrder", { items }),
    {
      name: "placeOrder",
      description: "Place an order. Returns ITEM_OUT_OF_STOCK if insufficient stock.",
      schema: z.object({
        items: z.array(z.object({
          itemId: z.string(),
          quantity: z.number().min(1)
        }))
      })
    }
  );

  const cancelOrderItem = tool(
    async ({ orderId, itemId }) => post("/api/cafe/cancelOrderItem", { orderId, itemId }),
    {
      name: "cancelOrderItem",
      description: "Cancel an item from an order. Restores stock.",
      schema: z.object({ orderId: z.string(), itemId: z.string() })
    }
  );

  const getOrderSummary = tool(
    async ({ orderID }) => get(`/api/cafe/getOrderSummary(orderID=${orderID})`),
    {
      name: "getOrderSummary",
      description: "Get full order details including items and totals",
      schema: z.object({ orderID: z.string() })
    }
  );

  const getRecommendation = tool(
    async ({ preferences, budget }) => post("/api/cafe/getRecommendation", { preferences, budget }),
    {
      name: "getRecommendation",
      description: "Get AI meal recommendation based on preferences and budget",
      schema: z.object({ preferences: z.string(), budget: z.number() })
    }
  );

  return [browseMenu, getItemsByDietary, placeOrder, cancelOrderItem, getOrderSummary, getRecommendation];
}
```

> **Understanding the tools:**
>
> - **`createCafeTools(capServiceUrl, authToken)`** is a factory function — it creates tools bound to a specific CAP service URL and auth token. This allows the same tools to work locally (`http://localhost:4004`) and in production (`https://my-cafe.cfapps.eu10.hana.ondemand.com`).
> - **`get()` and `post()` helpers** handle HTTP calls with auth headers and error formatting. Tools always return strings (not objects) because the LLM needs text it can reason about.
> - **Zod schemas** define the exact shape of each tool's input. The LLM reads the schema to know what parameters to provide. For example, `placeOrder` expects `items: [{ itemId: string, quantity: number }]` — the schema enforces this at runtime.
> - **Error handling** returns error JSON instead of throwing — this lets the LLM see the error and decide how to recover (e.g., suggest an alternative for out-of-stock items).

---

## Step 4: Create the Agent Server

The server combines everything: the LLM client, the tools, the ReAct agent, and the A2A protocol handler.

Create `agents/cafe-assistant/src/server.mjs`:

```javascript
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

const SYSTEM_PROMPT = `You are a friendly cafe assistant for the office cafeteria.
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
    eventBus.publish({
      kind: "task",
      id: context.taskId,
      contextId: context.contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [],
    });

    eventBus.publish({
      kind: "status-update",
      taskId: context.taskId,
      contextId: context.contextId,
      status: { state: "working", timestamp: new Date().toISOString() },
      final: false,
    });

    try {
      const userMessage = context.userMessage?.parts
        ?.filter(p => p.kind === "text")
        ?.map(p => p.text)
        ?.join("") ?? "";

      console.log(`[CafeAssistant] Received: "${userMessage}"`);

      const authToken = context.task?.metadata?.authToken || "";
      const tools = createCafeTools(CAP_SERVICE_URL, authToken);

      const llm = new OrchestrationClient({
        promptTemplating: { model: { name: "gpt-4o", version: "latest" } },
      });
      const agent = createReactAgent({ llm, tools });

      const result = await agent.invoke({
        messages: [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userMessage)],
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const response = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      console.log(`[CafeAssistant] Response: "${response.substring(0, 100)}..."`);

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

const agentCard = {
  name: "Cafe Assistant",
  description: "Friendly cafe assistant for the office cafeteria. Helps browse the menu, find dietary options, place orders, check order status, and get meal recommendations.",
  url: resolveAppUrl(),
  version: "1.0.0",
  protocolVersion: "0.3.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "cafe_assist",
      name: "Cafe Assistant",
      description: "Browse menu, place orders, get recommendations, check order status",
      tags: ["cafe", "menu", "orders", "recommendations"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
};

const app = express();
app.use(cors());
app.use(express.json());

const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), new CafeAssistantExecutor());
new A2AExpressApp(requestHandler).setupRoutes(app);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = parseInt(process.env.PORT ?? "8081");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cafe Assistant Agent listening on port ${PORT}`);
  console.log(`Agent Card: ${resolveAppUrl()}/.well-known/agent.json`);
  console.log(`CAP Service: ${CAP_SERVICE_URL}`);
});
```

> **Understanding the server:**
>
> **The ReAct Agent loop:**
> ```javascript
> const llm = new OrchestrationClient({
>   promptTemplating: { model: { name: "gpt-4o", version: "latest" } },
> });
> const agent = createReactAgent({ llm, tools });
> ```
> `createReactAgent` builds a LangGraph agent that follows the ReAct pattern:
> 1. The LLM receives the system prompt, user message, and available tools
> 2. It decides which tool to call (or responds directly)
> 3. The tool executes and returns a result
> 4. The LLM sees the result and decides: call another tool, or produce a final answer
> 5. This loop continues until the LLM has a complete answer
>
> **The A2A protocol:**
> - **Agent Card** — JSON manifest at `/.well-known/agent.json` describing the agent's name, capabilities, and skills. Other agents or orchestrators discover this card to know what the agent can do.
> - **CafeAssistantExecutor** — handles the A2A task lifecycle: receives a user message, runs the ReAct agent, and publishes the response as an artifact.
> - **Task states** — `submitted` → `working` → `completed` (or `failed`). The orchestrator can poll task status.
>
> **The system prompt** is critical — it tells the LLM how to behave as a cafe assistant. The rules are specific: "ALWAYS use your tools", "NEVER respond from memory", "browse the menu first to find the item ID". Without these rules, the LLM might hallucinate menu items or prices.

---

## Step 5: Configure Environment Variables

Create `agents/cafe-assistant/.env`:

```env
AICORE_SERVICE_KEY='<your-ai-core-service-key-json>'
CAP_SERVICE_URL=http://localhost:4004
```

Replace `<your-ai-core-service-key-json>` with the AI Core service key JSON provided for the workshop. This is a single-line JSON string containing `clientid`, `clientsecret`, `url`, and `serviceurls`.

> **Where does the service key come from?**
>
> The `AICORE_SERVICE_KEY` environment variable contains your SAP AI Core credentials. The `OrchestrationClient` from `@sap-ai-sdk/langchain` reads this automatically — no additional configuration needed.

---

## Step 6: Run and Test

Make sure your CAP service is running (from the `my-cafe/` directory):

```bash
cds watch
```

In a **separate terminal**, start the Cafe Assistant agent:

```bash
cd agents/cafe-assistant
npm run dev
```

You should see:

```
Cafe Assistant Agent listening on port 8081
Agent Card: http://localhost:8081/.well-known/agent.json
CAP Service: http://localhost:4004
```

### Test the Agent Card

```bash
curl -s http://localhost:8081/.well-known/agent.json
```

You should see the agent's capabilities manifest.

### Test with an A2A message

```bash
curl -s -X POST http://localhost:8081/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": "test-1",
    "params": {
      "message": {
        "messageId": "msg-1",
        "role": "user",
        "parts": [{"kind": "text", "text": "What vegan options do you have?"}]
      }
    }
  }'
```

The agent will call the `getItemsByDietary` tool on your CAP service and return the vegan menu items.

---

## Step 7: Add the Kitchen Manager and Grievance Manager

The Kitchen Manager and Grievance Manager agents follow the same pattern as the Cafe Assistant — different tools and system prompts, but the same architecture (ReAct agent + A2A protocol + auth helper).

Copy them from the solution:

Copy the agents kitchen-manager and grievance-manager from the solution and place it in the agents folder. 


Then install dependencies for each:

```bash
cd agents/kitchen-manager && npm install --legacy-peer-deps
cd agents/grievance-manager && npm install --legacy-peer-deps
```

| Agent | Port | Tools |
|---|---|---|
| Cafe Assistant | 8081 | browseMenu, getItemsByDietary, placeOrder, cancelOrderItem, getOrderSummary, getRecommendation |
| Kitchen Manager | 8082 | checkStock, getLowStockItems, createRestockRequest, fulfillRestockRequest, findAlternatives, getItemDemand, getRestockDetails |
| Grievance Manager | 8083 | submitFeedback, getFeedbackDetails, getOpenComplaints, resolveComplaint, generateComplaintResponse |

Each agent has its own `.env` file with the same `AICORE_SERVICE_KEY` and `CAP_SERVICE_URL`.

---

## Summary

You built the Cafe Assistant agent with:

- **Tools** (`tools.mjs`) — 6 LangChain tools with Zod schemas that call CAP service endpoints over HTTP
- **Auth** (`auth.mjs`) — handles JWT forwarding, client credentials, and basic auth fallback
- **Server** (`server.mjs`) — ReAct agent using `createReactAgent` from LangGraph, exposed via the A2A protocol
- **OrchestrationClient** from `@sap-ai-sdk/langchain` — routes LLM calls through SAP AI Core

The agent follows the ReAct loop: the LLM reasons about the user's request, calls tools to interact with the CAP service, observes the results, and produces a natural language response.

---

## Further Reading

- [LangGraph.js Documentation](https://langchain-ai.github.io/langgraphjs/) — building stateful agent workflows
- [SAP Cloud SDK for AI (JavaScript)](https://github.com/SAP/ai-sdk-js) — OrchestrationClient and model access
- [LangChain Tools](https://js.langchain.com/docs/concepts/tools) — defining tools with schemas
- [A2A Protocol Specification](https://github.com/google/A2A) — agent discovery and inter-agent communication
- [Zod Documentation](https://zod.dev/) — schema validation for tool inputs

---

[Continue to Exercise 8 →](../ex8/README.md)
