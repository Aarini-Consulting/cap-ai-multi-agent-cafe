import { StateGraph, START, END } from "@langchain/langgraph";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CafeOrchestratorState } from "./types.mjs";
import { runCafeAssistant, runKitchenManager, runGrievanceManager } from "./specialists.mjs";

const supervisorLLM = new OrchestrationClient({
  promptTemplating: {
    model: { name: "gpt-4o-mini", version: "latest" },
  },
});

// -- ORCHESTRATOR NODE -------------------------------------------------------
async function orchestratorNode(state) {
  const iteration = (state.iterationCount || 0) + 1;
  console.log(`\n=== Orchestrator (iteration ${iteration}) ===`);

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
1. For a new customer message, start with CAFE_ASSISTANT unless it's clearly a complaint
2. If CAFE_ASSISTANT reports OUT_OF_STOCK, route to KITCHEN_MANAGER for alternatives
3. After KITCHEN_MANAGER finds alternatives, route back to CAFE_ASSISTANT to offer them
4. If the message is a complaint, route directly to GRIEVANCE_MANAGER
5. After any specialist fully handles the request, respond with FINISH

Respond with EXACTLY one of: CAFE_ASSISTANT, KITCHEN_MANAGER, GRIEVANCE_MANAGER, or FINISH
Then a brief reasoning on the next line.`),
    new HumanMessage(contextSummary),
  ]);

  const responseText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  const lines = responseText.trim().split("\n");
  const decision = lines[0].trim().toUpperCase();
  const reasoning = lines.slice(1).join(" ").trim();

  console.log(`  Decision: ${decision}`);
  if (reasoning) console.log(`  Reasoning: ${reasoning}`);

  let nextAgent = "FINISH";
  if (decision.includes("CAFE_ASSISTANT") || decision.includes("CAFE")) nextAgent = "cafe_assistant";
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

// -- SPECIALIST NODES --------------------------------------------------------

async function cafeAssistantNode(state) {
  const context = [
    `Customer says: "${state.userMessage}"`,
    state.kitchenManagerResult ? `Kitchen Manager update: ${state.kitchenManagerResult}` : "",
    state.grievanceManagerResult ? `Grievance Manager update: ${state.grievanceManagerResult}` : "",
  ].filter(Boolean).join("\n");

  const result = await runCafeAssistant(context);
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

  const result = await runKitchenManager(context);
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

  const result = await runGrievanceManager(context);
  return {
    grievanceManagerResult: result,
    conversationHistory: [{ role: "grievance_manager", content: result }],
  };
}

// -- ROUTING -----------------------------------------------------------------

function routeToAgent(state) {
  const next = state.nextAgent || "FINISH";
  if (next === "FINISH") return "__end__";
  return next;
}

// -- BUILD THE GRAPH ---------------------------------------------------------

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

export const cafeOrchestrator = workflow.compile();
