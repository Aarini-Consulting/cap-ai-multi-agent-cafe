# Exercise 10 — Deploy to Cloud Foundry

In the previous exercises you built and tested everything locally — the CAP service, three specialist agents, the orchestrator, and the web UIs. In this exercise you will deploy the entire application to SAP BTP Cloud Foundry.

---

## Overview

You will:

1. Create Cloud Foundry manifests for each agent
2. Create `.cfignore` files
3. Update agent URLs for production
4. Deploy the CAP service
5. Deploy all three agents
6. Verify the deployment

### Architecture on Cloud Foundry

```
                    Cloud Foundry
    +--------------------------------------------+
    |                                            |
    |  +-----------------+                       |
    |  | cafe-assistant  |---+                   |
    |  |   :8080 (A2A)   |   |                   |
    |  +-----------------+   |                   |
    |                        |   +-----------+   |
    |  +-----------------+   +-->|  CAP srv  |   |
    |  | kitchen-manager |------>| (OData)   |   |
    |  |   :8080 (A2A)   |   +-->|           |   |
    |  +-----------------+   |   +-----------+   |
    |                        |                   |
    |  +-------------------+ |                   |
    |  | grievance-manager |-+                   |
    |  |    :8080 (A2A)    |                     |
    |  +-------------------+                     |
    |                                            |
    +--------------------------------------------+
```

Each agent runs as an independent CF application. All three agents call the shared CAP OData service for data operations. On CF, each app gets port 8080 assigned automatically.

---

## Step 1: Create Cloud Foundry Manifests

Each agent needs a `manifest.yml` for `cf push`.

### Cafe Assistant — `agents/cafe-assistant/manifest.yml`

```yaml
applications:
  - name: cafe-assistant-agent
    memory: 512M
    disk_quota: 1024M
    instances: 1
    buildpacks:
      - nodejs_buildpack
    health-check-type: http
    health-check-http-endpoint: /health
    timeout: 180
    command: npm start
    services:
      - agent-ai
    env:
      CAP_SERVICE_URL: https://<your-cap-service>.cfapps.<landscape>.hana.ondemand.com
```

### Kitchen Manager — `agents/kitchen-manager/manifest.yml`

```yaml
applications:
  - name: kitchen-manager-agent
    memory: 512M
    disk_quota: 1024M
    instances: 1
    buildpacks:
      - nodejs_buildpack
    health-check-type: http
    health-check-http-endpoint: /health
    timeout: 180
    command: npm start
    services:
      - agent-ai
    env:
      CAP_SERVICE_URL: https://<your-cap-service>.cfapps.<landscape>.hana.ondemand.com
```

### Grievance Manager — `agents/grievance-manager/manifest.yml`

```yaml
applications:
  - name: grievance-manager-agent
    memory: 512M
    disk_quota: 1024M
    instances: 1
    buildpacks:
      - nodejs_buildpack
    health-check-type: http
    health-check-http-endpoint: /health
    timeout: 180
    command: npm start
    services:
      - agent-ai
    env:
      CAP_SERVICE_URL: https://<your-cap-service>.cfapps.<landscape>.hana.ondemand.com
```

> **Manifest settings explained:**
>
> | Setting | Purpose |
> |---|---|
> | `buildpacks: nodejs_buildpack` | CF runs `npm install` and starts the app |
> | `health-check-http-endpoint: /health` | CF pings `GET /health` to verify the app is running |
> | `command: npm start` | Runs `node src/server.mjs` as defined in `package.json` |
> | `services: agent-ai` | Binds the SAP AI Core service instance for LLM access |
> | `CAP_SERVICE_URL` | Points to the deployed CAP service — update with your CF landscape |

---

## Step 2: Create `.cfignore` Files

Create a `.cfignore` file in each agent directory to exclude files from the CF upload:

```bash
echo -e ".env\nnode_modules/\n*.log" > agents/cafe-assistant/.cfignore
echo -e ".env\nnode_modules/\n*.log" > agents/kitchen-manager/.cfignore
echo -e ".env\nnode_modules/\n*.log" > agents/grievance-manager/.cfignore
```

> `.cfignore` works like `.gitignore` but for `cf push`. CF runs `npm install` itself, so `node_modules/` is not needed. `.env` files contain local secrets that should not be uploaded.

---

## Step 3: Update Orchestrator Agent URLs

The orchestrator (`agents/orchestrator.mjs`) references agent URLs via environment variables. For production, set these in the CAP service's deployment configuration or as environment variables.

Update the agent URLs at the top of `agents/orchestrator.mjs` to match your CF app URLs:

```javascript
const CAFE_ASSISTANT_URL = process.env.CAFE_ASSISTANT_URL || "http://localhost:8081";
const KITCHEN_MANAGER_URL = process.env.KITCHEN_MANAGER_URL || "http://localhost:8082";
const GRIEVANCE_MANAGER_URL = process.env.GRIEVANCE_MANAGER_URL || "http://localhost:8083";
```

The defaults work for local development. For production, set these environment variables on the CAP service deployment:

```bash
cf set-env my-cafe CAFE_ASSISTANT_URL https://cafe-assistant-agent.cfapps.<landscape>.hana.ondemand.com
cf set-env my-cafe KITCHEN_MANAGER_URL https://kitchen-manager-agent.cfapps.<landscape>.hana.ondemand.com
cf set-env my-cafe GRIEVANCE_MANAGER_URL https://grievance-manager-agent.cfapps.<landscape>.hana.ondemand.com
cf restage my-cafe
```

---

## Step 4: Deploy the CAP Service

Deploy the CAP service first, since the agents need it running.

```bash
cd my-cafe
cf push
```

> **Note:** You may need to create an `mta.yaml` or `manifest.yml` for the CAP service deployment depending on your project setup. Refer to the [CAP Deployment Guide](https://cap.cloud.sap/docs/guides/deployment/) for details.

Verify the CAP service is running:

```bash
curl https://<your-cap-service>.cfapps.<landscape>.hana.ondemand.com/api/cafe/Menu
```

---

## Step 5: Deploy the Agents

Deploy each agent:

```bash
cd agents/cafe-assistant
cf push

cd ../kitchen-manager
cf push

cd ../grievance-manager
cf push
```

---

## Step 6: Verify the Deployment

### Check Agent Cards

```bash
curl https://cafe-assistant-agent.cfapps.<landscape>.hana.ondemand.com/.well-known/agent.json
curl https://kitchen-manager-agent.cfapps.<landscape>.hana.ondemand.com/.well-known/agent.json
curl https://grievance-manager-agent.cfapps.<landscape>.hana.ondemand.com/.well-known/agent.json
```

Each should return a valid Agent Card JSON.

### Check Health Endpoints

```bash
curl https://cafe-assistant-agent.cfapps.<landscape>.hana.ondemand.com/health
curl https://kitchen-manager-agent.cfapps.<landscape>.hana.ondemand.com/health
curl https://grievance-manager-agent.cfapps.<landscape>.hana.ondemand.com/health
```

Each should return `{ "status": "ok" }`.

### Test the Orchestrator

```bash
curl -X POST https://<your-cap-service>.cfapps.<landscape>.hana.ondemand.com/api/cafe/invokeAgent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{"message": "What vegan options do you have?"}'
```

### Check Logs (if something fails)

```bash
cf logs cafe-assistant-agent --recent
cf logs kitchen-manager-agent --recent
cf logs grievance-manager-agent --recent
```

Common issues:

| Issue | Solution |
|---|---|
| `agent-ai` service not found | Create the SAP AI Core service instance: `cf create-service aicore default agent-ai` |
| `CAP_SERVICE_URL` unreachable | Verify the CAP service is deployed and the URL in `manifest.yml` is correct |
| Agent starts but fails on LLM call | Check that the `agent-ai` service binding provides valid credentials |

---

## Summary

You deployed the full multi-agent application to Cloud Foundry:

- **CAP Service** — the shared OData service with all entities and operations
- **Cafe Assistant** — menu browsing, ordering, recommendations
- **Kitchen Manager** — stock monitoring, restocking, alternatives
- **Grievance Manager** — feedback, complaints, resolution

Each agent is independently deployable, scalable, and discoverable via the A2A protocol. The orchestrator in the CAP service coordinates them via HTTP, forwarding JWT tokens for authentication.

---

## Further Reading

- [CAP Deployment Guide](https://cap.cloud.sap/docs/guides/deployment/) — deploying CAP applications to Cloud Foundry
- [Cloud Foundry Manifest Reference](https://docs.cloudfoundry.org/devguide/deploy-apps/manifest.html) — manifest.yml settings
- [A2A Protocol](https://a2a-protocol.org/latest/) — agent-to-agent communication standard

---

[Continue to Exercise 11 →](../ex11/README.md)
