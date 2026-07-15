import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ── Structured logger ───────────────────────────────────────────────
let LOG;
try {
  const cds = await import('@sap/cds');
  LOG = cds.default?.log?.('agent.orchestrator') || console;
} catch {
  LOG = console;
}

// ── A2A Agent URLs (from env or defaults) ───────────────────────────
const CAFE_ASSISTANT_URL = process.env.CAFE_ASSISTANT_URL || "http://localhost:8081";
const KITCHEN_MANAGER_URL = process.env.KITCHEN_MANAGER_URL || "http://localhost:8082";
const GRIEVANCE_MANAGER_URL = process.env.GRIEVANCE_MANAGER_URL || "http://localhost:8083";

// ── State Definition ────────────────────────────────────────────────
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

// ── Call an A2A agent via HTTP ───────────────────────────────────────
async function callA2AAgent(agentUrl, message, authToken) {
  const start = performance.now();
  const agentName = agentUrl.split('/').pop() || agentUrl;

  try {
    // Discover agent card
    const cardRes = await fetch(`${agentUrl}/.well-known/agent.json`);
    if (!cardRes.ok) throw new Error(`Agent card not found at ${agentUrl}`);
    const card = await cardRes.json();
    const skillId = card.skills?.[0]?.id || "default";

    LOG.info('a2a.call', { agent: card.name, url: agentUrl, skillId });

    // Send A2A message (POST to root, method in JSON-RPC body)
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
    const duration = Math.round(performance.now() - start);

    LOG.info('a2a.response', { raw: JSON.stringify(taskResult).substring(0, 500) });

    // Extract text from A2A JSON-RPC response
    // Response structure: { jsonrpc: "2.0", id: "...", result: { artifacts: [...], status: {...} } }
    const result = taskResult.result || taskResult;
    const artifacts = result.artifacts || [];
    const text = artifacts
      .flatMap(a => a.parts || [])
      .filter(p => p.kind === "text")
      .map(p => p.text)
      .join("\n")
      || result.status?.message?.parts?.[0]?.text
      || (typeof result === "string" ? result : "No response");

    LOG.info('a2a.complete', { agent: card.name, durationMs: duration, resultLength: text.length });
    return text;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    LOG.error('a2a.error', { url: agentUrl, error: err.message, durationMs: duration });
    return `Error calling agent at ${agentUrl}: ${err.message}`;
  }
}

// ── Create Orchestrator ─────────────────────────────────────────────
export function createCafeOrchestrator(authToken) {
  const supervisorLLM = new OrchestrationClient({
    promptTemplating: {
      model: { name: "gpt-4o", version: "latest" },
    },
  });

  // ── ORCHESTRATOR NODE ───────────────────────────────────────────
  async function orchestratorNode(state) {
    const iteration = (state.iterationCount || 0) + 1;
    const iterStart = performance.now();
    LOG.info('orchestrator.iteration', { iteration, userMessage: state.userMessage?.substring(0, 80) });

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
- Café Assistant Result: ${state.cafeAssistantResult || "Not yet called"}
- Kitchen Manager Result: ${state.kitchenManagerResult || "Not yet called"}
- Grievance Manager Result: ${state.grievanceManagerResult || "Not yet called"}
- Iteration: ${iteration}
`.trim();

    const response = await supervisorLLM.invoke([
      new SystemMessage(`You are the Café Orchestrator. You coordinate three specialist agents to serve customers.

Available specialists:
- CAFE_ASSISTANT: Handles menu browsing, ordering, recommendations. Use for all normal requests.
- KITCHEN_MANAGER: Handles stock issues. Route here when:
  - An order fails because an item is OUT_OF_STOCK or UNAVAILABLE
  - The café assistant reports low stock warnings
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

CRITICAL: If a specialist result is not "Not yet called", it means that specialist has already responded. Do NOT call the same specialist again unless another specialist provided new context.

Respond with EXACTLY one of: CAFE_ASSISTANT, KITCHEN_MANAGER, GRIEVANCE_MANAGER, or FINISH
Then a brief reasoning on the next line.`),
      new HumanMessage(contextSummary),
    ]);

    const responseText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const lines = responseText.trim().split("\n");
    const decision = lines[0].trim().toUpperCase();
    const reasoning = lines.slice(1).join(" ").trim();

    const iterDuration = Math.round(performance.now() - iterStart);
    LOG.info('orchestrator.decision', { iteration, decision, reasoning, durationMs: iterDuration });

    let nextAgent = "FINISH";
    if (decision.includes("CAFE_ASSISTANT") || decision.includes("CAFÉ")) nextAgent = "cafe_assistant";
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

  // ── SPECIALIST NODES (call A2A agents via HTTP) ─────────────────

  async function cafeAssistantNode(state) {
    const start = performance.now();
    LOG.info('specialist.start', { agent: 'cafe_assistant', url: CAFE_ASSISTANT_URL });

    const context = [
      `Customer says: "${state.userMessage}"`,
      state.kitchenManagerResult ? `Kitchen Manager update: ${state.kitchenManagerResult}` : "",
      state.grievanceManagerResult ? `Grievance Manager update: ${state.grievanceManagerResult}` : "",
    ].filter(Boolean).join("\n");

    const result = await callA2AAgent(CAFE_ASSISTANT_URL, context, authToken);
    LOG.info('specialist.complete', { agent: 'cafe_assistant', durationMs: Math.round(performance.now() - start) });

    return {
      cafeAssistantResult: result,
      conversationHistory: [{ role: "cafe_assistant", content: result }],
    };
  }

  async function kitchenManagerNode(state) {
    const start = performance.now();
    LOG.info('specialist.start', { agent: 'kitchen_manager', url: KITCHEN_MANAGER_URL });

    const context = [
      `Customer request: "${state.userMessage}"`,
      state.cafeAssistantResult ? `Café Assistant reported: ${state.cafeAssistantResult}` : "",
    ].filter(Boolean).join("\n");

    const result = await callA2AAgent(KITCHEN_MANAGER_URL, context, authToken);
    LOG.info('specialist.complete', { agent: 'kitchen_manager', durationMs: Math.round(performance.now() - start) });

    return {
      kitchenManagerResult: result,
      conversationHistory: [{ role: "kitchen_manager", content: result }],
    };
  }

  async function grievanceManagerNode(state) {
    const start = performance.now();
    LOG.info('specialist.start', { agent: 'grievance_manager', url: GRIEVANCE_MANAGER_URL });

    const context = [
      `Customer complaint: "${state.userMessage}"`,
      state.cafeAssistantResult ? `Order context from Café Assistant: ${state.cafeAssistantResult}` : "",
    ].filter(Boolean).join("\n");

    const result = await callA2AAgent(GRIEVANCE_MANAGER_URL, context, authToken);
    LOG.info('specialist.complete', { agent: 'grievance_manager', durationMs: Math.round(performance.now() - start) });

    return {
      grievanceManagerResult: result,
      conversationHistory: [{ role: "grievance_manager", content: result }],
    };
  }

  // ── ROUTING ─────────────────────────────────────────────────────

  function routeToAgent(state) {
    const next = state.nextAgent || "FINISH";
    if (next === "FINISH") return "__end__";
    return next;
  }

  // ── BUILD THE GRAPH ─────────────────────────────────────────────

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
