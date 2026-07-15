# Exercise 9 — Add the Web UI

In the previous exercises you built the CAP service and the AI agents. You tested everything with `curl` commands. In this exercise you will add pre-built React web applications that provide a visual interface for the cafe — a chat UI for talking to the agent, an order management screen, a kitchen dashboard, and a grievance management view.

The web apps are provided as pre-built static files. You do not need to modify or build them — just copy them into your project and CAP will serve them automatically.

---

## Overview

You will:

1. Copy the pre-built web apps into the `app/` folder
2. Restart the CAP server
3. Open the apps in your browser

---

## Step 1: Copy the Web Apps

CAP automatically serves any folder under `app/` that contains an `index.html` file as a static web application. The solution includes four pre-built React apps:

| App | URL Path | Purpose |
|---|---|---|
| `chat-ui` | `/chat-ui/index.html` | Chat interface for talking to the AI agent via `invokeAgent` |
| `cafe-order` | `/cafe-order/index.html` | Order management — browse menu, place orders, view order history |
| `kitchen-mgr` | `/kitchen-mgr/index.html` | Kitchen dashboard — stock levels, restock requests, demand analysis |
| `grievance-mgr` | `/grievance-mgr/index.html` | Grievance management — customer feedback, complaints, resolution |

Copy the built app folders from the solution into your project:

Copy paste the app folder entirely from the solution and paste it into `my-cafe`.

> **Note:** Only copy the built folders (`chat-ui`, `cafe-order`, `kitchen-mgr`, `grievance-mgr`), not the source folders (`chat-ui-src`, `cafe-order-src`, etc.). The built folders contain static HTML, CSS, and JavaScript — no `npm install` or build step needed.

Your project structure should now look like:

```
my-cafe/
  app/
    cafe-order/
      index.html
      assets/
    chat-ui/
      index.html
      assets/
    grievance-mgr/
      index.html
      assets/
    kitchen-mgr/
      index.html
      assets/
  agents/
    cafe-assistant/
    kitchen-manager/
    grievance-manager/
    orchestrator.mjs
  db/
    schema.cds
    data/
  srv/
    cafe-service.cds
    cafe-service.js
    data-privacy.cds
  server.js
  package.json
  xs-security.json
```

---

## Step 2: Start All Services

The web apps (especially the Chat UI) call the CAP service and the AI agent orchestrator. You need all services running.

**Terminal 1 — CAP Service:**
```bash
cd my-cafe
cds watch
```

**Terminal 2 — Cafe Assistant (port 8081):**
```bash
cd agents/cafe-assistant
npm run dev
```

**Terminal 3 — Kitchen Manager (port 8082):**
```bash
cd agents/kitchen-manager
npm run dev
```

**Terminal 4 — Grievance Manager (port 8083):**
```bash
cd agents/grievance-manager
npm run dev
```

Verify all four processes are running:

| Service | URL | Check |
|---|---|---|
| CAP Service | `http://localhost:4004` | CDS welcome page with app links |
| Cafe Assistant | `http://localhost:8081/.well-known/agent.json` | Agent card JSON |
| Kitchen Manager | `http://localhost:8082/.well-known/agent.json` | Agent card JSON |
| Grievance Manager | `http://localhost:8083/.well-known/agent.json` | Agent card JSON |

---

## Step 3: Explore the Apps

Open each app in your browser. Log in with `cafe-user` / `initial` when prompted.

### Chat UI — `http://localhost:4004/chat-ui/index.html`

The chat interface sends messages to the `invokeAgent` action. Type a message like "What vegan options do you have?" and the orchestrator routes it to the Cafe Assistant agent.

> **Note:** If you see an error in the chat, verify that all three agent processes (terminals 2-4) are still running.

### Cafe Order — `http://localhost:4004/cafe-order/index.html`

Browse the menu, see stock levels, and place orders directly. This app calls the CAP service endpoints (`Menu`, `placeOrder`, `Orders`) without going through the AI agent.

### Kitchen Manager — `http://localhost:4004/kitchen-mgr/index.html`

View stock levels, low-stock alerts, pending restock requests, and demand analysis. This app calls `getLowStockItems`, `RestockRequests`, and `getItemDemand`.

### Grievance Manager — `http://localhost:4004/grievance-mgr/index.html`

View customer feedback, open complaints, and resolve them. This app calls `getOpenComplaints`, `getFeedbackDetails`, and `resolveComplaint`.

---

## Summary

You added four pre-built web applications to your CAP project:

- **Chat UI** — conversational interface for the AI agent orchestrator
- **Cafe Order** — direct menu browsing and ordering
- **Kitchen Manager** — stock monitoring and restock management
- **Grievance Manager** — customer feedback and complaint resolution

CAP serves them automatically as static content from the `app/` folder — no build step, no configuration, no additional dependencies.

---

[Continue to Exercise 10 →](../ex10/README.md)
