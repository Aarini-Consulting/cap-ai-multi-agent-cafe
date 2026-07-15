# Add Audit Logging

In the previous exercise you locked down the service with authentication and authorization. But security is not just about preventing unauthorized access — it is also about **proving** what happened. When an AI agent accesses data on behalf of users, you need an immutable compliance record of who accessed what data and when.

In this exercise you will add audit logging using [`@cap-js/audit-logging`](https://www.npmjs.com/package/@cap-js/audit-logging) to track data access and agent operations. This is critical for compliance frameworks like GDPR and SOX, and for security investigations when something goes wrong.

> **Audit logging vs regular logging:**
>
> Regular logs (`console.log`) are operational — they help you debug. They can be deleted, rotated, or modified.
>
> Audit logs are **compliance records** — they are immutable, tamper-proof, and legally significant. On SAP BTP, audit log entries go to the [SAP Audit Log Viewer](https://help.sap.com/docs/btp/sap-business-technology-platform/audit-log-service) where they cannot be altered or deleted.
>
> When an AI agent places an order, reads customer complaints, or gets denied access, each of those events must be recorded in the audit trail — not just in a log file.

**References:**
- [CAP Audit Logging Guide](https://cap.cloud.sap/docs/guides/data-privacy/audit-logging)
- [SAP Audit Log Service](https://help.sap.com/docs/btp/sap-business-technology-platform/audit-log-service)

---

## Overview

You will:

1. Add the `@cap-js/audit-logging` dependency
2. Create `srv/data-privacy.cds` with `@PersonalData` annotations
3. Create `server.js` with custom audit event logging for agent operations
4. Test audit logging locally
5. Understand the difference between auto-generated and custom audit events

---

## Step 1: Add the @cap-js/audit-logging Dependency

The [`@cap-js/audit-logging`](https://cap.cloud.sap/docs/guides/data-privacy/audit-logging) plugin integrates with the CAP runtime to automatically generate audit events based on `@PersonalData` annotations. It also provides a programmatic API for logging custom events.

> **Action**
>
> Install the audit logging plugin:

```bash
npm install @cap-js/audit-logging
```

Your `package.json` dependencies should now include:

```json
{
  "dependencies": {
    "@sap/cds": "^9",
    "@cap-js/audit-logging": "^1",
    "@sap/xssec": "^4",
    "passport": "^0.7"
  }
}
```

> **What's happening here?**
>
> The `@cap-js/audit-logging` package is a CDS plugin. When installed, it automatically:
> - Registers an `audit-log` service that you can connect to programmatically
> - Watches for `@PersonalData` annotations and generates `SensitiveDataRead` and `PersonalDataModified` events automatically
> - In development, logs audit events to the console
> - In production (on SAP BTP), sends events to the SAP Audit Log service

---

## Step 2: Create data-privacy.cds

CDS [`@PersonalData` annotations](https://cap.cloud.sap/docs/guides/data-privacy/annotations) tell the audit logging plugin which entities contain personal or sensitive data. When these entities are read or modified, the plugin automatically generates audit events.

> **Action**
>
> Create a new file `srv/data-privacy.cds`:

```cds
// srv/data-privacy.cds

using { cafe } from '../db/schema';

annotate cafe.CustomerFeedback with @PersonalData: {
  EntitySemantics: 'DataSubjectDetails'
} {
  comment    @PersonalData.IsPotentiallyPersonal;
  resolution @PersonalData.IsPotentiallyPersonal;
};

annotate cafe.Orders with @PersonalData: {
  EntitySemantics: 'DataSubjectDetails'
};
```

> **Result**
>
> The file compiles without errors. No visible output yet — the annotations take effect when the audit logging plugin processes them at runtime.

> **What's happening here?**
>
> - `@PersonalData.EntitySemantics: 'DataSubjectDetails'` marks an entity as containing data related to a data subject (a person). Other options include `'DataSubject'` (the entity *is* the person record) and `'Other'`.
> - `@PersonalData.IsPotentiallyPersonal` marks a field as containing data that *could* identify a person — like a customer comment that might mention their name, email, or other personal details.
> - `@PersonalData.IsPotentiallySensitive` (not used here) marks fields requiring extra protection — like credit card numbers or health data.
>
> When the audit logging plugin sees these annotations, it automatically generates:
> - `SensitiveDataRead` events when annotated entities are queried
> - `PersonalDataModified` events when annotated entities are created, updated, or deleted
>
> You do not need to write any code for these — the plugin handles it.

---

## Step 3: Create server.js for Custom Audit Events

The `@PersonalData` annotations handle standard data-access auditing automatically. But for an AI agent application, you also need to track **agent-specific operations** that go beyond simple CRUD:

- **403 Forbidden responses** — someone tried to access something they should not have
- **Agent invocations** — who triggered the agent and what did they ask
- **Data-modifying operations** — which agent tools changed data (orders placed, complaints resolved)
- **Sensitive data reads** — which agent tools accessed potentially sensitive information (complaints, feedback details)

These require custom audit events, which you implement in a [`server.js` file](https://cap.cloud.sap/docs/node.js/cds-serve#custom-server-js).

> **Action**
>
> Create a new file `server.js` in the project root (not in `srv/`):

```javascript
// server.js

const cds = require('@sap/cds');

let audit;

cds.on('served', async () => {
  try {
    audit = await cds.connect.to('audit-log');
    console.log('[audit] Audit logging connected');
  } catch (e) {
    console.warn('[audit] Audit logging not available:', e.message);
  }
});

cds.on('bootstrap', (app) => {
  app.use((req, res, next) => {
    const originalEnd = res.end;
    res.end = function (...args) {
      if (res.statusCode === 403 && audit) {
        const user = req.user?.id || cds.context?.user?.id || 'anonymous';
        const resource = req.originalUrl || req.url;
        audit.tx(async () => {
          await audit.log('SecurityEvent', {
            data: {
              user,
              action: `Access denied to "${resource}" — insufficient authorization`,
            },
          });
        }).catch((e) => console.error('[audit] Failed to log security event:', e.message));
      }
      return originalEnd.apply(this, args);
    };
    next();
  });
});

cds.on('serving', (service) => {
  if (service.name !== 'CafeService') return;

  service.before('invokeAgent', (req) => {
    const user = req.user?.id || 'anonymous';
    const message = req.data?.message;
    if (audit) {
      audit.tx(async () => {
        await audit.log('SecurityEvent', {
          data: {
            user,
            action: `Agent invoked with message: "${message?.substring(0, 100)}"`,
          },
        });
      }).catch(() => {});
    }
  });

  const writeOps = ['placeOrder', 'cancelOrderItem', 'createRestockRequest',
    'fulfillRestockRequest', 'submitFeedback', 'resolveComplaint'];

  for (const op of writeOps) {
    service.before(op, (req) => {
      const user = req.user?.id || 'anonymous';
      if (audit) {
        audit.tx(async () => {
          await audit.log('SecurityEvent', {
            data: {
              user,
              action: `Agent tool executed: "${op}"`,
              data: JSON.stringify(req.data),
            },
          });
        }).catch(() => {});
      }
    });
  }

  const readOps = ['checkStock', 'getLowStockItems', 'getOpenComplaints',
    'getFeedbackDetails', 'getOrderSummary'];

  for (const op of readOps) {
    service.before(op, (req) => {
      const user = req.user?.id || 'anonymous';
      if (audit) {
        audit.tx(async () => {
          await audit.log('SecurityEvent', {
            data: {
              user,
              action: `Agent data access: "${op}"`,
              data: JSON.stringify(req.data),
            },
          });
        }).catch(() => {});
      }
    });
  }
});

module.exports = cds.server;
```

> **Result**
>
> The file is created. It will take effect when the server starts.

> **What's happening here?**
>
> This file replaces the default CDS server entry point. Let's walk through each section:
>
> **1. Audit connection (`cds.on('served')`)**
>
> After all services are served, we connect to the `audit-log` service. In development, this uses an in-memory mock. In production on SAP BTP, it connects to the real SAP Audit Log service.
>
> **2. 403 interception (`cds.on('bootstrap')`)**
>
> We install Express middleware that intercepts every response. If the status code is `403` (Forbidden), we log a `SecurityEvent` with the user and the resource they tried to access. This catches authorization failures from the `@requires` annotation you added in Exercise 3.
>
> **3. Agent invocation tracking (`service.before('invokeAgent')`)**
>
> Every time a user triggers the AI agent, we log who did it and what they asked (truncated to 100 characters for privacy). This creates a trail showing exactly which users interacted with the agent.
>
> **4. Write operation tracking (`writeOps`)**
>
> Operations that modify data — placing orders, resolving complaints, creating restock requests — are logged with the full request payload. This answers the question: "What data did the agent change, and on whose behalf?"
>
> **5. Read operation tracking (`readOps`)**
>
> Operations that read potentially sensitive data — open complaints, feedback details, order summaries — are also logged. This answers the GDPR question: "Who accessed this customer's complaint data?"
>
> **Why `audit.tx(async () => { ... })`?**
>
> Audit events must run in their own transaction to ensure they are persisted even if the main request fails. The `.catch(() => {})` ensures that a failure in audit logging never breaks the main request — audit logging should be fire-and-forget.

---

## Step 4: Test Audit Logging

> **Action**
>
> Restart the service:

```bash
cds watch
```

> **Result**
>
> You should see `[audit] Audit logging connected` in the startup output. This confirms the audit logging plugin is active.

### Test: Place an order

> **Action**
>
> Place an order as the authenticated user:

```bash
curl -u cafe-user:initial -X POST http://localhost:4004/api/cafe/placeOrder \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "itemId": "b1a2c3d4-0004-0000-0000-000000000004", "quantity": 1 }
    ]
  }'
```

> **Result**
>
> The order is created successfully. In the terminal, you should see a `SecurityEvent` audit log entry like:
>
> ```
> [audit] SecurityEvent: Agent tool executed: "placeOrder"
> ```
>
> This shows that the audit trail captured who placed the order and when.

### Test: Unauthorized access

> **Action**
>
> Try accessing the service without credentials:

```bash
curl -i http://localhost:4004/api/cafe/Menu
```

> **Result**
>
> You get `401 Unauthorized`. This is CAP rejecting the request because no credentials were provided. The `server.js` intercepts **403 Forbidden** responses (which occur when a user is authenticated but lacks the required role), so you will not see an audit event for this 401 case.
>
> To trigger a 403 audit event, you would need a user who authenticates successfully but does not have the `authenticated-user` role.

### Test: Read order summary

> **Action**
>
> Read an order summary (use the order ID from the previous test):

```bash
curl -u cafe-user:initial "http://localhost:4004/api/cafe/getOrderSummary(orderID='<your-order-id>')"
```

> **Result**
>
> The order details are returned, and a `SecurityEvent` is logged:
>
> ```
> [audit] SecurityEvent: Agent data access: "getOrderSummary"
> ```

> **In production**, these audit events go to the SAP Audit Log Viewer on BTP, where they are stored immutably and can be queried by compliance officers. You can filter by user, time range, event type, and resource.

---

## Step 5: Auto-Generated vs Custom Audit Events

It is important to understand the two layers of audit logging working together:

### Auto-generated events (from @PersonalData annotations)

These are handled entirely by the `@cap-js/audit-logging` plugin based on your `data-privacy.cds` annotations:

| Event | Trigger | Example |
|---|---|---|
| `SensitiveDataRead` | Reading an entity with `@PersonalData` fields | Querying `CustomerFeedback` returns comment data |
| `PersonalDataModified` | Creating/updating an entity with `@PersonalData` fields | Submitting new feedback with a customer comment |

You write **zero code** for these. The plugin intercepts CDS queries and generates the events automatically.

### Custom events (from server.js)

These are specific to your application's agent architecture:

| Event | Trigger | Why it matters |
|---|---|---|
| `SecurityEvent` (403) | Unauthorized access attempt | Detect brute-force or misconfigured clients |
| `SecurityEvent` (agent) | Agent invocation | Track who uses the AI agent and what they ask |
| `SecurityEvent` (write) | Data-modifying tool call | Prove what the agent changed and on whose behalf |
| `SecurityEvent` (read) | Sensitive data read via tool | GDPR: prove who accessed personal data |

Together, these two layers give you complete coverage: the plugin handles standard data privacy events, and your custom code handles agent-specific security events.

---

## Verification

Confirm your project now has these files:

```
project/
  package.json          <-- now includes @cap-js/audit-logging, @sap/xssec, passport
  server.js             <-- NEW: custom audit event logging
  xs-security.json      <-- XSUAA security descriptor (from Exercise 3)
  db/
    schema.cds
    data/
      cafe-MenuItems.csv
  srv/
    cafe-service.cds    <-- unchanged from Exercise 3 (@requires)
    cafe-service.js     <-- unchanged from Exercise 3
    data-privacy.cds    <-- NEW: @PersonalData annotations
```

Run `cds watch` and verify:

1. `[audit] Audit logging connected` appears in startup
2. Placing an order logs a `SecurityEvent` for the `placeOrder` tool
3. Reading an order summary logs a `SecurityEvent` for `getOrderSummary`
4. Accessing without credentials returns `401 Unauthorized` (403 audit events trigger when an authenticated user lacks the required role)

---

## Further Reading

- [CAP Audit Logging Guide](https://cap.cloud.sap/docs/guides/data-privacy/audit-logging) — how `@cap-js/audit-logging` works with `@PersonalData` annotations
- [SAP Audit Log Service](https://help.sap.com/docs/btp/sap-business-technology-platform/audit-log-service) — the BTP service that stores and displays audit events in production
- [CAP Data Privacy Annotations](https://cap.cloud.sap/docs/guides/data-privacy/annotations) — `@PersonalData.EntitySemantics`, `IsPotentiallyPersonal`, `IsPotentiallySensitive`
- [Custom CDS Server](https://cap.cloud.sap/docs/node.js/cds-serve#custom-server-js) — how `server.js` overrides the default CDS server entry point
- [CDS Event Handlers](https://cap.cloud.sap/docs/node.js/core-services#srv-before) — `service.before()` hooks for intercepting operations

---

## Summary

You added two layers of audit logging to the cafe service:

- **`@PersonalData` annotations** in `data-privacy.cds` enable automatic audit events for personal data access and modification — zero code required
- **Custom `SecurityEvent` logging** in `server.js` tracks agent-specific operations: 403 failures, agent invocations, data-modifying tool calls, and sensitive data reads
- In development, audit events appear in the console; in production on SAP BTP, they go to the immutable SAP Audit Log Viewer

The key insight: when an AI agent acts on behalf of a user, the audit trail must capture **both** the user's identity and the agent's actions. Standard CRUD auditing is not enough — you need to track the agent layer too.

---

Next exercise: [Exercise 5: Observability](../ex5/README.md)
