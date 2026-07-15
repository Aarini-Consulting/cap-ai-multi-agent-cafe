const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

  const { Menu: MenuItems, Orders, RestockRequests, CustomerFeedback } = this.entities;
  const { OrderItems } = cds.entities('cafe');

  // ── Café Assistant Handlers ─────────────────────────────────────

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

  this.on('getRecommendation', async (req) => {
    const { preferences, budget } = req.data;
    const res = req._.res;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const sendEvent = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      const items = await SELECT.from(MenuItems).where({ available: true });
      const affordable = items.filter(i => i.price <= (budget || 999) && i.stockQuantity > 0);
      let matching = affordable;
      const keywords = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'];
      for (const kw of keywords) {
        if (preferences && preferences.toLowerCase().includes(kw.replace('_', ' '))) {
          matching = matching.filter(i => i.dietary && i.dietary.includes(kw));
        }
      }
      if (matching.length === 0) matching = affordable;

      sendEvent('start', { message: 'Analyzing your preferences...' });
      await new Promise(r => setTimeout(r, 300));

      const text = `Based on your preference for "${preferences}" with a budget of €${budget}, I'd recommend the ${matching[0]?.name || "Chef's Special"} (€${matching[0]?.price || '?'}). ${matching.length > 1 ? `You could also try the ${matching[1]?.name} (€${matching[1]?.price}).` : ''} We have ${matching[0]?.stockQuantity || 0} in stock, so plenty available!`;
      const words = text.split(' ');
      for (const word of words) {
        sendEvent('chunk', { content: word + ' ' });
        await new Promise(r => setTimeout(r, 60));
      }
      sendEvent('complete', { message: 'Done' });
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      res.end();
    }
    return 'Streaming complete';
  });

  // ── Kitchen Manager Handlers ────────────────────────────────────

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

  this.on('findAlternatives', async (req) => {
    const { itemId } = req.data;
    if (!itemId) return req.reject(400, 'MISSING_ITEM_ID', 'Please provide an item ID');

    const item = await SELECT.one.from(MenuItems).where({ ID: itemId });
    if (!item) return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${itemId}`);

    const alternatives = await SELECT.from(MenuItems)
      .where({ category: item.category, available: true, ID: { '!=': itemId } });
    return alternatives.filter(a => a.stockQuantity > 0);
  });

  // ── Grievance Manager Handlers ──────────────────────────────────

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

  this.on('generateComplaintResponse', async (req) => {
    const { feedbackId } = req.data;
    const res = req._.res;

    const feedback = await SELECT.one.from(CustomerFeedback, feedbackId, f => { f('*'), f.order(o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) }) });
    if (!feedback) return req.reject(404, 'FEEDBACK_NOT_FOUND', `Feedback not found: ${feedbackId}`);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const sendEvent = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      sendEvent('start', { message: 'Preparing empathetic response...' });
      await new Promise(r => setTimeout(r, 300));

      const orderItems = feedback.order?.items?.map(i => i.item?.name).filter(Boolean).join(', ') || 'your order';
      const text = `Dear valued customer, I sincerely apologize for your experience with ${orderItems}. Your feedback — "${feedback.comment}" — is important to us and I completely understand your frustration. We take this very seriously. As a gesture of goodwill, we would like to offer you a complimentary replacement or a 50% discount on your next order. Our kitchen team has been notified and we are taking immediate steps to ensure this does not happen again. Thank you for bringing this to our attention, and we hope to serve you better next time.`;

      const words = text.split(' ');
      for (const word of words) {
        sendEvent('chunk', { content: word + ' ' });
        await new Promise(r => setTimeout(r, 60));
      }
      sendEvent('complete', { message: 'Response generated' });
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      res.end();
    }
    return 'Streaming complete';
  });
});
