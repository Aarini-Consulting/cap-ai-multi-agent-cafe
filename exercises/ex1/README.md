# Exercise 1 — Build the CAP Service Foundation

In this exercise you will create a CAP service from scratch that models an office cafeteria. By the end, you will have a running OData/REST service with a menu, orders, stock management, customer feedback, and seed data — the foundation that AI agents will later connect to.

---

## Overview

You will:

1. Define a data model with five entities: `MenuItems`, `Orders`, `OrderItems`, `RestockRequests`, and `CustomerFeedback`
2. Load seed data so the menu is pre-populated (with deliberate low-stock and out-of-stock items)
3. Expose the data through a basic service definition (no annotations yet)
4. Run the service and explore the raw endpoints
5. Inspect the OData `$metadata` to see what's missing for AI agents

---

## Step 1: Define the Data Model

The data model lives in `db/schema.cds` (see [CDS Schema & Data Modeling](https://cap.cloud.sap/docs/cds/cdl)). You will create five entities:

| Entity | Purpose |
|---|---|
| `MenuItems` | Food and drink items on the cafe menu, with stock tracking |
| `Orders` | Customer orders with status and total |
| `OrderItems` | Line items linking an order to menu items |
| `RestockRequests` | Requests to replenish kitchen inventory |
| `CustomerFeedback` | Customer complaints and feedback linked to orders |

Open your project folder (`my-cafe/` from Exercise 0) and add the following content to `db/schema.cds`:

```cds
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
```

> **What's happening here?**
>
> - `namespace cafe;` scopes all entity names under `cafe.` to avoid naming collisions.
> - `MenuItems` includes `stockQuantity` and `lowStockThreshold` — these drive the Kitchen Manager agent in later exercises. When stock hits 0, the item becomes unavailable.
> - `dietary` is a plain string (e.g., `"vegan,gluten_free"`) rather than an association table. This keeps things simple for the workshop.
> - `Orders` has a **Composition** to `OrderItems` and to `CustomerFeedback`. Compositions are lifecycle-dependent — deleting an order deletes its items and feedback.
> - `RestockRequests` tracks kitchen inventory replenishment. The `urgency` field (normal, high, critical) helps the Kitchen Manager prioritize.
> - `CustomerFeedback` links complaints to specific orders with sentiment tracking and resolution workflow. The Grievance Manager agent will use this in later exercises.

---

## Step 2: Add Seed Data

CAP can auto-load CSV files placed in `db/data/` if the file name matches the fully qualified entity name (namespace + entity).

Create the folder `db/data/` and add the following five CSV files.

### 2a. Menu Items — `db/data/cafe-MenuItems.csv`

```csv
ID,name,description,price,currency,category,dietary,available,prepTimeMin,stockQuantity,lowStockThreshold
b1a2c3d4-0001-0000-0000-000000000001,Vegan Buddha Bowl,"Quinoa, roasted chickpeas, avocado, mixed greens, tahini dressing",7.90,EUR,main,"vegan,gluten_free",true,12,50,5
b1a2c3d4-0002-0000-0000-000000000002,Grilled Chicken Bowl,"Grilled chicken breast, basmati rice, mixed greens, honey mustard",8.50,EUR,main,gluten_free,true,15,3,5
b1a2c3d4-0003-0000-0000-000000000003,Pasta Carbonara,"Classic carbonara with pancetta, egg, parmesan, and black pepper",9.20,EUR,main,,true,10,30,5
b1a2c3d4-0004-0000-0000-000000000004,Flat White,"Double shot espresso with silky steamed milk",3.50,EUR,drink,vegetarian,true,3,100,10
b1a2c3d4-0005-0000-0000-000000000005,Fresh Orange Juice,"Freshly squeezed seasonal oranges",4.00,EUR,drink,"vegan,gluten_free",false,2,0,5
b1a2c3d4-0006-0000-0000-000000000006,Chocolate Brownie,"Rich dark chocolate brownie with walnuts",3.00,EUR,dessert,vegetarian,true,0,25,5
b1a2c3d4-0007-0000-0000-000000000007,Fruit Salad,"Seasonal fresh fruit mix with mint and lime",4.50,EUR,snack,"vegan,gluten_free",true,5,15,5
b1a2c3d4-0008-0000-0000-000000000008,Sparkling Water,"330ml sparkling mineral water",1.50,EUR,drink,vegan,true,0,200,20
```

> **Notice the stock triggers:**
>
> - **Grilled Chicken Bowl** — stock=3, threshold=5 → LOW STOCK (will trigger the Kitchen Manager agent proactively)
> - **Fresh Orange Juice** — stock=0, available=false → OUT OF STOCK (will trigger the Kitchen Manager when ordered)
> - Other items have healthy stock levels

### 2b. Orders — `db/data/cafe-Orders.csv`

```csv
ID,status,total,orderDate
a1000001-0000-0000-0000-000000000001,confirmed,16.40,2026-07-14T09:15:00Z
a1000001-0000-0000-0000-000000000002,confirmed,12.70,2026-07-14T10:30:00Z
a1000001-0000-0000-0000-000000000003,confirmed,11.40,2026-07-14T11:45:00Z
a1000001-0000-0000-0000-000000000004,confirmed,8.50,2026-07-14T12:00:00Z
a1000001-0000-0000-0000-000000000005,cancelled,7.90,2026-07-14T12:20:00Z
a1000001-0000-0000-0000-000000000006,confirmed,8.50,2026-07-13T09:00:00Z
a1000001-0000-0000-0000-000000000007,confirmed,8.50,2026-07-13T11:30:00Z
a1000001-0000-0000-0000-000000000008,confirmed,8.50,2026-07-13T12:15:00Z
a1000001-0000-0000-0000-000000000009,confirmed,4.00,2026-07-12T10:00:00Z
a1000001-0000-0000-0000-000000000010,confirmed,8.50,2026-07-12T12:00:00Z
a1000001-0000-0000-0000-000000000011,confirmed,8.50,2026-07-11T11:00:00Z
a1000001-0000-0000-0000-000000000012,confirmed,7.90,2026-07-11T12:30:00Z
```

> 12 orders across 4 days. Order `...0005` is cancelled — useful for testing the cancelled-order flow later.

### 2c. Order Items — `db/data/cafe-OrderItems.csv`

```csv
ID,order_ID,item_ID,quantity,subtotal
b2000001-0000-0000-0000-000000000001,a1000001-0000-0000-0000-000000000001,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000002,a1000001-0000-0000-0000-000000000001,b1a2c3d4-0004-0000-0000-000000000004,1,3.50
b2000001-0000-0000-0000-000000000003,a1000001-0000-0000-0000-000000000001,b1a2c3d4-0008-0000-0000-000000000008,1,1.50
b2000001-0000-0000-0000-000000000004,a1000001-0000-0000-0000-000000000001,b1a2c3d4-0006-0000-0000-000000000006,1,3.00
b2000001-0000-0000-0000-000000000005,a1000001-0000-0000-0000-000000000002,b1a2c3d4-0001-0000-0000-000000000001,1,7.90
b2000001-0000-0000-0000-000000000006,a1000001-0000-0000-0000-000000000002,b1a2c3d4-0004-0000-0000-000000000004,1,3.50
b2000001-0000-0000-0000-000000000007,a1000001-0000-0000-0000-000000000002,b1a2c3d4-0008-0000-0000-000000000008,1,1.50
b2000001-0000-0000-0000-000000000008,a1000001-0000-0000-0000-000000000003,b1a2c3d4-0003-0000-0000-000000000003,1,9.20
b2000001-0000-0000-0000-000000000009,a1000001-0000-0000-0000-000000000003,b1a2c3d4-0008-0000-0000-000000000008,1,1.50
b2000001-0000-0000-0000-000000000010,a1000001-0000-0000-0000-000000000004,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000011,a1000001-0000-0000-0000-000000000005,b1a2c3d4-0001-0000-0000-000000000001,1,7.90
b2000001-0000-0000-0000-000000000012,a1000001-0000-0000-0000-000000000006,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000013,a1000001-0000-0000-0000-000000000007,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000014,a1000001-0000-0000-0000-000000000008,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000015,a1000001-0000-0000-0000-000000000009,b1a2c3d4-0005-0000-0000-000000000005,1,4.00
b2000001-0000-0000-0000-000000000016,a1000001-0000-0000-0000-000000000010,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000017,a1000001-0000-0000-0000-000000000011,b1a2c3d4-0002-0000-0000-000000000002,1,8.50
b2000001-0000-0000-0000-000000000018,a1000001-0000-0000-0000-000000000012,b1a2c3d4-0001-0000-0000-000000000001,1,7.90
```

> Notice the Grilled Chicken Bowl (`...0002`) appears in 7 orders — this is the high-demand item that's now running low on stock.

### 2d. Restock Requests — `db/data/cafe-RestockRequests.csv`

```csv
ID,item_ID,quantity,status,urgency,requestedAt,fulfilledAt,notes
d4000001-0000-0000-0000-000000000001,b1a2c3d4-0005-0000-0000-000000000005,50,pending,critical,2026-07-14T08:00:00Z,,"Fresh Orange Juice completely out of stock — customers requesting it daily"
d4000001-0000-0000-0000-000000000002,b1a2c3d4-0002-0000-0000-000000000002,30,pending,high,2026-07-14T09:30:00Z,,"Grilled Chicken Bowl down to 3 units — high demand today"
d4000001-0000-0000-0000-000000000003,b1a2c3d4-0007-0000-0000-000000000007,20,fulfilled,normal,2026-07-14T07:00:00Z,2026-07-14T08:30:00Z,"Fruit Salad routine morning restock — completed"
d4000001-0000-0000-0000-000000000004,b1a2c3d4-0006-0000-0000-000000000006,15,pending,normal,2026-07-14T10:00:00Z,,"Chocolate Brownie running lower than usual — afternoon rush expected"
d4000001-0000-0000-0000-000000000005,b1a2c3d4-0004-0000-0000-000000000004,40,fulfilled,high,2026-07-14T06:30:00Z,2026-07-14T07:15:00Z,"Flat White beans restocked for morning rush — completed"
```

> A mix of pending and fulfilled requests. The critical OJ restock and high-urgency chicken bowl restock are still pending — the Kitchen Manager agent will work with these later.

### 2e. Customer Feedback — `db/data/cafe-CustomerFeedback.csv`

```csv
ID,order_ID,rating,comment,sentiment,status,resolution,resolvedAt,createdAt
c3000001-0000-0000-0000-000000000001,a1000001-0000-0000-0000-000000000001,2,"The chicken bowl was lukewarm and the rice was undercooked. Very disappointing for the price.",negative,open,,,2026-07-14T09:45:00Z
c3000001-0000-0000-0000-000000000002,a1000001-0000-0000-0000-000000000002,5,"Absolutely loved the Buddha Bowl! Fresh ingredients and great portion size.",positive,resolved,"Thank you for your kind feedback! We're glad you enjoyed it.",,2026-07-14T11:00:00Z
c3000001-0000-0000-0000-000000000003,a1000001-0000-0000-0000-000000000003,1,"Pasta was stone cold and took 30 minutes to arrive. The server was rude when I asked about the delay. I want a refund.",negative,open,,,2026-07-14T12:15:00Z
c3000001-0000-0000-0000-000000000004,a1000001-0000-0000-0000-000000000004,3,"Chicken bowl was okay but nothing special. Expected more greens.",neutral,open,,,2026-07-14T12:30:00Z
c3000001-0000-0000-0000-000000000005,a1000001-0000-0000-0000-000000000001,1,"Found a hair in my brownie. Completely unacceptable. Will not be coming back.",negative,open,,,2026-07-14T10:00:00Z
c3000001-0000-0000-0000-000000000006,a1000001-0000-0000-0000-000000000002,4,"Good coffee as always. The flat white is consistently great here.",positive,resolved,"Thank you! Our barista team appreciates the recognition.",,2026-07-14T11:30:00Z
c3000001-0000-0000-0000-000000000007,a1000001-0000-0000-0000-000000000005,2,"Ordered a Buddha Bowl but received Pasta Carbonara instead. Wrong order entirely.",negative,open,,,2026-07-14T12:45:00Z
```

> A realistic mix: 4 open complaints (negative sentiment), 1 neutral, and 2 resolved positive reviews. The Grievance Manager agent will handle the open complaints in later exercises.

> **How does CAP seed data loading work?**
>
> Each file is named `cafe-<EntityName>.csv` — CAP resolves the `cafe` prefix as the namespace and matches the entity. When the server starts, CDS loads every row into the SQLite database automatically. The UUIDs are deterministic so you can reference them across files (e.g., order items reference both order IDs and menu item IDs).

---

## Step 3: Create the Service Definition

The [service definition](https://cap.cloud.sap/docs/cds/services) lives in `srv/cafe-service.cds`. For now, you will create a **bare** service with just entity projections — no `@description` annotations, no functions, no actions.

Add the following content to `srv/cafe-service.cds`:

```cds
using { cafe } from '../db/schema';

@path: '/api/cafe'
service CafeService {

  @readonly entity Menu as projection on cafe.MenuItems;

  @readonly entity Orders as projection on cafe.Orders;

  @readonly entity RestockRequests as projection on cafe.RestockRequests;

  @readonly entity CustomerFeedback as projection on cafe.CustomerFeedback;

}
```

> **What's happening here?**
>
> - `@path: '/api/cafe'` sets the URL prefix for all endpoints in this service.
> - `Menu` is a **projection** on `MenuItems` — it exposes all columns from the underlying entity, including `stockQuantity` and `lowStockThreshold`.
> - `RestockRequests` and `CustomerFeedback` are exposed so that agents can read restock and complaint data.
> - `@readonly` prevents clients from creating, updating, or deleting records directly — write operations will be handled through CDS actions in later exercises.
> - There are no `@description` annotations yet. You will add those in the next exercise to see the difference they make for AI agent discovery.

---

## Step 4: Run and Explore

Start the service in development mode (see [CAP Node.js Runtime](https://cap.cloud.sap/docs/node.js/)):

```bash
cds watch
```

You should see output similar to:

```
[cds] - loaded model from 2 file(s):

  srv/cafe-service.cds
  db/schema.cds

[cds] - connect to db > sqlite { url: ':memory:' }
  > init from db/data/cafe-MenuItems.csv
/> successfully deployed to in-memory database.

[cds] - serving CafeService { path: '/api/cafe' }

[cds] - server listening on { url: 'http://localhost:4004' }
```

Open your browser and navigate to the following URLs:

| URL | What you see |
|---|---|
| `http://localhost:4004` | CDS welcome page listing all services |
| `http://localhost:4004/api/cafe/Menu` | All 8 menu items as JSON |
| `http://localhost:4004/api/cafe/Menu?$filter=category eq 'drink'` | Only drinks |
| `http://localhost:4004/api/cafe/Menu?$select=name,price,stockQuantity` | Names, prices, and stock levels |
| `http://localhost:4004/api/cafe/Orders` | 12 orders across 4 days |
| `http://localhost:4004/api/cafe/RestockRequests` | 5 restock requests (3 pending, 2 fulfilled) |
| `http://localhost:4004/api/cafe/CustomerFeedback` | 7 feedback entries (4 open complaints, 2 resolved, 1 neutral) |

Verify that all 8 menu items appear and the stock quantities match your CSV data. Check that the Grilled Chicken Bowl shows `stockQuantity: 3` and Fresh Orange Juice shows `stockQuantity: 0`.

---

## Step 5: Inspect the Raw Metadata

Before adding annotations in the next exercise, take a moment to look at the service metadata as it is right now.

Open the OData metadata endpoint:

```
http://localhost:4004/api/cafe/$metadata
```

Scroll through the XML. Notice:

- Entity types (`Menu`, `Orders`, `RestockRequests`, `CustomerFeedback`) have properties listed, but **no human-readable descriptions**.
- There are **no function imports** or **action imports** — the service only exposes entity sets.
- A human developer can figure out what `prepTimeMin` or `lowStockThreshold` means, but an AI agent reading this metadata would have no context.

This is what a "bare" service looks like. In the next exercise, you will transform it into something an AI agent can understand and use confidently.

---

## Verification

At this point you should be able to confirm:

- `http://localhost:4004/api/cafe/Menu` returns exactly **8 menu items** with `stockQuantity` and `lowStockThreshold` fields
- Grilled Chicken Bowl has `stockQuantity: 3` (below its threshold of 5)
- Fresh Orange Juice has `stockQuantity: 0` and `available: false`
- `http://localhost:4004/api/cafe/Orders` returns **12 orders** (11 confirmed, 1 cancelled)
- `http://localhost:4004/api/cafe/RestockRequests` returns **5 restock requests** (3 pending, 2 fulfilled)
- `http://localhost:4004/api/cafe/CustomerFeedback` returns **7 feedback entries** with a mix of sentiments
- The `$metadata` endpoint shows entity definitions **without** any `@description` annotations

If all of this checks out, you are ready to proceed.

---

## Summary

You now have a running CAP service with:

- A data model with five entities (`MenuItems`, `Orders`, `OrderItems`, `RestockRequests`, `CustomerFeedback`)
- Seed data across all entities: 8 menu items, 12 orders, 5 restock requests, and 7 customer feedback entries
- A service exposing `Menu`, `Orders`, `RestockRequests`, and `CustomerFeedback` as read-only entity sets
- OData endpoints at `/api/cafe`

In the next exercise, you will make this service **agent-ready** by adding `@description` annotations, CDS functions, and CDS actions — turning a bare API into one that an AI agent can discover, understand, and use without human help.

---

## Further Reading

- [CDS Definition Language (CDL)](https://cap.cloud.sap/docs/cds/cdl) — entity definitions, types, compositions, and associations
- [CDS Services](https://cap.cloud.sap/docs/cds/services) — projections, service definitions, and exposing entities
- [CAP Getting Started](https://cap.cloud.sap/docs/get-started/) — project structure, seed data, and running your first service
- [OData Vocabularies in CAP](https://cap.cloud.sap/docs/advanced/odata#vocabularies) — how annotations map to OData metadata

---

[Continue to Exercise 2 →](../ex2/README.md)
