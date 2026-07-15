import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates all agent tools bound to a CDS service instance.
 * Tools use internal CDS APIs (srv.send, srv.read) instead of HTTP fetch,
 * so user context and authorization propagate automatically.
 */
export function createAllTools(srv) {

  // ── Café Assistant Tools ──────────────────────────────────────────

  const browseMenu = tool(
    async () => {
      try {
        const items = await srv.read('Menu');
        return JSON.stringify(items, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
    { name: "browseMenu", description: "Browse the full café menu with prices, categories, dietary info, and stock quantities", schema: z.object({}) }
  );

  const getItemsByDietary = tool(
    async ({ preference }) => {
      try {
        const items = await srv.send('getItemsByDietary', { preference });
        return JSON.stringify(items, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "getItemsByDietary", description: "Find menu items matching a dietary preference", schema: z.object({ preference: z.string().describe("vegan, vegetarian, gluten_free, or dairy_free") }) }
  );

  const placeOrder = tool(
    async ({ items }) => {
      try {
        const result = await srv.send('placeOrder', { items });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "placeOrder", description: "Place an order. Returns ITEM_OUT_OF_STOCK if insufficient stock.", schema: z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.number().min(1) })) }) }
  );

  const cancelOrderItem = tool(
    async ({ orderId, itemId }) => {
      try {
        const result = await srv.send('cancelOrderItem', { orderId, itemId });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "cancelOrderItem", description: "Cancel an item from an order. Restores stock.", schema: z.object({ orderId: z.string(), itemId: z.string() }) }
  );

  const getOrderSummary = tool(
    async ({ orderID }) => {
      try {
        const result = await srv.send('getOrderSummary', { orderID });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "getOrderSummary", description: "Get full order details", schema: z.object({ orderID: z.string() }) }
  );

  const getRecommendation = tool(
    async ({ preferences, budget }) => {
      try {
        const result = await srv.send('getRecommendation', { preferences, budget });
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
    { name: "getRecommendation", description: "Get AI meal recommendation", schema: z.object({ preferences: z.string(), budget: z.number() }) }
  );

  // ── Kitchen Manager Tools ─────────────────────────────────────────

  const checkStock = tool(
    async ({ itemId }) => {
      try {
        const result = await srv.send('checkStock', { itemId });
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "checkStock", description: "Check stock level for a menu item", schema: z.object({ itemId: z.string() }) }
  );

  const getLowStockItems = tool(
    async () => {
      try {
        const items = await srv.send('getLowStockItems', {});
        return JSON.stringify(items, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
    { name: "getLowStockItems", description: "Get all items below low-stock threshold or out of stock", schema: z.object({}) }
  );

  const createRestockRequest = tool(
    async ({ itemId, quantity, urgency, notes }) => {
      try {
        const result = await srv.send('createRestockRequest', { itemId, quantity, urgency, notes });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "createRestockRequest", description: "Create a restock request for a menu item", schema: z.object({ itemId: z.string(), quantity: z.number().min(1), urgency: z.string().describe("normal, high, or critical"), notes: z.string().optional().default("") }) }
  );

  const fulfillRestockRequest = tool(
    async ({ requestId }) => {
      try {
        const result = await srv.send('fulfillRestockRequest', { requestId });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "fulfillRestockRequest", description: "Fulfill a restock request — adds stock to the item", schema: z.object({ requestId: z.string() }) }
  );

  const findAlternatives = tool(
    async ({ itemId }) => {
      try {
        const result = await srv.send('findAlternatives', { itemId });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "findAlternatives", description: "Find alternative items in the same category when something is out of stock", schema: z.object({ itemId: z.string() }) }
  );

  // ── Grievance Manager Tools ───────────────────────────────────────

  const submitFeedback = tool(
    async ({ orderId, rating, comment }) => {
      try {
        const result = await srv.send('submitFeedback', { orderId, rating, comment });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "submitFeedback", description: "Submit customer feedback or complaint. Sentiment is auto-detected from rating.", schema: z.object({ orderId: z.string(), rating: z.number().min(1).max(5), comment: z.string() }) }
  );

  const getFeedbackDetails = tool(
    async ({ feedbackId }) => {
      try {
        const result = await srv.send('getFeedbackDetails', { feedbackId });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "getFeedbackDetails", description: "Get details of a feedback entry", schema: z.object({ feedbackId: z.string() }) }
  );

  const getOpenComplaints = tool(
    async () => {
      try {
        const result = await srv.send('getOpenComplaints', {});
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
    { name: "getOpenComplaints", description: "Get all unresolved complaints", schema: z.object({}) }
  );

  const resolveComplaint = tool(
    async ({ feedbackId, resolution }) => {
      try {
        const result = await srv.send('resolveComplaint', { feedbackId, resolution });
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.code || e.message, message: e.message });
      }
    },
    { name: "resolveComplaint", description: "Resolve a complaint with a resolution message", schema: z.object({ feedbackId: z.string(), resolution: z.string() }) }
  );

  const generateComplaintResponse = tool(
    async ({ feedbackId }) => {
      try {
        const result = await srv.send('generateComplaintResponse', { feedbackId });
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    },
    { name: "generateComplaintResponse", description: "Generate an empathetic AI response to a complaint", schema: z.object({ feedbackId: z.string() }) }
  );

  // ── Grouped Exports ───────────────────────────────────────────────

  const cafeTools = [browseMenu, getItemsByDietary, placeOrder, cancelOrderItem, getOrderSummary, getRecommendation];
  const kitchenTools = [checkStock, getLowStockItems, createRestockRequest, fulfillRestockRequest, findAlternatives];
  const grievanceTools = [submitFeedback, getFeedbackDetails, getOpenComplaints, resolveComplaint, generateComplaintResponse];
  const allTools = [...cafeTools, ...kitchenTools, ...grievanceTools];

  return { cafeTools, kitchenTools, grievanceTools, allTools };
}
