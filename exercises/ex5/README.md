# Exercise 5 — Add Observability

In the previous exercise you added audit logging to create an immutable compliance trail. Audit logging answers "who did what?" for compliance officers. Observability answers a different question: "how is the system performing?" — request durations, database query times, and end-to-end traces.

In this exercise you will add observability using the official [`@cap-js/telemetry`](https://github.com/cap-js/telemetry) plugin, which auto-instruments your CAP service with OpenTelemetry-based tracing and metrics — no custom code required.

**References:**
- [@cap-js/telemetry on GitHub](https://github.com/cap-js/telemetry)
- [CAP Observability Guide](https://cap.cloud.sap/docs/guides/observability)
- [OpenTelemetry Observability Primer](https://opentelemetry.io/docs/concepts/observability-primer/)

---

## Overview

You will:

1. Install the `@cap-js/telemetry` plugin
2. Start the server and observe auto-generated trace output
3. Understand what the plugin instruments automatically
4. Learn how to configure telemetry for production

---

## Audit Logging vs Observability

Before starting, it is important to understand why these are separate concerns:

| | Audit Logging | Observability |
|---|---|---|
| **Purpose** | Compliance | Operations |
| **Question** | "Who did what?" | "How is it performing?" |
| **Destination** | SAP Audit Log Viewer | SAP Cloud Logging / Dynatrace / Jaeger |
| **Retention** | Immutable, long-term | Configurable, queryable |
| **Audience** | Compliance officers, auditors | Developers, SREs, operations teams |
| **Example** | "cafe-user placed order at 14:32" | "placeOrder took 45ms, DB query took 12ms" |

In Exercise 4 you built the audit trail. Now you add the operations layer on top. The two coexist — audit logging in `server.js`, telemetry via the plugin.

---

## Step 1: Install the Telemetry Plugin

The `@cap-js/telemetry` plugin integrates with the CAP runtime to automatically instrument your service with [OpenTelemetry](https://opentelemetry.io/)-based tracing. It requires no code changes — just install and it works.

```bash
npm install @cap-js/telemetry
```

That's it. The plugin is a CDS plugin that activates automatically when installed.

---

## Step 2: Start the Server and Observe

Restart the service:

```bash
cds watch
```

You should see telemetry-related output in the startup logs, including a line like:

```
[telemetry] - using tracing exporter { exporter: 'ConsoleSpanExporter' }
```

This confirms the telemetry plugin is active and exporting trace spans to the console.

Now trigger some operations:

```bash
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/Menu" 
curl -s -u cafe-user:initial -X POST http://localhost:4004/api/cafe/placeOrder \
  -H "Content-Type: application/json" \
  -d '{"items": [{"itemId": "b1a2c3d4-0004-0000-0000-000000000004", "quantity": 1}]}'
curl -s -u cafe-user:initial "http://localhost:4004/api/cafe/getLowStockItems()"
```

In the terminal, you will see detailed trace output for each request. The plugin automatically traces:

| What is traced | Example output |
|---|---|
| **HTTP requests** | `GET /api/cafe/Menu` with status code and duration |
| **CDS service dispatching** | `CafeService - READ Menu` with timing |
| **Database queries** | `db - READ CafeService.Menu` with SQL timing |
| **Individual handler execution** | Each `on`, `before`, `after` handler with duration |

Each trace entry includes a **trace ID** and **span ID** that let you correlate all operations within a single request — the same concept as the manual tracing from the previous approach, but fully automatic.

---

## Step 3: Understanding the Trace Output

The console exporter shows trace spans with timing data. A typical `placeOrder` request produces multiple spans:

```
CafeService - placeOrder                    (total: ~50ms)
  ├── db - READ CafeService.Menu            (SELECT menu item: ~5ms)
  ├── db - UPDATE CafeService.Menu          (decrement stock: ~3ms)
  ├── db - INSERT CafeService.Orders        (create order: ~4ms)
  ├── db - INSERT cafe.OrderItems           (create order item: ~3ms)
  └── db - READ CafeService.Orders          (read back result: ~8ms)
```

This tells you exactly where time is spent — if `placeOrder` is slow, you can see whether it is the database queries, the handler logic, or something else.

> **Key insight for AI agents:** When the agent orchestrator calls multiple tools in sequence (check menu → place order → check stock), each tool call produces its own trace. In production, these traces flow to your observability backend where you can visualize the full agent interaction as a waterfall diagram.

---

## Step 4: Production Configuration

In development, the plugin exports traces to the console. In production on SAP BTP, you configure it to send traces to an observability backend.

### SAP Cloud Logging (Dynatrace)

If you have SAP Cloud Logging (powered by Dynatrace) on your BTP subaccount, bind the service and the plugin auto-detects it:

```json
{
  "cds": {
    "requires": {
      "[production]": {
        "telemetry": {
          "kind": "to-cloud-logging"
        }
      }
    }
  }
}
```

> These production configurations are optional for this workshop. The console exporter is sufficient for learning and local testing.

---

## Verification

Run `cds watch` and verify:

1. `[telemetry] - using tracing exporter` appears at startup
2. Requesting `Menu` produces trace spans in the terminal
3. Placing an order shows multiple spans (SELECT, UPDATE, INSERT)
4. Each span includes timing information (duration in milliseconds)

---

## Further Reading

- [@cap-js/telemetry documentation](https://github.com/cap-js/telemetry) — setup, configuration, and exporter options
- [CAP Observability Guide](https://cap.cloud.sap/docs/guides/observability) — observability patterns for CAP applications
- [OpenTelemetry Observability Primer](https://opentelemetry.io/docs/concepts/observability-primer/) — industry-standard concepts: logs, metrics, traces
- [SAP Cloud Logging](https://help.sap.com/docs/cloud-logging) — the BTP service for log aggregation, search, and dashboards

---

## Summary

You added observability to the cafe service using the official `@cap-js/telemetry` plugin:

- **Zero code changes** — just `npm install @cap-js/telemetry` and the plugin auto-instruments everything
- **Automatic tracing** of HTTP requests, CDS service operations, and database queries with timing
- **Trace IDs** correlate all operations within a single request
- **Console output** in development, **SAP Cloud Logging / Dynatrace / Jaeger** in production

The key insight: the `@cap-js/telemetry` plugin gives you production-grade observability without writing custom instrumentation code. Combined with the audit logging from Exercise 4, you now have both compliance and operations coverage.

---

[Continue to Exercise 6 →](../ex6/README.md)
