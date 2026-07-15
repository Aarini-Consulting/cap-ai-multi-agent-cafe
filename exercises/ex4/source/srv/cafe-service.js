const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

  const { Menu: MenuItems, Orders } = this.entities;
  const { OrderItems } = cds.entities('cafe');

  // getItemsByDietary — filter menu by dietary preference
  this.on('getItemsByDietary', async (req) => {
    const { preference } = req.data;
    if (!preference) {
      return req.reject(400, 'MISSING_PREFERENCE', 'Please provide a dietary preference (vegan, vegetarian, gluten_free, dairy_free)');
    }
    const items = await SELECT.from(MenuItems)
      .where({ available: true, dietary: { like: `%${preference}%` } });
    if (items.length === 0) {
      return req.reject(404, 'NO_ITEMS_FOUND', `No menu items found matching dietary preference: ${preference}`);
    }
    return items;
  });

  // getOrderSummary — get full order details
  this.on('getOrderSummary', async (req) => {
    const { orderID } = req.data;
    if (!orderID) {
      return req.reject(400, 'MISSING_ORDER_ID', 'Please provide an order ID');
    }
    const order = await SELECT.one.from(Orders)
      .where({ ID: orderID })
      .columns(o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) });
    if (!order) {
      return req.reject(404, 'ORDER_NOT_FOUND', `No order found with ID: ${orderID}`);
    }
    return order;
  });

  // placeOrder — create a new order
  this.on('placeOrder', async (req) => {
    const { items } = req.data;
    if (!items || items.length === 0) {
      return req.reject(400, 'ORDER_EMPTY', 'Order must contain at least one item');
    }

    let total = 0;
    const orderItems = [];

    for (const entry of items) {
      if (!entry.itemId) {
        return req.reject(400, 'MISSING_ITEM_ID', 'Each item must have an itemId');
      }
      if (!entry.quantity || entry.quantity < 1) {
        return req.reject(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');
      }

      const menuItem = await SELECT.one.from(MenuItems).where({ ID: entry.itemId });
      if (!menuItem) {
        return req.reject(404, 'ITEM_NOT_FOUND', `Menu item not found: ${entry.itemId}`);
      }
      if (!menuItem.available) {
        return req.reject(409, 'ITEM_UNAVAILABLE', `${menuItem.name} is sold out today`);
      }

      const subtotal = menuItem.price * entry.quantity;
      total += subtotal;
      orderItems.push({
        item_ID: entry.itemId,
        quantity: entry.quantity,
        subtotal: subtotal
      });
    }

    const orderID = cds.utils.uuid();
    await INSERT.into(Orders).entries({
      ID: orderID,
      status: 'confirmed',
      total: total,
      orderDate: new Date().toISOString()
    });

    for (const oi of orderItems) {
      await INSERT.into(OrderItems).entries({
        ID: cds.utils.uuid(),
        order_ID: orderID,
        ...oi
      });
    }

    return await SELECT.one.from(Orders).where({ ID: orderID })
      .columns(o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) });
  });

  // cancelOrderItem — remove item from order
  this.on('cancelOrderItem', async (req) => {
    const { orderId, itemId } = req.data;
    if (!orderId || !itemId) {
      return req.reject(400, 'MISSING_PARAMS', 'Both orderId and itemId are required');
    }

    const order = await SELECT.one.from(Orders).where({ ID: orderId });
    if (!order) {
      return req.reject(404, 'ORDER_NOT_FOUND', `No order found with ID: ${orderId}`);
    }
    if (order.status === 'cancelled') {
      return req.reject(409, 'ORDER_CANCELLED', 'This order has already been cancelled');
    }

    const orderItem = await SELECT.one.from(OrderItems).where({ ID: itemId, order_ID: orderId });
    if (!orderItem) {
      return req.reject(404, 'ITEM_NOT_IN_ORDER', `Item ${itemId} is not in order ${orderId}`);
    }

    await DELETE.from(OrderItems).where({ ID: itemId });

    const remainingItems = await SELECT.from(OrderItems).where({ order_ID: orderId });
    if (remainingItems.length === 0) {
      await UPDATE(Orders).where({ ID: orderId }).set({ status: 'cancelled', total: 0 });
    } else {
      const newTotal = remainingItems.reduce((sum, i) => sum + i.subtotal, 0);
      await UPDATE(Orders).where({ ID: orderId }).set({ total: newTotal });
    }

    return await SELECT.one.from(Orders).where({ ID: orderId })
      .columns(o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) });
  });

});
