using { cafe } from '../db/schema';

@description: 'Office cafe ordering service. Browse the menu, place orders, and get AI-powered meal recommendations.'
@path: '/api/cafe'
service CafeService {

  @description: 'The full cafe menu. Browse all available food and drink items with prices, categories, and dietary info.'
  @readonly entity Menu as projection on cafe.MenuItems where available = true;

  @description: 'Your placed orders with status and items.'
  @readonly entity Orders as projection on cafe.Orders;

  @description: 'Find menu items matching a dietary preference such as vegan, vegetarian, gluten_free, or dairy_free'
  function getItemsByDietary(
    @description: 'The dietary preference to filter by. Valid values: vegan, vegetarian, gluten_free, dairy_free'
    preference : String
  ) returns array of Menu;

  @description: 'Get the full details of a specific order including all line items, quantities, and the total price'
  function getOrderSummary(
    @description: 'The UUID of the order to retrieve'
    orderID : UUID
  ) returns Orders;

  @description: 'Place a new order with one or more menu items. Each item requires a valid menu item ID and a quantity of at least 1.'
  action placeOrder(
    @description: 'Array of items to order. Each entry must have itemId (UUID of the menu item) and quantity (integer, minimum 1).'
    items : array of {
      itemId   : UUID;
      quantity : Integer;
    }
  ) returns Orders;

  @description: 'Remove a specific item from an existing order. The order must be in confirmed status.'
  action cancelOrderItem(
    @description: 'The UUID of the order to modify'
    orderId : UUID,
    @description: 'The UUID of the order item to remove'
    itemId  : UUID
  ) returns Orders;

  @description: 'Get an AI-powered meal recommendation based on your taste preferences and budget. The response is streamed in real-time as Server-Sent Events.'
  action getRecommendation(
    @description: 'Describe what you are in the mood for, e.g. "something light and vegan" or "a hearty lunch with protein"'
    preferences : String,
    @description: 'Your maximum budget in EUR'
    budget      : Decimal
  ) returns String;
}
