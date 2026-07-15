import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveAuthHeaders } from "./auth.mjs";

export function createKitchenTools(capServiceUrl, authToken) {
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

  const checkStock = tool(
    async ({ itemId }) => get(`/api/cafe/checkStock(itemId=${itemId})`),
    { name: "checkStock", description: "Check the current stock level for a specific menu item", schema: z.object({ itemId: z.string() }) }
  );

  const getLowStockItems = tool(
    async () => get("/api/cafe/getLowStockItems()"),
    { name: "getLowStockItems", description: "Get a list of all items that are running low on stock", schema: z.object({}) }
  );

  const createRestockRequest = tool(
    async ({ itemId, quantity, urgency, notes }) => post("/api/cafe/createRestockRequest", { itemId, quantity, urgency, notes }),
    { name: "createRestockRequest", description: "Create a restocking request for an item with specified quantity, urgency level, and notes", schema: z.object({ itemId: z.string(), quantity: z.number().min(1), urgency: z.string(), notes: z.string() }) }
  );

  const fulfillRestockRequest = tool(
    async ({ requestId }) => post("/api/cafe/fulfillRestockRequest", { requestId }),
    { name: "fulfillRestockRequest", description: "Mark a restock request as fulfilled and update the stock accordingly", schema: z.object({ requestId: z.string() }) }
  );

  const findAlternatives = tool(
    async ({ itemId }) => get(`/api/cafe/findAlternatives(itemId=${itemId})`),
    { name: "findAlternatives", description: "Find alternative menu items that can substitute for a given item", schema: z.object({ itemId: z.string() }) }
  );

  const getItemDemand = tool(
    async ({ itemId }) => get(`/api/cafe/getItemDemand(itemId=${itemId})`),
    { name: "getItemDemand", description: "Analyze order history and demand for a menu item. Returns total units ordered, order count, and a restock recommendation based on demand vs current stock.", schema: z.object({ itemId: z.string().describe("UUID of the menu item to analyze demand for") }) }
  );

  const getRestockDetails = tool(
    async ({ requestId }) => get(`/api/cafe/getRestockDetails(requestId=${requestId})`),
    { name: "getRestockDetails", description: "Get full details of a restock request including the item, quantity, urgency, and demand analysis. Use this when asked whether to fulfill a specific restock request.", schema: z.object({ requestId: z.string().describe("UUID of the restock request to analyze") }) }
  );

  return [checkStock, getLowStockItems, createRestockRequest, fulfillRestockRequest, findAlternatives, getItemDemand, getRestockDetails];
}
