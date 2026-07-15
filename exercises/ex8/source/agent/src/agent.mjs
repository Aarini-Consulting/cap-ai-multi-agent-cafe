import { OrchestrationClient } from '@sap-ai-sdk/langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { allTools } from './tools.mjs';

const SYSTEM_PROMPT = `You are a friendly and helpful cafe assistant for the office cafeteria.
You help colleagues browse the menu, find items that match their dietary needs,
place orders, check order status, and cancel items if needed.

Guidelines:
- Always check the menu first before making recommendations
- When placing orders, confirm the items and quantities with the user
- If a user asks about dietary options, use the getItemsByDietary tool
- Present prices in EUR with the euro symbol
- Be conversational and warm, but concise
- If something goes wrong, explain the issue clearly and suggest alternatives`;

export function createAgent() {
  const llm = new OrchestrationClient({
    promptTemplating: {
      model: { name: 'gpt-4o-mini', version: 'latest' },
    },
  });

  return createReactAgent({
    llm,
    tools: allTools,
    prompt: SYSTEM_PROMPT,
  });
}
