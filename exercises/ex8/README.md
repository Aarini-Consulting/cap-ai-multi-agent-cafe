# Exercise 8 — Build the Multi-Agent Orchestrator

In Exercise 7 you built three specialist agents — Cafe Assistant, Kitchen Manager, and Grievance Manager — each running as an independent A2A service. But who decides which agent to call? If a customer says "I'd like to order a flat white but I heard you're out of orange juice — also, my last order was terrible", that message touches all three domains.

In this exercise you will build the **orchestrator** — a LangGraph `StateGraph` that uses a supervisor LLM to route messages to the right specialist, observe results, and decide whether to call another specialist or produce a final response.

---

## Key Concepts

### Supervisor Pattern

The orchestrator uses the **supervisor pattern**: a central LLM decides which specialist to delegate to at each step. This is different from a fixed pipeline where agents always run in the same order.

```
                         ┌──────────────┐
                    ┌───→│Cafe Assistant │───┐
                    │    └──────────────┘    │
┌──────────────┐    │    ┌──────────────┐    │    ┌──────────────┐
│  Orchestrator│───→├───→│Kitchen Manager│───→├───→│  Orchestrator│───→ FINISH
│  (Supervisor)│    │    └──────────────┘    │    │  (next step) │
└──────────────┘    │    ┌────────────────┐  │    └──────────────┘
                    └───→│Grievance Mgr   │──┘
                         └────────────────┘
```

The orchestrator loops: route → specialist → observe → route again (or finish). This handles multi-domain requests naturally — the supervisor sees each specialist's result and decides what to do next.

### LangGraph StateGraph

Unlike Exercise 7 where we used `createReactAgent` (a prebuilt agent), the orchestrator uses LangGraph's `StateGraph` directly. This gives you explicit control over:

- **State** — what data flows between nodes
- **Nodes** — the orchestrator and each specialist wrapper
- **Conditional edges** — the routing logic that decides the next step

---

## Overview

You will:

1. Define the orchestrator state with `Annotation.Root`
2. Create the A2A calling function
3. Build the supervisor node (routes to specialists using an LLM)
4. Build specialist wrapper nodes
5. Wire the graph with conditional edges
6. Connect the orchestrator to the CAP service
7. Test the full multi-agent flow

---

## Step 1: Create the Orchestrator File

Create `agents/orchestrator.mjs` in the `agents/` folder (alongside the specialist agent folders):

Create a file inside the agents folder and name it `orchestrator.mjs`.

```bash
touch agents/orchestrator.mjs
```


Install the following node packages. 

```
npm install @sap-ai-sdk/langchain @langchain/langgraph @langchain/core langchain zod
```

In the root of the cap project `my-cafe`, add .env file and add the environment variables for AI Core key. 
```
CAP_SERVICE_URL=http://localhost:4004
AICORE_SERVICE_KEY=
```

Add the imports and agent URLs to file agents/orchestrator.mjs:

```javascript
import "dotenv/config";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// A2A Agent URLs (from env or defaults)
const CAFE_ASSISTANT_URL = process.env.CAFE_ASSISTANT_URL || "http://localhost:8081";
const KITCHEN_MANAGER_URL = process.env.KITCHEN_MANAGER_URL || "http://localhost:8082";
const GRIEVANCE_MANAGER_URL = process.env.GRIEVANCE_MANAGER_URL || "http://localhost:8083";
```

---

## Step 2: Define the Orchestrator State

The state tracks the user's message, each specialist's result, routing decisions, and iteration count. This is the communication protocol between nodes — every node reads from and writes to this shared state.

Add to `agents/orchestrator.mjs`:

```javascript
const CafeOrchestratorState = Annotation.Root({
  userMessage: Annotation,
  conversationHistory: Annotation({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  nextAgent: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  iterationCount: Annotation({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  cafeAssistantResult: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  kitchenManagerResult: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  grievanceManagerResult: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  finalResponse: Annotation({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
});
```

> **Understanding the state:**
>
> - `userMessage` — the original customer message, unchanged throughout the flow
> - `conversationHistory` — uses a **reducer** that appends new entries instead of replacing. Each node adds its contribution.
> - `cafeAssistantResult`, `kitchenManagerResult`, `grievanceManagerResult` — each specialist's response. The orchestrator reads these to decide what to do next.
> - `nextAgent` — the routing decision: which specialist to call next (or `"FINISH"`)
> - `iterationCount` — safety limit to prevent infinite loops
> - `finalResponse` — the response to return to the user when the orchestrator decides to finish

---

## Step 3: Create the A2A Calling Function

This function calls a specialist agent via the A2A protocol over HTTP — it discovers the agent card, sends a message, and extracts the text response.

Add to `agents/orchestrator.mjs`:

```javascript
async function callA2AAgent(agentUrl, message, authToken) {
  try {
    // Discover agent card
    const cardRes = await fetch(`${agentUrl}/.well-known/agent.json`);
    if (!cardRes.ok) throw new Error(`Agent card not found at ${agentUrl}`);
    const card = await cardRes.json();

    console.log(`[orchestrator] Calling ${card.name} at ${agentUrl}`);

    // Send A2A message
    const taskRes = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { "Authorization": `Bearer ${authToken}` }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        id: crypto.randomUUID(),
        params: {
          message: {
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text: message }],
          },
        },
      }),
    });

    if (!taskRes.ok) {
      const errText = await taskRes.text();
      throw new Error(`A2A task failed (${taskRes.status}): ${errText}`);
    }

    const taskResult = await taskRes.json();

    // Extract text from A2A JSON-RPC response
    const result = taskResult.result || taskResult;
    const artifacts = result.artifacts || [];
    const text = artifacts
      .flatMap(a => a.parts || [])
      .filter(p => p.kind === "text")
      .map(p => p.text)
      .join("\n")
      || result.status?.message?.parts?.[0]?.text
      || (typeof result === "string" ? result : "No response");

    console.log(`[orchestrator] ${card.name} responded (${text.length} chars)`);
    return text;
  } catch (err) {
    console.error(`[orchestrator] Error calling ${agentUrl}:`, err.message);
    return `Error calling agent at ${agentUrl}: ${err.message}`;
  }
}
```

> **What's happening here?**
>
> 1. **Discover** — fetches `/.well-known/agent.json` to learn the agent's name and capabilities
> 2. **Send** — sends a JSON-RPC `message/send` request with the user's message
> 3. **Extract** — parses the A2A response to get the text content from artifacts
> 4. **Error handling** — returns error text instead of throwing, so the orchestrator LLM can see what went wrong and decide how to recover

---

## Step 4: Build the Supervisor Node

The supervisor node is the brain of the orchestrator. It receives the current state (which specialists have been called, what they returned), sends this context to an LLM, and gets back a routing decision: which specialist to call next, or `FINISH`.

Add to `agents/orchestrator.mjs`:

```javascript
export function createCafeOrchestrator(authToken) {
  const supervisorLLM = new OrchestrationClient({
    promptTemplating: {
      model: { name: "gpt-4o", version: "latest" },
    },
  });

  async function orchestratorNode(state) {
    const iteration = (state.iterationCount || 0) + 1;
    console.log(`[orchestrator] Iteration ${iteration}: "${state.userMessage?.substring(0, 80)}"`);

    // Safety limit
    if (iteration > 6) {
      return {
        nextAgent: "FINISH",
        iterationCount: iteration,
        finalResponse: state.cafeAssistantResult || state.kitchenManagerResult || state.grievanceManagerResult || "I apologize, I wasn't able to fully resolve your request.",
        conversationHistory: [{ role: "orchestrator", content: "Max iterations reached." }],
      };
    }

    const contextSummary = `
USER MESSAGE: ${state.userMessage}

CURRENT STATE:
- Cafe Assistant Result: ${state.cafeAssistantResult || "Not yet called"}
- Kitchen Manager Result: ${state.kitchenManagerResult || "Not yet called"}
- Grievance Manager Result: ${state.grievanceManagerResult || "Not yet called"}
- Iteration: ${iteration}
`.trim();

    const response = await supervisorLLM.invoke([
      new SystemMessage(`You are the Cafe Orchestrator. You coordinate three specialist agents to serve customers.

Available specialists:
- CAFE_ASSISTANT: Handles menu browsing, ordering, recommendations. Use for all normal requests.
- KITCHEN_MANAGER: Handles stock issues. Route here when:
  - An order fails because an item is OUT_OF_STOCK or UNAVAILABLE
  - The cafe assistant reports low stock warnings
  - Customer asks about availability and stock is a concern
- GRIEVANCE_MANAGER: Handles complaints. Route here when:
  - Customer expresses dissatisfaction, frustration, or anger
  - Customer says food was bad, cold, wrong, late, overpriced
  - Customer asks for refund, replacement, or compensation
  - Customer gives negative feedback (rating 1-2)

Routing rules:
1. If ALL specialist results show "Not yet called", route to CAFE_ASSISTANT (unless it's clearly a complaint, then GRIEVANCE_MANAGER)
2. If CAFE_ASSISTANT has already responded AND there is no OUT_OF_STOCK or stock issue, respond with FINISH
3. If CAFE_ASSISTANT reports OUT_OF_STOCK or ITEM_UNAVAILABLE, route to KITCHEN_MANAGER
4. After KITCHEN_MANAGER finds alternatives, route back to CAFE_ASSISTANT to offer them
5. If the message is a complaint, route directly to GRIEVANCE_MANAGER
6. If ANY specialist has already provided a complete response to the user's request, respond with FINISH
7. NEVER call the same specialist twice unless new information was provided by another specialist

Respond with EXACTLY one of: CAFE_ASSISTANT, KITCHEN_MANAGER, GRIEVANCE_MANAGER, or FINISH
Then a brief reasoning on the next line.`),
      new HumanMessage(contextSummary),
    ]);

    const responseText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const lines = responseText.trim().split("\\n");
    const decision = lines[0].trim().toUpperCase();
    const reasoning = lines.slice(1).join(" ").trim();

    console.log(`[orchestrator] Decision: ${decision} — ${reasoning}`);

    let nextAgent = "FINISH";
    if (decision.includes("CAFE_ASSISTANT")) nextAgent = "cafe_assistant";
    else if (decision.includes("KITCHEN")) nextAgent = "kitchen_manager";
    else if (decision.includes("GRIEVANCE")) nextAgent = "grievance_manager";

    let finalResponse = state.finalResponse;
    if (nextAgent === "FINISH") {
      finalResponse =
        state.grievanceManagerResult ||
        state.kitchenManagerResult ||
        state.cafeAssistantResult ||
        "Your request has been processed.";
    }

    return {
      nextAgent,
      iterationCount: iteration,
      finalResponse,
      conversationHistory: [{ role: "orchestrator", content: `Routing to: ${decision}. ${reasoning}` }],
    };
  }
// Specialist wrapper nodes
  async function cafeAssistantNode(state) {
    const context = [
      `Customer says: "${state.userMessage}"`,
      state.kitchenManagerResult ? `Kitchen Manager update: ${state.kitchenManagerResult}` : "",
      state.grievanceManagerResult ? `Grievance Manager update: ${state.grievanceManagerResult}` : "",
    ].filter(Boolean).join("\n");

    const result = await callA2AAgent(CAFE_ASSISTANT_URL, context, authToken);
    return {
      cafeAssistantResult: result,
      conversationHistory: [{ role: "cafe_assistant", content: result }],
    };
  }

  async function kitchenManagerNode(state) {
    const context = [
      `Customer request: "${state.userMessage}"`,
      state.cafeAssistantResult ? `Cafe Assistant reported: ${state.cafeAssistantResult}` : "",
    ].filter(Boolean).join("\n");

    const result = await callA2AAgent(KITCHEN_MANAGER_URL, context, authToken);
    return {
      kitchenManagerResult: result,
      conversationHistory: [{ role: "kitchen_manager", content: result }],
    };
  }

  async function grievanceManagerNode(state) {
    const context = [
      `Customer complaint: "${state.userMessage}"`,
      state.cafeAssistantResult ? `Order context from Cafe Assistant: ${state.cafeAssistantResult}` : "",
    ].filter(Boolean).join("\n");

    const result = await callA2AAgent(GRIEVANCE_MANAGER_URL, context, authToken);
    return {
      grievanceManagerResult: result,
      conversationHistory: [{ role: "grievance_manager", content: result }],
    };
  }

  // Routing function
  function routeToAgent(state) {
    const next = state.nextAgent || "FINISH";
    if (next === "FINISH") return "__end__";
    return next;
  }

  // Build the graph
  const workflow = new StateGraph(CafeOrchestratorState);

  workflow.addNode("orchestrator", orchestratorNode);
  workflow.addNode("cafe_assistant", cafeAssistantNode);
  workflow.addNode("kitchen_manager", kitchenManagerNode);
  workflow.addNode("grievance_manager", grievanceManagerNode);

  workflow.addEdge(START, "orchestrator");

  workflow.addConditionalEdges("orchestrator", routeToAgent, {
    cafe_assistant: "cafe_assistant",
    kitchen_manager: "kitchen_manager",
    grievance_manager: "grievance_manager",
    __end__: END,
  });

  workflow.addEdge("cafe_assistant", "orchestrator");
  workflow.addEdge("kitchen_manager", "orchestrator");
  workflow.addEdge("grievance_manager", "orchestrator");

  return workflow.compile();
}
```

> **Understanding the supervisor:**
>
> - **Context summary** — the orchestrator sends the user message plus all specialist results so far to the LLM. The LLM sees the full picture and makes an informed routing decision.
> - **Routing rules** in the system prompt prevent common mistakes: calling the same specialist twice, forgetting to finish, or misrouting complaints.
> - **Safety limit** (`iteration > 6`) prevents infinite loops if the LLM keeps routing without finishing.
> - **Decision parsing** — the LLM responds with a specialist name and reasoning. The code normalizes this to a graph node name.

> **Understanding the graph:**
>
> ```
> START → orchestrator → (conditional) → specialist → orchestrator → ... → END
> ```
>
> - **`addConditionalEdges`** — after the orchestrator node runs, `routeToAgent` reads `state.nextAgent` and returns the node name to execute next. If `"FINISH"`, it returns `"__end__"` which maps to `END`.
> - **Specialist → orchestrator edges** — after any specialist runs, control always returns to the orchestrator. The orchestrator then decides whether to call another specialist or finish.
> - **Context enrichment** — each specialist wrapper passes context from other specialists. For example, if the kitchen manager found alternatives, the cafe assistant wrapper includes that in its context so the cafe assistant can offer them to the customer.

---

## Step 5: Connect to the CAP Service

The orchestrator is called from the CAP service's `invokeAgent` action. Open `srv/cafe-service.cds` and add the `invokeAgent` action at the end of the service definition:

```cds
  // -- Agent Orchestration ------------------------------------------------

  @description: 'Invoke the multi-agent orchestrator. Routes the message to the appropriate specialist (Cafe Assistant, Kitchen Manager, or Grievance Manager) and returns the final response.'
  action invokeAgent(
    @description: 'The user message to process' message : String
  ) returns String;
```

Then add the handler in `srv/cafe-service.js`. Add this at the top of the `cds.service.impl` function, before the other handlers:

```javascript
  // Lazy-loaded orchestrator (ESM module loaded via dynamic import)
  let _orchestrator = null;
  async function getOrchestrator(req) {
    if (!_orchestrator) {
      const { createCafeOrchestrator } = await import('../agents/orchestrator.mjs');
      const authToken = req?.headers?.authorization?.replace('Bearer ', '') || '';
      _orchestrator = createCafeOrchestrator(authToken);
    }
    return _orchestrator;
  }
```

Copy paste the following code inside your service implementation. 

```
  this.on('invokeAgent', async (req) => {
    const { message } = req.data;
    if (!message) return req.reject(400, 'MISSING_MESSAGE', 'Please provide a message');

    try {
      const orchestrator = await getOrchestrator(req);
      const result = await orchestrator.invoke({ userMessage: message });
      console.log(`[invokeAgent] Done (${result.iterationCount} iterations)`);
      return result.finalResponse;
    } catch (err) {
      console.error('[invokeAgent] Agent error:', err.message);
      return req.reject(500, 'AGENT_ERROR', `Agent orchestration failed: ${err.message}`);
    }
  });
```

> **Why dynamic import?**
>
> The orchestrator is an ESM module (`.mjs`) but CAP's service handler uses CommonJS (`require`). The `await import()` bridges this gap. The orchestrator is lazy-loaded on first use and cached.

---

## Step 6: Test the Multi-Agent Flow

Start all four processes in separate terminals:

**Terminal 1 — CAP Service:**
```bash
cd my-cafe
cds watch
```

**Terminal 2 — Cafe Assistant:**
```bash
cd agents/cafe-assistant
npm run dev
```

**Terminal 3 — Kitchen Manager:**
```bash
cd agents/kitchen-manager
npm run dev
```

**Terminal 4 — Grievance Manager:**
```bash
cd agents/grievance-manager
npm run dev
```

### Test: Simple order (routes to Cafe Assistant only)

```bash
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/invokeAgent \
  -H "Content-Type: application/json" \
  -d '{"message": "What vegan options do you have?"}'
```

The orchestrator should route to the Cafe Assistant, which browses the menu and returns vegan items.

### Test: Out-of-stock scenario (routes to Cafe Assistant → Kitchen Manager)

```bash
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/invokeAgent \
  -H "Content-Type: application/json" \
  -d '{"message": "I want to order a fresh orange juice"}'
```

The orchestrator should:
1. Route to Cafe Assistant → order fails (OJ is out of stock)
2. Route to Kitchen Manager → checks stock, finds alternatives
3. Route back to Cafe Assistant → offers alternative drinks

### Test: Complaint (routes to Grievance Manager)

```bash
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/invokeAgent \
  -H "Content-Type: application/json" \
  -d '{"message": "My pasta was stone cold and the service was terrible. I want a refund."}'
```

The orchestrator should route directly to the Grievance Manager.

---

## Summary

You built a multi-agent orchestrator using LangGraph's `StateGraph`:

- **Supervisor pattern** — an LLM decides which specialist to call based on the user message and accumulated results
- **Conditional routing** — `addConditionalEdges` dynamically routes to the right specialist
- **A2A protocol** — specialists are called over HTTP using the Agent-to-Agent protocol
- **Context enrichment** — each specialist receives context from other specialists' results
- **Safety limits** — max 6 iterations prevents infinite loops
- **CAP integration** — the orchestrator is invoked via the `invokeAgent` CDS action

The key insight: the orchestrator never handles domain logic itself — it only decides *who* should handle it. This separation of concerns means you can add new specialists (e.g., a Barista Agent for coffee customization) without changing the orchestrator's code.

---

## Further Reading

- [LangGraph StateGraph](https://langchain-ai.github.io/langgraphjs/how-tos/create-react-agent/) — building custom state graphs with conditional edges
- [A2A Protocol Specification](https://github.com/google/A2A) — agent discovery and inter-agent communication
- [SAP Cloud SDK for AI](https://github.com/SAP/ai-sdk-js) — OrchestrationClient for LLM access
- [Multi-Agent Systems](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/) — LangGraph patterns for multi-agent orchestration

---

[Continue to Exercise 9 →](../ex9/README.md)
