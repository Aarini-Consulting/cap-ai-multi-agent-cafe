using { cafe } from '../db/schema';

@path: '/api/cafe'
service CafeService {

  @readonly entity Menu as projection on cafe.MenuItems;

  @readonly entity Orders as projection on cafe.Orders;

  @readonly entity RestockRequests as projection on cafe.RestockRequests;

  @readonly entity CustomerFeedback as projection on cafe.CustomerFeedback;

}
