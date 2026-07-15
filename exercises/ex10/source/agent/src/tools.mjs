import { tool } from "@langchain/core/tools";
import { z } from "zod";

const BASE_URL = process.env.CAP_SERVICE_URL || "http://localhost:4004";

async function odataGet(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    const data = await res.json();
    if (!res.ok) return JSON.stringify({ error: data.error?.message || res.statusText });
    return JSON.stringify(data.value || data, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

async function odataPost(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return JSON.stringify({ error: data.error?.code, message: data.error?.message });
    return JSON.stringify(data, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// ── Café Assistant Tools ──────────────────────────────────────────

export const browseMenu = tool(
  async () => odataGet("/api/cafe/Menu"),
  { name: "browseMenu", description: "Browse the full café menu with prices, categories, dietary info, and stock quantities", schema: z.object({}) }
);

export const getItemsByDietary = tool(
  async ({ preference }) => odataGet(`/api/cafe/getItemsByDietary(preference='${encodeURIComponent(preference)}')`),
  { name: "getItemsByDietary", description: "Find menu items matching a dietary preference", schema: z.object({ preference: z.string().describe("vegan, vegetarian, gluten_free, or dairy_free") }) }
);

export const placeOrder = tool(
  async ({ items }) => odataPost("/api/cafe/placeOrder", { items }),
  { name: "placeOrder", description: "Place an order. Returns ITEM_OUT_OF_STOCK if insufficient stock.", schema: z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.number().min(1) })) }) }
);

export const cancelOrderItem = tool(
  async ({ orderId, itemId }) => odataPost("/api/cafe/cancelOrderItem", { orderId, itemId }),
  { name: "cancelOrderItem", description: "Cancel an item from an order. Restores stock.", schema: z.object({ orderId: z.string(), itemId: z.string() }) }
);

export const getOrderSummary = tool(
  async ({ orderID }) => odataGet(`/api/cafe/getOrderSummary(orderID=${orderID})`),
  { name: "getOrderSummary", description: "Get full order details", schema: z.object({ orderID: z.string() }) }
);

export const getRecommendation = tool(
  async ({ preferences, budget }) => odataPost("/api/cafe/getRecommendation", { preferences, budget }),
  { name: "getRecommendation", description: "Get AI meal recommendation", schema: z.object({ preferences: z.string(), budget: z.number() }) }
);

// ── Kitchen Manager Tools ─────────────────────────────────────────

export const checkStock = tool(
  async ({ itemId }) => odataGet(`/api/cafe/checkStock(itemId=${itemId})`),
  { name: "checkStock", description: "Check stock level for a menu item", schema: z.object({ itemId: z.string() }) }
);

export const getLowStockItems = tool(
  async () => odataGet("/api/cafe/getLowStockItems()"),
  { name: "getLowStockItems", description: "Get all items below low-stock threshold or out of stock", schema: z.object({}) }
);

export const createRestockRequest = tool(
  async ({ itemId, quantity, urgency, notes }) => odataPost("/api/cafe/createRestockRequest", { itemId, quantity, urgency, notes }),
  { name: "createRestockRequest", description: "Create a restock request for a menu item", schema: z.object({ itemId: z.string(), quantity: z.number().min(1), urgency: z.string().describe("normal, high, or critical"), notes: z.string().optional().default("") }) }
);

export const fulfillRestockRequest = tool(
  async ({ requestId }) => odataPost("/api/cafe/fulfillRestockRequest", { requestId }),
  { name: "fulfillRestockRequest", description: "Fulfill a restock request — adds stock to the item", schema: z.object({ requestId: z.string() }) }
);

export const findAlternatives = tool(
  async ({ itemId }) => odataGet(`/api/cafe/findAlternatives(itemId=${itemId})`),
  { name: "findAlternatives", description: "Find alternative items in the same category when something is out of stock", schema: z.object({ itemId: z.string() }) }
);

// ── Grievance Manager Tools ───────────────────────────────────────

export const submitFeedback = tool(
  async ({ orderId, rating, comment }) => odataPost("/api/cafe/submitFeedback", { orderId, rating, comment }),
  { name: "submitFeedback", description: "Submit customer feedback or complaint. Sentiment is auto-detected from rating.", schema: z.object({ orderId: z.string(), rating: z.number().min(1).max(5), comment: z.string() }) }
);

export const getFeedbackDetails = tool(
  async ({ feedbackId }) => odataGet(`/api/cafe/getFeedbackDetails(feedbackId=${feedbackId})`),
  { name: "getFeedbackDetails", description: "Get details of a feedback entry", schema: z.object({ feedbackId: z.string() }) }
);

export const getOpenComplaints = tool(
  async () => odataGet("/api/cafe/getOpenComplaints()"),
  { name: "getOpenComplaints", description: "Get all unresolved complaints", schema: z.object({}) }
);

export const resolveComplaint = tool(
  async ({ feedbackId, resolution }) => odataPost("/api/cafe/resolveComplaint", { feedbackId, resolution }),
  { name: "resolveComplaint", description: "Resolve a complaint with a resolution message", schema: z.object({ feedbackId: z.string(), resolution: z.string() }) }
);

export const generateComplaintResponse = tool(
  async ({ feedbackId }) => odataPost("/api/cafe/generateComplaintResponse", { feedbackId }),
  { name: "generateComplaintResponse", description: "Generate an empathetic AI response to a complaint", schema: z.object({ feedbackId: z.string() }) }
);

// ── Grouped Exports ───────────────────────────────────────────────

export const cafeTools = [browseMenu, getItemsByDietary, placeOrder, cancelOrderItem, getOrderSummary, getRecommendation];
export const kitchenTools = [checkStock, getLowStockItems, createRestockRequest, fulfillRestockRequest, findAlternatives];
export const grievanceTools = [submitFeedback, getFeedbackDetails, getOpenComplaints, resolveComplaint, generateComplaintResponse];
export const allTools = [...cafeTools, ...kitchenTools, ...grievanceTools];
