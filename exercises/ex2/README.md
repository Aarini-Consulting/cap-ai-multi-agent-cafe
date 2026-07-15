# Exercise 2 — Make Your Service Agent-Ready

In the previous exercise you built a working CAP service, but it is a "bare" API — there are no descriptions, no custom operations, and no structured error handling. An AI agent reading the `$metadata` would see field names like `prepTimeMin` and have to guess what they mean.

In this exercise you will transform the service into one that an AI agent can discover, understand, and use confidently.

---

## Overview

You will:

1. Add `@description` annotations to every entity, function, action, and parameter
2. Define CDS **functions** and **actions** for all three agent domains (Cafe Assistant, Kitchen Manager, Grievance Manager)
3. Implement all handlers in JavaScript with stock-aware logic and structured error responses
4. Test happy-path and error-path scenarios across all domains

---

## Step 1: Replace the Service Definition

Open `srv/cafe-service.cds` and replace the entire contents with the following. This adds `@description` annotations to every entity and defines all the functions and actions grouped by agent domain.

```cds
using { cafe } from '../db/schema';

@description: 'Cafe service with stock management and customer feedback. Supports multi-agent orchestration: Cafe Assistant handles orders, Kitchen Manager handles restocking, Grievance Manager handles complaints.'
@path: '/api/cafe'
service CafeService {

  // -- Entity Projections -------------------------------------------------

  @description: 'The full cafe menu with stock quantities and availability'
  @readonly entity Menu as projection on cafe.MenuItems;

  @description: 'Customer orders with status, items, and feedback'
  @readonly entity Orders as projection on cafe.Orders;

  @description: 'Restock requests for kitchen inventory management'
  @readonly entity RestockRequests as projection on cafe.RestockRequests;

  @description: 'Customer feedback and complaints with resolution status'
  @readonly entity CustomerFeedback as projection on cafe.CustomerFeedback;

  // -- Cafe Assistant Operations ------------------------------------------

  @description: 'Find menu items matching a dietary preference such as vegan, vegetarian, gluten_free, or dairy_free'
  function getItemsByDietary(
    @description: 'The dietary preference to filter by'
    preference : String
  ) returns array of Menu;

  @description: 'Get full details of an order including items and any feedback'
  function getOrderSummary(
    @description: 'The UUID of the order'
    orderID : UUID
  ) returns Orders;

  @description: 'Place a new order. Decrements stock quantities. Returns ITEM_OUT_OF_STOCK if insufficient stock.'
  action placeOrder(
    @description: 'Items to order: each with itemId (UUID) and quantity (integer, min 1)'
    items : array of { itemId : UUID; quantity : Integer; }
  ) returns Orders;

  @description: 'Cancel an item from an order. Restores stock quantity.'
  action cancelOrderItem(
    @description: 'The order UUID' orderId : UUID,
    @description: 'The order item UUID' itemId : UUID
  ) returns Orders;

  // -- Kitchen Manager Operations -----------------------------------------

  @description: 'Check current stock level for a menu item. Returns quantity remaining and whether it is below the low-stock threshold.'
  function checkStock(
    @description: 'UUID of the menu item to check' itemId : UUID
  ) returns String;

  @description: 'Get all menu items that are below their low-stock threshold or out of stock entirely'
  function getLowStockItems() returns array of Menu;

  @description: 'Create a restock request for a menu item. The kitchen will process this to replenish inventory.'
  action createRestockRequest(
    @description: 'UUID of the menu item to restock' itemId : UUID,
    @description: 'Quantity to restock' quantity : Integer,
    @description: 'Urgency level: normal, high, or critical' urgency : String,
    @description: 'Optional notes for the kitchen team' notes : String
  ) returns RestockRequests;

  @description: 'Fulfill a restock request — adds the quantity to menu item stock and marks request as fulfilled'
  action fulfillRestockRequest(
    @description: 'UUID of the restock request to fulfill' requestId : UUID
  ) returns RestockRequests;

  @description: 'Find alternative menu items in the same category when an item is out of stock'
  function findAlternatives(
    @description: 'UUID of the out-of-stock item to find alternatives for' itemId : UUID
  ) returns array of Menu;

  @description: 'Get order history and demand analysis for a menu item. Returns how many times the item was ordered, total quantity sold, and a restock recommendation.'
  function getItemDemand(
    @description: 'UUID of the menu item to analyze' itemId : UUID
  ) returns String;

  @description: 'Get details of a specific restock request including the item it refers to'
  function getRestockDetails(
    @description: 'UUID of the restock request' requestId : UUID
  ) returns String;

  // -- Grievance Manager Operations ---------------------------------------

  @description: 'Submit customer feedback or a complaint about an order. Analyzes sentiment automatically from the rating.'
  action submitFeedback(
    @description: 'UUID of the order the feedback is about' orderId : UUID,
    @description: 'Rating from 1 (terrible) to 5 (excellent)' rating : Integer,
    @description: 'The customer comment or complaint' comment : String
  ) returns CustomerFeedback;

  @description: 'Get details of a specific feedback entry including any resolution'
  function getFeedbackDetails(
    @description: 'UUID of the feedback entry' feedbackId : UUID
  ) returns CustomerFeedback;

  @description: 'Get all open (unresolved) complaints — feedback with negative sentiment that has not been resolved yet'
  function getOpenComplaints() returns array of CustomerFeedback;

  @description: 'Resolve a customer complaint with a resolution message. Only works on open complaints.'
  action resolveComplaint(
    @description: 'UUID of the feedback to resolve' feedbackId : UUID,
    @description: 'Resolution message explaining what was done to address the complaint' resolution : String
  ) returns CustomerFeedback;

}
```

> **What changed?**
>
> - Every entity, function, action, and parameter now has a `@description` annotation. These map to OData `Core.Description` vocabulary terms in `$metadata` — giving AI agents natural-language context about what each operation does.
> - The service description explains the three agent domains (Cafe Assistant, Kitchen Manager, Grievance Manager).
> - `placeOrder` now documents that it decrements stock and can return `ITEM_OUT_OF_STOCK`.
> - `cancelOrderItem` documents that it restores stock.
> - Kitchen Manager operations handle stock checks, low-stock alerts, restock lifecycle, alternatives, and demand analysis.
> - Grievance Manager operations handle feedback submission, complaint tracking, and resolution.
>
> **Functions vs Actions in CDS:**
> - A **function** is a `GET` request — it reads data but never changes it. CDS maps functions to OData function imports.
> - An **action** is a `POST` request — it creates, updates, or deletes data. CDS maps actions to OData action imports.
>
> This distinction matters for AI agents: when the agent sees a function, it knows the operation is safe to call without side effects. When it sees an action, it knows data will change.

---

## Step 2: Implement the Handlers

Create the file `srv/cafe-service.js` with handlers for all operations. The key differences from a basic service:

- `placeOrder` **decrements `stockQuantity`** and returns `ITEM_OUT_OF_STOCK` if insufficient stock
- `cancelOrderItem` **restores `stockQuantity`** when an item is cancelled
- Kitchen Manager handlers manage the RestockRequests lifecycle
- Grievance Manager handlers auto-detect sentiment from rating

```javascript
const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

  const { Menu: MenuItems, Orders, RestockRequests, CustomerFeedback } = this.entities;
  const { OrderItems } = cds.entities('cafe');

  // -- Cafe Assistant Handlers --------------------------------------------

  this.on('getItemsByDietary', async (req) => {
    const { preference } = req.data;
    if (!preference) return req.reject(400, 'MISSING_PREFERENCE', 'Please provide a dietary preference');
    const items = await SELECT.from(MenuItems).where({ available: true, dietary: { like: `%${preference}%` } });
    if (items.length === 0) return req.reject(404, 'NO_ITEMS_FOUND', `No items found for dietary preference: ${preference}`);
    return items;
  });

  this.on('getOrderSummary', async (req) => {
    const { orderID } = req.data;
    if (!orderID) return req.reject(400, 'MISSING_ORDER_ID', 'Please provide an order ID');
    const order = await SELECT.one.from(Orders, orderID, o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }), o.feedback(f => f('*')) });
    if (!order) return req.reject(404, 'ORDER_NOT_FOUND', `No order found with ID: ${orderID}`);
    return order;
  });

  this.on('placeOrder', async (req) => {
    const { items } = req.data;
    if (!items || items.length === 0) return req.reject(400, 'ORDER_EMPTY', 'Order must contain at least one item');

    let total = 0;
    const orderItems = [];
    const lowStockWarnings = [];

    for (const entry of items) {
      if (!entry.itemId) return req.reject(400, 'MISSING_ITEM_ID', 'Each item must have an itemId');
      if (!entry.quantity || entry.quantity < 1) return req.reject(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');

      const menuItem = await SELECT.one.from(MenuItems).where({ ID: entry.itemId });
      if (!menuItem) return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${entry.itemId}`);
      if (!menuItem.available) return req.reject(409, 'ITEM_UNAVAILABLE', `${menuItem.name} is currently unavailable`);
      if (menuItem.stockQuantity < entry.quantity) {
        return req.reject(409, 'ITEM_OUT_OF_STOCK', `${menuItem.name} only has ${menuItem.stockQuantity} left in stock, but you requested ${entry.quantity}`);
      }

      const newStock = menuItem.stockQuantity - entry.quantity;
      await UPDATE(MenuItems).where({ ID: entry.itemId }).set({
        stockQuantity: newStock,
        available: newStock > 0
      });

      if (newStock > 0 && newStock <= menuItem.lowStockThreshold) {
        lowStockWarnings.push(`${menuItem.name} is running low (${newStock} left)`);
      }

      const subtotal = menuItem.price * entry.quantity;
      total += subtotal;
      orderItems.push({ item_ID: entry.itemId, quantity: entry.quantity, subtotal });
    }

    const orderID = cds.utils.uuid();
    await INSERT.into(Orders).entries({ ID: orderID, status: 'confirmed', total, orderDate: new Date().toISOString() });
    for (const oi of orderItems) {
      await INSERT.into(OrderItems).entries({ ID: cds.utils.uuid(), order_ID: orderID, ...oi });
    }

    const result = await SELECT.one.from(Orders, orderID, o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) });
    if (lowStockWarnings.length > 0) {
      result._lowStockWarnings = lowStockWarnings;
    }
    return result;
  });

  this.on('cancelOrderItem', async (req) => {
    const { orderId, itemId } = req.data;
    if (!orderId || !itemId) return req.reject(400, 'MISSING_PARAMS', 'Both orderId and itemId are required');

    const order = await SELECT.one.from(Orders).where({ ID: orderId });
    if (!order) return req.reject(404, 'ORDER_NOT_FOUND', `No order found with ID: ${orderId}`);

    const orderItem = await SELECT.one.from(OrderItems).where({ ID: itemId, order_ID: orderId });
    if (!orderItem) return req.reject(404, 'ITEM_NOT_IN_ORDER', `Item ${itemId} is not in order ${orderId}`);

    // Restore stock
    const menuItem = await SELECT.one.from(MenuItems).where({ ID: orderItem.item_ID });
    if (menuItem) {
      await UPDATE(MenuItems).where({ ID: menuItem.ID }).set({
        stockQuantity: menuItem.stockQuantity + orderItem.quantity,
        available: true
      });
    }

    await DELETE.from(OrderItems).where({ ID: itemId });

    const remainingItems = await SELECT.from(OrderItems).where({ order_ID: orderId });
    if (remainingItems.length === 0) {
      await UPDATE(Orders).where({ ID: orderId }).set({ status: 'cancelled', total: 0 });
    } else {
      const newTotal = remainingItems.reduce((sum, i) => sum + i.subtotal, 0);
      await UPDATE(Orders).where({ ID: orderId }).set({ total: newTotal });
    }

    return await SELECT.one.from(Orders, orderId, o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) });
  });

  // -- Kitchen Manager Handlers -------------------------------------------

  this.on('checkStock', async (req) => {
    const { itemId } = req.data;
    if (!itemId) return req.reject(400, 'MISSING_ITEM_ID', 'Please provide an item ID');
    const item = await SELECT.one.from(MenuItems).where({ ID: itemId });
    if (!item) return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${itemId}`);
    return JSON.stringify({
      itemId: item.ID,
      name: item.name,
      stockQuantity: item.stockQuantity,
      lowStockThreshold: item.lowStockThreshold,
      isLowStock: item.stockQuantity <= item.lowStockThreshold && item.stockQuantity > 0,
      isOutOfStock: item.stockQuantity === 0
    });
  });

  this.on('getLowStockItems', async () => {
    const items = await SELECT.from(MenuItems);
    return items.filter(i => i.stockQuantity <= i.lowStockThreshold);
  });

  this.on('createRestockRequest', async (req) => {
    const { itemId, quantity, urgency, notes } = req.data;
    if (!itemId) return req.reject(400, 'MISSING_ITEM_ID', 'Please provide an item ID');
    if (!quantity || quantity < 1) return req.reject(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');

    const validUrgency = ['normal', 'high', 'critical'];
    if (urgency && !validUrgency.includes(urgency)) {
      return req.reject(400, 'INVALID_URGENCY', `Urgency must be one of: ${validUrgency.join(', ')}`);
    }

    const item = await SELECT.one.from(MenuItems).where({ ID: itemId });
    if (!item) return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${itemId}`);

    const id = cds.utils.uuid();
    await INSERT.into(RestockRequests).entries({
      ID: id,
      item_ID: itemId,
      quantity,
      status: 'pending',
      urgency: urgency || 'normal',
      requestedAt: new Date().toISOString(),
      notes: notes || `Restock ${item.name} — current stock: ${item.stockQuantity}`
    });

    return await SELECT.one.from(RestockRequests, id, r => { r('*'), r.item(i => i('*')) });
  });

  this.on('fulfillRestockRequest', async (req) => {
    const { requestId } = req.data;
    if (!requestId) return req.reject(400, 'MISSING_REQUEST_ID', 'Please provide a restock request ID');

    const request = await SELECT.one.from(RestockRequests).where({ ID: requestId });
    if (!request) return req.reject(404, 'REQUEST_NOT_FOUND', `Restock request not found: ${requestId}`);
    if (request.status === 'fulfilled') return req.reject(409, 'ALREADY_FULFILLED', 'This restock request has already been fulfilled');

    const item = await SELECT.one.from(MenuItems).where({ ID: request.item_ID });
    if (item) {
      await UPDATE(MenuItems).where({ ID: item.ID }).set({
        stockQuantity: item.stockQuantity + request.quantity,
        available: true
      });
    }

    await UPDATE(RestockRequests).where({ ID: requestId }).set({
      status: 'fulfilled',
      fulfilledAt: new Date().toISOString()
    });

    return await SELECT.one.from(RestockRequests, requestId, r => { r('*'), r.item(i => i('*')) });
  });

  this.on('getItemDemand', async (req) => {
    const { itemId } = req.data;
    if (!itemId) return req.reject(400, 'MISSING_ITEM_ID', 'Please provide an item ID');

    const item = await SELECT.one.from(MenuItems).where({ ID: itemId });
    if (!item) return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${itemId}`);

    const orderItems = await SELECT.from(OrderItems).where({ item_ID: itemId });
    const totalOrdered = orderItems.reduce((sum, oi) => sum + oi.quantity, 0);
    const orderCount = orderItems.length;

    const pendingRestocks = await SELECT.from(RestockRequests).where({ item_ID: itemId, status: 'pending' });
    const fulfilledRestocks = await SELECT.from(RestockRequests).where({ item_ID: itemId, status: 'fulfilled' });

    let recommendation;
    if (item.stockQuantity === 0) {
      recommendation = `URGENT: ${item.name} is completely out of stock. ${totalOrdered} units were ordered across ${orderCount} orders. Recommend immediate restocking.`;
    } else if (item.stockQuantity <= item.lowStockThreshold) {
      recommendation = `${item.name} is running low (${item.stockQuantity} left, threshold is ${item.lowStockThreshold}). ${totalOrdered} units ordered across ${orderCount} orders. Recommend restocking soon.`;
    } else if (totalOrdered > item.stockQuantity) {
      recommendation = `${item.name} has ${item.stockQuantity} in stock but ${totalOrdered} units were ordered recently. Demand is high — consider restocking proactively.`;
    } else {
      recommendation = `${item.name} has ${item.stockQuantity} in stock with only ${totalOrdered} units ordered. Stock is sufficient for now.`;
    }

    return JSON.stringify({
      itemId: item.ID,
      name: item.name,
      currentStock: item.stockQuantity,
      lowStockThreshold: item.lowStockThreshold,
      totalUnitsOrdered: totalOrdered,
      orderCount,
      pendingRestockRequests: pendingRestocks.length,
      fulfilledRestockRequests: fulfilledRestocks.length,
      recommendation,
    });
  });

  this.on('getRestockDetails', async (req) => {
    const { requestId } = req.data;
    if (!requestId) return req.reject(400, 'MISSING_REQUEST_ID', 'Please provide a restock request ID');

    const request = await SELECT.one.from(RestockRequests, requestId, r => { r('*'), r.item(i => i('*')) });
    if (!request) return req.reject(404, 'REQUEST_NOT_FOUND', `Restock request not found: ${requestId}`);

    const orderItems = await SELECT.from(OrderItems).where({ item_ID: request.item_ID });
    const totalOrdered = orderItems.reduce((sum, oi) => sum + oi.quantity, 0);

    return JSON.stringify({
      requestId: request.ID,
      item: request.item,
      quantity: request.quantity,
      urgency: request.urgency,
      status: request.status,
      notes: request.notes,
      demandAnalysis: {
        totalUnitsOrdered: totalOrdered,
        orderCount: orderItems.length,
        currentStock: request.item?.stockQuantity || 0,
      },
    });
  });

  this.on('findAlternatives', async (req) => {
    const { itemId } = req.data;
    if (!itemId) return req.reject(400, 'MISSING_ITEM_ID', 'Please provide an item ID');

    const item = await SELECT.one.from(MenuItems).where({ ID: itemId });
    if (!item) return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${itemId}`);

    const alternatives = await SELECT.from(MenuItems)
      .where({ category: item.category, available: true, ID: { '!=': itemId } });
    return alternatives.filter(a => a.stockQuantity > 0);
  });

  // -- Grievance Manager Handlers -----------------------------------------

  this.on('submitFeedback', async (req) => {
    const { orderId, rating, comment } = req.data;
    if (!orderId) return req.reject(400, 'MISSING_ORDER_ID', 'Please provide an order ID');
    if (!rating || rating < 1 || rating > 5) return req.reject(400, 'INVALID_RATING', 'Rating must be between 1 and 5');
    if (!comment) return req.reject(400, 'MISSING_COMMENT', 'Please provide a comment');

    const order = await SELECT.one.from(Orders).where({ ID: orderId });
    if (!order) return req.reject(404, 'ORDER_NOT_FOUND', `No order found with ID: ${orderId}`);

    let sentiment = 'neutral';
    if (rating <= 2) sentiment = 'negative';
    else if (rating >= 4) sentiment = 'positive';

    const id = cds.utils.uuid();
    await INSERT.into(CustomerFeedback).entries({
      ID: id,
      order_ID: orderId,
      rating,
      comment,
      sentiment,
      status: 'open',
      createdAt: new Date().toISOString()
    });

    return await SELECT.one.from(CustomerFeedback, id, f => { f('*'), f.order(o => o('*')) });
  });

  this.on('getFeedbackDetails', async (req) => {
    const { feedbackId } = req.data;
    if (!feedbackId) return req.reject(400, 'MISSING_FEEDBACK_ID', 'Please provide a feedback ID');
    const feedback = await SELECT.one.from(CustomerFeedback, feedbackId, f => { f('*'), f.order(o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) }) });
    if (!feedback) return req.reject(404, 'FEEDBACK_NOT_FOUND', `Feedback not found: ${feedbackId}`);
    return feedback;
  });

  this.on('getOpenComplaints', async () => {
    return await SELECT.from(CustomerFeedback).where({ status: 'open', sentiment: 'negative' });
  });

  this.on('resolveComplaint', async (req) => {
    const { feedbackId, resolution } = req.data;
    if (!feedbackId) return req.reject(400, 'MISSING_FEEDBACK_ID', 'Please provide a feedback ID');
    if (!resolution) return req.reject(400, 'MISSING_RESOLUTION', 'Please provide a resolution message');

    const feedback = await SELECT.one.from(CustomerFeedback).where({ ID: feedbackId });
    if (!feedback) return req.reject(404, 'FEEDBACK_NOT_FOUND', `Feedback not found: ${feedbackId}`);
    if (feedback.status === 'resolved') return req.reject(409, 'ALREADY_RESOLVED', 'This complaint has already been resolved');

    await UPDATE(CustomerFeedback).where({ ID: feedbackId }).set({
      status: 'resolved',
      resolution,
      resolvedAt: new Date().toISOString()
    });

    return await SELECT.one.from(CustomerFeedback, feedbackId, f => { f('*'), f.order(o => o('*')) });
  });

});
```

> **What's happening here?**
>
> **Stock-aware ordering:**
> - `placeOrder` checks `stockQuantity` before accepting an order, decrements stock on success, and sets `available: false` when stock hits 0. It also returns `_lowStockWarnings` when an item drops below its threshold.
> - `cancelOrderItem` restores `stockQuantity` and sets `available: true` when an item is cancelled.
>
> **Structured errors with `req.reject`:**
> Every error uses `req.reject(statusCode, errorCode, message)`. This is critical for AI agents:
> - `400 MISSING_PREFERENCE` — the agent knows it forgot a required parameter
> - `404 ITEM_NOT_FOUND` — the agent knows the ID it used was wrong
> - `409 ITEM_OUT_OF_STOCK` — the agent knows to suggest an alternative
> - `409 ALREADY_FULFILLED` — the agent knows the restock was already processed
>
> Compare this to a generic `500 Internal Server Error` — the agent has no idea what went wrong and cannot recover. Structured errors turn failures into learning opportunities for the agent.

---

## Step 3: Test the Service

Make sure `cds watch` is running. You will test scenarios across all three agent domains.

> **Windows users:** In PowerShell, `curl` is an alias for `Invoke-WebRequest`, which behaves differently. Use `curl.exe` (with `.exe`) instead, or run the commands from **Git Bash** or **WSL**.

### Cafe Assistant Tests

**Find vegan items:**

```bash
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/getItemsByDietary(preference='vegan')"
```

You should see the Vegan Buddha Bowl, Fruit Salad, and Sparkling Water (Fresh Orange Juice is excluded because it is out of stock and `available: false`).

**Place an order (with stock decrement):**

```bash
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/placeOrder \
  -H "Content-Type: application/json" \
  -d '{"items": [{"itemId": "b1a2c3d4-0004-0000-0000-000000000004", "quantity": 1}, {"itemId": "b1a2c3d4-0006-0000-0000-000000000006", "quantity": 2}]}'
```

You should see a confirmed order with total `9.50` (3.50 + 2 x 3.00). The Flat White stock drops from 100 to 99, and Chocolate Brownie from 25 to 23.

**Try ordering an out-of-stock item:**

```bash
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/placeOrder \
  -H "Content-Type: application/json" \
  -d '{"items": [{"itemId": "b1a2c3d4-0005-0000-0000-000000000005", "quantity": 1}]}'
```

You should get: `409 ITEM_UNAVAILABLE` — Fresh Orange Juice is currently unavailable.

### Kitchen Manager Tests

**Check low stock items:**

```bash
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/getLowStockItems()"
```

You should see Grilled Chicken Bowl (stock=3, threshold=5) and Fresh Orange Juice (stock=0).

**Check stock for a specific item:**

```bash
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/checkStock(itemId='b1a2c3d4-0002-0000-0000-000000000002')"
```

You should see `isLowStock: true` for the Grilled Chicken Bowl.

**Find alternatives for the out-of-stock OJ:**

```bash
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/findAlternatives(itemId='b1a2c3d4-0005-0000-0000-000000000005')"
```

You should see other available drinks (Flat White, Sparkling Water).

### Grievance Manager Tests

**Get open complaints:**

```bash
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/getOpenComplaints()"
```

You should see 4 open complaints with negative sentiment.

**Resolve a complaint:**

```bash
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/resolveComplaint \
  -H "Content-Type: application/json" \
  -d '{"feedbackId": "c3000001-0000-0000-0000-000000000001", "resolution": "We apologize for the lukewarm chicken bowl. A fresh replacement has been prepared."}'
```

You should see the feedback entry with `status: resolved` and the resolution message.

---

## Step 4: Compare $metadata Before and After

Open `http://localhost:4004/api/cafe/$metadata` and observe the differences from Exercise 1:

**Before (Exercise 1):**
- Entity types with bare property names
- No function imports or action imports
- No descriptions anywhere

**After (this exercise):**
- Every entity has a human-readable description
- 8 functions appear as function imports (`getItemsByDietary`, `getOrderSummary`, `checkStock`, `getLowStockItems`, `findAlternatives`, `getItemDemand`, `getRestockDetails`, `getFeedbackDetails`, `getOpenComplaints`)
- 5 actions appear as action imports (`placeOrder`, `cancelOrderItem`, `createRestockRequest`, `fulfillRestockRequest`, `submitFeedback`, `resolveComplaint`)
- Parameter descriptions explain valid values and formats

This is what "agent-ready" looks like. The `$metadata` document is now a complete, self-describing API contract that an AI agent can read, understand, and use without any external documentation.

---

## Summary

You transformed a bare CAP service into an agent-ready API by:

- Adding `@description` annotations to every entity, function, action, and parameter
- Implementing **stock-aware ordering** — `placeOrder` decrements stock, `cancelOrderItem` restores it
- Adding **Kitchen Manager** operations for stock monitoring, restock lifecycle, and demand analysis
- Adding **Grievance Manager** operations for feedback, complaint tracking, and resolution
- Using **structured error responses** (`req.reject` with codes) so agents can recover from failures

The key insight: **annotations are not documentation — they are the API contract**. When an AI agent reads `$metadata`, the descriptions tell it what each operation does, what parameters it expects, and what values are valid. Structured errors tell it what went wrong and how to recover.

---

## Further Reading

- [CDS Annotations](https://cap.cloud.sap/docs/cds/annotations) — how `@description` and other annotations work in CDS
- [OData Vocabularies in CAP](https://cap.cloud.sap/docs/advanced/odata#vocabularies) — how annotations map to `Core.Description` and other OData vocabulary terms
- [CAP Service Implementation (Handlers)](https://cap.cloud.sap/docs/node.js/core-services#srv-on) — registering `on`, `before`, and `after` handlers
- [CAP Error Handling (req.reject)](https://cap.cloud.sap/docs/node.js/events#req-reject) — structured error responses with status codes and error codes
- [CDS Services — Functions & Actions](https://cap.cloud.sap/docs/cds/services) — defining read-only functions and write actions in CDS

---

[Continue to Exercise 3 →](../ex3/README.md)
