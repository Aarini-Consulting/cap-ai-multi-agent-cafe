import { tool } from "@langchain/core/tools";
import { z } from "zod";

const BASE_URL = process.env.CAP_SERVICE_URL || "http://localhost:4004";

/**
 * Tool 1: Browse the full cafe menu
 */
export const browseMenu = tool(
  async () => {
    const response = await fetch(`${BASE_URL}/api/cafe/Menu`);
    if (!response.ok) {
      return `Error fetching menu: ${response.status} ${response.statusText}`;
    }
    const data = await response.json();
    return JSON.stringify(data.value || data, null, 2);
  },
  {
    name: "browseMenu",
    description:
      "Browse the full cafe menu. Returns all available food and drink items with names, descriptions, prices, categories, and dietary information.",
    schema: z.object({}),
  }
);

/**
 * Tool 2: Find items by dietary preference
 */
export const getItemsByDietary = tool(
  async ({ preference }) => {
    const response = await fetch(
      `${BASE_URL}/api/cafe/getItemsByDietary(preference='${encodeURIComponent(preference)}')`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return `Error: ${error.error?.message || response.statusText}`;
    }
    const data = await response.json();
    return JSON.stringify(data.value || data, null, 2);
  },
  {
    name: "getItemsByDietary",
    description:
      "Find menu items matching a dietary preference. Valid preferences: vegan, vegetarian, gluten_free, dairy_free.",
    schema: z.object({
      preference: z
        .string()
        .describe(
          "The dietary preference to filter by. Valid values: vegan, vegetarian, gluten_free, dairy_free"
        ),
    }),
  }
);

/**
 * Tool 3: Place an order
 */
export const placeOrder = tool(
  async ({ items }) => {
    const response = await fetch(`${BASE_URL}/api/cafe/placeOrder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return `Error placing order: ${error.error?.message || response.statusText}`;
    }
    const data = await response.json();
    return JSON.stringify(data, null, 2);
  },
  {
    name: "placeOrder",
    description:
      "Place a new order with one or more menu items. Each item requires a valid menu item ID (UUID) and a quantity (integer, minimum 1). Returns the created order with all details.",
    schema: z.object({
      items: z
        .array(
          z.object({
            itemId: z.string().describe("The UUID of the menu item to order"),
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("How many of this item to order (minimum 1)"),
          })
        )
        .describe("Array of items to order"),
    }),
  }
);

/**
 * Tool 4: Cancel an order item
 */
export const cancelOrderItem = tool(
  async ({ orderId, itemId }) => {
    const response = await fetch(`${BASE_URL}/api/cafe/cancelOrderItem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, itemId }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return `Error cancelling item: ${error.error?.message || response.statusText}`;
    }
    const data = await response.json();
    return JSON.stringify(data, null, 2);
  },
  {
    name: "cancelOrderItem",
    description:
      "Remove a specific item from an existing order. The order must be in confirmed status. Provide the order ID and the order item ID (not the menu item ID).",
    schema: z.object({
      orderId: z
        .string()
        .describe("The UUID of the order to modify"),
      itemId: z
        .string()
        .describe(
          "The UUID of the order item to remove (from the order's items list, not the menu item ID)"
        ),
    }),
  }
);

/**
 * Tool 5: Get order summary
 */
export const getOrderSummary = tool(
  async ({ orderID }) => {
    const response = await fetch(
      `${BASE_URL}/api/cafe/getOrderSummary(orderID='${encodeURIComponent(orderID)}')`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return `Error: ${error.error?.message || response.statusText}`;
    }
    const data = await response.json();
    return JSON.stringify(data, null, 2);
  },
  {
    name: "getOrderSummary",
    description:
      "Get the full details of a specific order including all line items, quantities, subtotals, and the total price.",
    schema: z.object({
      orderID: z
        .string()
        .describe("The UUID of the order to retrieve"),
    }),
  }
);

/** All tools bundled for the agent */
export const allTools = [
  browseMenu,
  getItemsByDietary,
  placeOrder,
  cancelOrderItem,
  getOrderSummary,
];
