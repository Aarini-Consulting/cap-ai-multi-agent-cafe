using { cafe } from '../db/schema';

@description: 'Cafe service with stock management and customer feedback. Supports multi-agent orchestration: Cafe Assistant handles orders, Kitchen Manager handles restocking, Grievance Manager handles complaints.'
@path: '/api/cafe'
service CafeService {

  // -- Entity Projections ----------------------------------------------------

  @description: 'The full cafe menu with stock quantities and availability'
  @readonly entity Menu as projection on cafe.MenuItems;

  @description: 'Customer orders with status, items, and feedback'
  @readonly entity Orders as projection on cafe.Orders;

  @description: 'Restock requests for kitchen inventory management'
  @readonly entity RestockRequests as projection on cafe.RestockRequests;

  @description: 'Customer feedback and complaints with resolution status'
  @readonly entity CustomerFeedback as projection on cafe.CustomerFeedback;

  // -- Cafe Assistant Operations ---------------------------------------------

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

  @description: 'Get an AI-powered meal recommendation. Streamed as Server-Sent Events.'
  action getRecommendation(
    @description: 'What you are in the mood for' preferences : String,
    @description: 'Maximum budget in EUR' budget : Decimal
  ) returns String;

  // -- Kitchen Manager Operations --------------------------------------------

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

  @description: 'Fulfill a restock request -- adds the quantity to menu item stock and marks request as fulfilled'
  action fulfillRestockRequest(
    @description: 'UUID of the restock request to fulfill' requestId : UUID
  ) returns RestockRequests;

  @description: 'Find alternative menu items in the same category when an item is out of stock'
  function findAlternatives(
    @description: 'UUID of the out-of-stock item to find alternatives for' itemId : UUID
  ) returns array of Menu;

  // -- Grievance Manager Operations ------------------------------------------

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

  @description: 'Get all open (unresolved) complaints -- feedback with negative sentiment that has not been resolved yet'
  function getOpenComplaints() returns array of CustomerFeedback;

  @description: 'Resolve a customer complaint with a resolution message. Only works on open complaints.'
  action resolveComplaint(
    @description: 'UUID of the feedback to resolve' feedbackId : UUID,
    @description: 'Resolution message explaining what was done to address the complaint' resolution : String
  ) returns CustomerFeedback;

  @description: 'Generate an empathetic AI-powered response to a customer complaint. Streamed as Server-Sent Events.'
  action generateComplaintResponse(
    @description: 'UUID of the feedback to respond to' feedbackId : UUID
  ) returns String;

  // -- Agent Orchestration ---------------------------------------------------

  @description: 'Invoke the multi-agent orchestrator. Routes the message to the appropriate specialist (Cafe Assistant, Kitchen Manager, or Grievance Manager) and returns the final response.'
  action invokeAgent(
    @description: 'The user message to process' message : String
  ) returns String;
}
