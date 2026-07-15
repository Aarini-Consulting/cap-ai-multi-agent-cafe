namespace cafe;

entity MenuItems {
  key ID                : UUID;
      name              : String(100);
      description       : String(500);
      price             : Decimal(9, 2);
      currency          : String(3) default 'EUR';
      category          : String(20);
      dietary           : String(200);
      available         : Boolean default true;
      prepTimeMin       : Integer;
      stockQuantity     : Integer default 50;
      lowStockThreshold : Integer default 5;
}

entity Orders {
  key ID        : UUID;
      status    : String(20) default 'confirmed';
      total     : Decimal(9, 2);
      orderDate : DateTime default $now;
      items     : Composition of many OrderItems on items.order = $self;
      feedback  : Composition of many CustomerFeedback on feedback.order = $self;
}

entity OrderItems {
  key ID       : UUID;
      order    : Association to Orders;
      item     : Association to MenuItems;
      quantity : Integer default 1;
      subtotal : Decimal(9, 2);
}

entity RestockRequests {
  key ID          : UUID;
      item        : Association to MenuItems;
      quantity    : Integer;
      status      : String(20) default 'pending';
      urgency     : String(10) default 'normal';
      requestedAt : DateTime default $now;
      fulfilledAt : DateTime;
      notes       : String(500);
}

entity CustomerFeedback {
  key ID          : UUID;
      order       : Association to Orders;
      rating      : Integer;
      comment     : String(1000);
      sentiment   : String(20);
      status      : String(20) default 'open';
      resolution  : String(1000);
      resolvedAt  : DateTime;
      createdAt   : DateTime default $now;
}
