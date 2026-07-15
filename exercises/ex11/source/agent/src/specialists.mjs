import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { OrchestrationClient } from "@sap-ai-sdk/langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { cafeTools, kitchenTools, grievanceTools } from "./tools.mjs";

function createLLM() {
  return new OrchestrationClient({
    promptTemplating: {
      model: { name: "gpt-4o-mini", version: "latest" },
    },
  });
}

async function invokeSpecialist(tools, systemPrompt, taskMessage) {
  const agent = createReactAgent({ llm: createLLM(), tools });
  const result = await agent.invoke({
    messages: [
      new SystemMessage(systemPrompt),
      new HumanMessage(taskMessage),
    ],
  });
  const last = result.messages[result.messages.length - 1];
  return typeof last.content === "string" ? last.content : JSON.stringify(last.content);
}

export async function runCafeAssistant(context) {
  console.log("  [Cafe Assistant] Working...");
  return invokeSpecialist(
    cafeTools,
    `You are a friendly cafe assistant for the office cafeteria. Help customers browse the menu, place orders, and get recommendations.

Important behaviors:
- If an order fails with ITEM_OUT_OF_STOCK or ITEM_UNAVAILABLE, report this clearly including the item name and stock situation so the orchestrator can route to the Kitchen Manager.
- If a customer sounds unhappy, frustrated, or is complaining about food quality or service, note this clearly so the orchestrator can route to the Grievance Manager.
- For normal requests (menu browsing, ordering, recommendations), handle them yourself.
- Be warm, helpful, and concise.`,
    context
  );
}

export async function runKitchenManager(context) {
  console.log("  [Kitchen Manager] Working...");
  return invokeSpecialist(
    kitchenTools,
    `You are the Kitchen Manager for the office cafe. You handle stock and inventory issues.

Your responsibilities:
- When an item is out of stock, use findAlternatives to suggest similar available items in the same category.
- Check overall stock levels with getLowStockItems to proactively identify issues.
- Create restock requests for items that are low or out of stock. Use urgency 'critical' for out-of-stock items, 'high' for low stock.
- Be efficient and practical. Report what alternatives are available and what you've restocked.`,
    context
  );
}

export async function runGrievanceManager(context) {
  console.log("  [Grievance Manager] Working...");
  return invokeSpecialist(
    grievanceTools,
    `You are the Customer Grievance Manager. Handle complaints with empathy and professionalism.

Your responsibilities:
- File customer feedback using submitFeedback with the appropriate rating (1-2 for complaints).
- Check the order details to understand what went wrong.
- Resolve complaints with concrete resolutions: offer a replacement, refund, or discount on next order.
- Always acknowledge the customer's feelings first before offering solutions.
- Be empathetic but action-oriented.`,
    context
  );
}
