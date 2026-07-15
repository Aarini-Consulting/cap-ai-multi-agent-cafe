import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates café assistant tools that call the CAP service via HTTP
 * with JWT token forwarding for authentication.
 */
export function createCafeTools(capServiceUrl, authToken) {
  const headers = {
    "Content-Type": "application/json",
    ...(authToken && { "Authorization": `Bearer ${authToken}` }),
  };

  async function get(path) {
    try {
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
    { name: "browseMenu", description: "Browse the full café menu with prices, categories, dietary info, and stock quantities", schema: z.object({}) }
  );

  const getItemsByDietary = tool(
    async ({ preference }) => get(`/api/cafe/getItemsByDietary(preference='${encodeURIComponent(preference)}')`),
    { name: "getItemsByDietary", description: "Find menu items matching a dietary preference (vegan, vegetarian, gluten_free, dairy_free)", schema: z.object({ preference: z.string() }) }
  );

  const placeOrder = tool(
    async ({ items }) => post("/api/cafe/placeOrder", { items }),
    { name: "placeOrder", description: "Place an order. Returns ITEM_OUT_OF_STOCK if insufficient stock.", schema: z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.number().min(1) })) }) }
  );

  const cancelOrderItem = tool(
    async ({ orderId, itemId }) => post("/api/cafe/cancelOrderItem", { orderId, itemId }),
    { name: "cancelOrderItem", description: "Cancel an item from an order. Restores stock.", schema: z.object({ orderId: z.string(), itemId: z.string() }) }
  );

  const getOrderSummary = tool(
    async ({ orderID }) => get(`/api/cafe/getOrderSummary(orderID=${orderID})`),
    { name: "getOrderSummary", description: "Get full order details including items and totals", schema: z.object({ orderID: z.string() }) }
  );

  const getRecommendation = tool(
    async ({ preferences, budget }) => post("/api/cafe/getRecommendation", { preferences, budget }),
    { name: "getRecommendation", description: "Get AI meal recommendation based on preferences and budget", schema: z.object({ preferences: z.string(), budget: z.number() }) }
  );

  return [browseMenu, getItemsByDietary, placeOrder, cancelOrderItem, getOrderSummary, getRecommendation];
}
