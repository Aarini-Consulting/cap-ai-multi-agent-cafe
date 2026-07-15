# Exercise 11 -- Joule Integration

In the previous exercise you deployed three specialist A2A agents to Cloud Foundry. In this exercise, you will connect those agents to [SAP Joule](https://help.sap.com/docs/joule) -- SAP's AI copilot -- so that users can interact with your cafeteria agents directly from the Joule chat interface across SAP applications.

---

## Overview

### What is Joule?

[Joule](https://help.sap.com/docs/joule) is SAP's generative AI copilot embedded across SAP applications. It understands natural language and routes requests to the appropriate backend capabilities. By registering your A2A agents as Joule capabilities, users can ask Joule questions like "What's on the menu?" or "Check low stock items" and Joule will route those requests to your deployed agents.

### How Joule connects to A2A agents

Joule uses a YAML-based configuration model with four key concepts:

| Concept | File | Purpose |
|---|---|---|
| **Digital Assistant** | `da.sapdas.yaml` | Top-level manifest that lists all capabilities |
| **Capability** | `capability.sapdas.yaml` | Declares a skill with a display name, description, and system alias |
| **Scenario** | `*_scenario.yaml` | Describes WHEN to invoke the capability (intent matching) |
| **Function** | `*_function.yaml` | Describes HOW to invoke the capability (action sequence) |

The flow is: Joule receives a user message -> matches it to a scenario -> executes the function -> the function sends an `agent-request` to your A2A agent via a BTP Destination -> returns the response to the user.

### Architecture

```
    +----------+       +---------------+       +--------------------+
    |  Joule   | ----> | BTP           | ----> | A2A Agent          |
    |  (Chat)  |       | Destination   |       | (Cloud Foundry)    |
    +----------+       +---------------+       +--------------------+
         |                                            |
         |  cafe_scenario.yaml                        |  A2A protocol
         |  kitchen_scenario.yaml                     |  message/send
         |  grievance_scenario.yaml                   |
         v                                            v
    Intent matching                            ReAct agent + tools
    + function execution                       + CAP OData service
```

You will:

1. Create BTP Destinations for each deployed A2A agent
2. Create the Joule YAML configuration files (1 DA + 3 capabilities x 3 files each = 10 files)
3. Deploy the configuration to Joule using the Joule CLI
4. Test the integration in the Joule chat interface

---

## Step 1: Create BTP Destinations

Each A2A agent needs a [BTP Destination](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/create-http-destinations) so that Joule can reach it. The destination name must match the `system_alias` in the capability YAML.

### 1.1 Create the Cafe Assistant Destination

> :arrow_forward: **Action:** In the SAP BTP Cockpit, navigate to **Connectivity > Destinations** and create a new destination with the following settings:

| Property | Value |
|---|---|
| Name | `CAFE_ASSISTANT_AGENT` |
| Type | HTTP |
| URL | `https://cafe-assistant-agent.cfapps.eu10-005.hana.ondemand.com` |
| Proxy Type | Internet |
| Authentication | NoAuthentication |

> :white_check_mark: **Result:** The destination `CAFE_ASSISTANT_AGENT` is created. Joule will use this destination to send A2A `message/send` requests to the Cafe Assistant agent.

### 1.2 Create the Kitchen Manager Destination

> :arrow_forward: **Action:** Create a second destination with the following settings:

| Property | Value |
|---|---|
| Name | `KITCHEN_MANAGER_AGENT` |
| Type | HTTP |
| URL | `https://kitchen-manager-agent.cfapps.eu10-005.hana.ondemand.com` |
| Proxy Type | Internet |
| Authentication | NoAuthentication |

> :white_check_mark: **Result:** The destination `KITCHEN_MANAGER_AGENT` is created.

### 1.3 Create the Grievance Manager Destination

> :arrow_forward: **Action:** Create a third destination with the following settings:

| Property | Value |
|---|---|
| Name | `GRIEVANCE_MANAGER_AGENT` |
| Type | HTTP |
| URL | `https://grievance-manager-agent.cfapps.eu10-005.hana.ondemand.com` |
| Proxy Type | Internet |
| Authentication | NoAuthentication |

> :white_check_mark: **Result:** All three destinations are created. Update the URLs to match your actual CF deployment URLs from Exercise 10.

---

## Step 2: Create the Digital Assistant Manifest

The `da.sapdas.yaml` file is the top-level manifest that lists all capabilities. It tells Joule which capability folders to load.

### 2.1 Create `joule/da.sapdas.yaml`

> :arrow_forward: **Action:** Create the directory `joule/` at the project root and add the file `joule/da.sapdas.yaml` with the following content.

```yaml
schema_version: 1.4.0
name: cafe_multi_agent_assistant
capabilities:
  - type: local
    folder: ./cafe_assistant
  - type: local
    folder: ./kitchen_manager
  - type: local
    folder: ./grievance_manager
```

> :white_check_mark: **Result:** The DA manifest declares three capabilities, each in its own subfolder. The `type: local` means the capability YAML files are in local subdirectories relative to this file. The `name` uniquely identifies this digital assistant in Joule.

---

## Step 3: Create the Cafe Assistant Capability

Each capability requires three files: a capability definition, a scenario (intent matching), and a function (action execution).

### 3.1 Create `joule/cafe_assistant/capability.sapdas.yaml`

> :arrow_forward: **Action:** Create the file `joule/cafe_assistant/capability.sapdas.yaml` with the following content.

```yaml
schema_version: 3.28.0
namespace: joule.ext
name: cafe_assistant_capability
display_name: Cafe_Assistant
description: Cafe Assistant agent for the office cafeteria. Helps with ordering food and beverages, browsing the menu, getting dietary recommendations, and checking order status.
system_aliases:
  CAFE_ASSISTANT_AGENT:
    destination: CAFE_ASSISTANT_AGENT
```

> :white_check_mark: **Result:** Key fields explained:
>
> - **`namespace: joule.ext`** -- all custom Joule extensions use this namespace
> - **`name`** -- unique identifier for this capability within the namespace
> - **`display_name`** -- shown in the Joule UI when this capability is active
> - **`description`** -- used by Joule's intent matching to determine when to invoke this capability
> - **`system_aliases`** -- maps a logical alias name to a BTP Destination; the alias is referenced in the function YAML

### 3.2 Create `joule/cafe_assistant/scenarios/cafe_scenario.yaml`

The scenario file tells Joule WHEN to invoke this capability based on the user's intent.

> :arrow_forward: **Action:** Create the file `joule/cafe_assistant/scenarios/cafe_scenario.yaml` with the following content.

```yaml
description: >
  Use this capability when the user wants to interact with the office cafeteria menu,
  place food and beverage orders, check dietary options such as vegan, vegetarian, or
  gluten-free items, get meal recommendations based on preferences and budget, check
  order status, or cancel order items.
target:
  name: cafe_function
  type: function
```

> :white_check_mark: **Result:** The `description` is critical -- Joule uses it for intent matching. When a user says "Show me the menu" or "I'd like to order a coffee," Joule matches this description and routes to the `cafe_function` target. Write the description as if you are telling Joule "use this capability when..." followed by a comprehensive list of intents.

### 3.3 Create `joule/cafe_assistant/functions/cafe_function.yaml`

The function file tells Joule HOW to invoke the capability -- the sequence of actions to execute.

> :arrow_forward: **Action:** Create the file `joule/cafe_assistant/functions/cafe_function.yaml` with the following content.

```yaml
action_groups:
  - actions:
      - type: status-update
        message: Connecting to Cafe Assistant...
      - type: agent-request
        system_alias: CAFE_ASSISTANT_AGENT
        agent_type: remote
        result_variable: "apiResponse"
      - type: message
        message:
          type: text
          markdown: true
          content: "<? apiResponse.body.artifacts[0].parts[0].text ?>"
```

> :white_check_mark: **Result:** The function executes three actions in sequence:
>
> 1. **`status-update`** -- shows "Connecting to Cafe Assistant..." in the Joule chat while the request is in progress
> 2. **`agent-request`** -- sends an A2A `message/send` request to the agent via the `CAFE_ASSISTANT_AGENT` BTP Destination. The `agent_type: remote` tells Joule this is an external A2A agent. The response is stored in `apiResponse`.
> 3. **`message`** -- extracts the agent's text response from the A2A artifact (`apiResponse.body.artifacts[0].parts[0].text`) and displays it in the Joule chat with markdown rendering enabled.

---

## Step 4: Create the Kitchen Manager Capability

### 4.1 Create `joule/kitchen_manager/capability.sapdas.yaml`

> :arrow_forward: **Action:** Create the file with the following content.

```yaml
schema_version: 3.28.0
namespace: joule.ext
name: kitchen_manager_capability
display_name: Kitchen_Manager
description: Kitchen Manager agent for the office cafeteria. Handles stock and inventory management, checking stock levels, creating and fulfilling restock requests, and finding alternative items when stock is low.
system_aliases:
  KITCHEN_MANAGER_AGENT:
    destination: KITCHEN_MANAGER_AGENT
```

### 4.2 Create `joule/kitchen_manager/scenarios/kitchen_scenario.yaml`

> :arrow_forward: **Action:** Create the file with the following content.

```yaml
description: >
  Use this capability when the user wants to manage kitchen inventory and stock,
  check stock levels for specific items, view items that are running low on stock,
  create or fulfill restocking requests, or find alternative items to substitute
  for out-of-stock menu items.
target:
  name: kitchen_function
  type: function
```

### 4.3 Create `joule/kitchen_manager/functions/kitchen_function.yaml`

> :arrow_forward: **Action:** Create the file with the following content.

```yaml
action_groups:
  - actions:
      - type: status-update
        message: Connecting to Kitchen Manager...
      - type: agent-request
        system_alias: KITCHEN_MANAGER_AGENT
        agent_type: remote
        result_variable: "apiResponse"
      - type: message
        message:
          type: text
          markdown: true
          content: "<? apiResponse.body.artifacts[0].parts[0].text ?>"
```

> :white_check_mark: **Result:** The Kitchen Manager capability follows the same pattern. The scenario description focuses on inventory and stock management intents, so Joule routes questions like "What items are running low?" or "Create a restock request for coffee" to this capability.

---

## Step 5: Create the Grievance Manager Capability

### 5.1 Create `joule/grievance_manager/capability.sapdas.yaml`

> :arrow_forward: **Action:** Create the file with the following content.

```yaml
schema_version: 3.28.0
namespace: joule.ext
name: grievance_manager_capability
display_name: Grievance_Manager
description: Grievance Manager agent for the office cafeteria. Handles customer complaints and feedback, reviews open complaints, resolves issues with actionable resolutions, and generates empathetic responses to ensure customer satisfaction.
system_aliases:
  GRIEVANCE_MANAGER_AGENT:
    destination: GRIEVANCE_MANAGER_AGENT
```

### 5.2 Create `joule/grievance_manager/scenarios/grievance_scenario.yaml`

> :arrow_forward: **Action:** Create the file with the following content.

```yaml
description: >
  Use this capability when the user wants to submit customer feedback for an order,
  view details of existing feedback, review open and unresolved complaints, resolve
  a complaint with an actionable resolution, or generate an empathetic response to
  a customer complaint.
target:
  name: grievance_function
  type: function
```

### 5.3 Create `joule/grievance_manager/functions/grievance_function.yaml`

> :arrow_forward: **Action:** Create the file with the following content.

```yaml
action_groups:
  - actions:
      - type: status-update
        message: Connecting to Grievance Manager...
      - type: agent-request
        system_alias: GRIEVANCE_MANAGER_AGENT
        agent_type: remote
        result_variable: "apiResponse"
      - type: message
        message:
          type: text
          markdown: true
          content: "<? apiResponse.body.artifacts[0].parts[0].text ?>"
```

> :white_check_mark: **Result:** The Grievance Manager capability completes the set. All three capabilities follow the identical pattern: capability definition with system alias, scenario with intent description, and function with status-update + agent-request + message actions.

---

## Step 6: Verify the File Structure

> :arrow_forward: **Action:** Verify your `joule/` directory has the correct structure.

```
joule/
  da.sapdas.yaml
  cafe_assistant/
    capability.sapdas.yaml
    scenarios/
      cafe_scenario.yaml
    functions/
      cafe_function.yaml
  kitchen_manager/
    capability.sapdas.yaml
    scenarios/
      kitchen_scenario.yaml
    functions/
      kitchen_function.yaml
  grievance_manager/
    capability.sapdas.yaml
    scenarios/
      grievance_scenario.yaml
    functions/
      grievance_function.yaml
```

> :white_check_mark: **Result:** 10 YAML files total: 1 DA manifest + 3 capabilities x (1 capability + 1 scenario + 1 function).

---

## Step 7: Deploy to Joule

### 7.1 Install the Joule CLI

> :arrow_forward: **Action:** Install the Joule CLI if you have not already.

```bash
npm install -g @sap/joule-cli
```

> :white_check_mark: **Result:** The `joule` command is now available in your terminal.

### 7.2 Log in to Joule

> :arrow_forward: **Action:** Authenticate the CLI with your BTP subaccount.

```bash
joule login
```

Follow the browser-based authentication flow when prompted. Select the subaccount and landscape where your agents are deployed.

> :white_check_mark: **Result:** The CLI is authenticated and connected to your Joule instance.

### 7.3 Deploy the Configuration

> :arrow_forward: **Action:** Deploy the digital assistant configuration from the `joule/` directory.

```bash
cd joule
joule deploy
```

> :white_check_mark: **Result:** The CLI reads `da.sapdas.yaml`, discovers the three capability folders, validates all YAML files, and deploys them to Joule. You should see output similar to:
>
> ```
> Deploying digital assistant: cafe_multi_agent_assistant
>   Deploying capability: cafe_assistant_capability ... done
>   Deploying capability: kitchen_manager_capability ... done
>   Deploying capability: grievance_manager_capability ... done
> Deployment complete.
> ```

### 7.4 Verify the Deployment

> :arrow_forward: **Action:** List the deployed capabilities to confirm they are registered.

```bash
joule list capabilities
```

> :white_check_mark: **Result:** You should see all three capabilities listed with their display names: `Cafe_Assistant`, `Kitchen_Manager`, and `Grievance_Manager`.

---

## Step 8: Test in Joule

### 8.1 Open Joule

> :arrow_forward: **Action:** Open SAP Joule in your browser. You can access it from any SAP application that has Joule enabled, or via the SAP Build Lobby.

### 8.2 Test the Cafe Assistant

> :arrow_forward: **Action:** Type the following in the Joule chat:

```
What is on the cafeteria menu?
```

> :white_check_mark: **Result:** Joule matches the intent to `cafe_scenario.yaml`, shows "Connecting to Cafe Assistant...", sends an A2A request to your deployed Cafe Assistant agent, and displays the menu in the chat.

### 8.3 Test the Kitchen Manager

> :arrow_forward: **Action:** Type the following in the Joule chat:

```
Which items are running low on stock?
```

> :white_check_mark: **Result:** Joule routes to the Kitchen Manager capability. The agent calls `getLowStockItems()` via the CAP service and returns the low-stock items.

### 8.4 Test the Grievance Manager

> :arrow_forward: **Action:** Type the following in the Joule chat:

```
Show me all open customer complaints
```

> :white_check_mark: **Result:** Joule routes to the Grievance Manager capability. The agent calls `getOpenComplaints()` and returns the list of unresolved complaints.

### 8.5 Test Cross-Capability Routing

> :arrow_forward: **Action:** Try these additional prompts to verify Joule routes to the correct capability:

```
I'd like a Vegan Buddha Bowl and Sparkling Water
```
```
Create a restock request for coffee beans, 50 units, high urgency
```
```
The pasta I ordered was cold. I want to file a complaint.
```

> :white_check_mark: **Result:** Each prompt is routed to the correct capability based on the scenario descriptions. Joule's intent matching uses the `description` field in each scenario YAML to determine which capability handles the request.

---

## Verification

Before completing the workshop, verify that:

- [ ] All three BTP Destinations exist: `CAFE_ASSISTANT_AGENT`, `KITCHEN_MANAGER_AGENT`, `GRIEVANCE_MANAGER_AGENT`
- [ ] The `joule/` directory contains 10 YAML files (1 DA + 9 capability files)
- [ ] `joule deploy` completes without errors
- [ ] `joule list capabilities` shows all three capabilities
- [ ] Joule correctly routes menu/ordering questions to the Cafe Assistant
- [ ] Joule correctly routes stock/inventory questions to the Kitchen Manager
- [ ] Joule correctly routes complaint/feedback questions to the Grievance Manager
- [ ] The A2A agent responses are displayed in the Joule chat with markdown formatting

---

## Summary

Congratulations -- you have completed the full workshop!

Over the course of 11 exercises, you built a complete multi-agent system on SAP BTP:

| Exercise | What you built |
|---|---|
| **Ex 0-2** | Project setup, CDS data model, and OData service |
| **Ex 3-5** | CAP service actions with AI-powered recommendations |
| **Ex 6** | Three specialist agents with tool isolation |
| **Ex 7** | Supervisor orchestrator with LangGraph |
| **Ex 8** | Multi-agent testing scenarios and chat UI |
| **Ex 9** | Cloud Foundry deployment of the CAP service |
| **Ex 10** | A2A agent deployment -- three independent agents on CF |
| **Ex 11** | Joule integration -- connecting agents to SAP's AI copilot |

**Key architectural patterns:**

1. **CAP as the foundation** -- CDS models, OData services, and structured errors (`req.reject`) provide the data layer that agents call via HTTP tools
2. **Tool isolation** -- each specialist agent has access only to the tools relevant to its domain (cafe: 6 tools, kitchen: 5 tools, grievance: 5 tools)
3. **A2A protocol** -- open standard for agent discovery (Agent Cards), communication (Tasks), and lifecycle management (status-update, artifact-update)
4. **JWT forwarding** -- the `createXxxTools(capServiceUrl, authToken)` closure pattern passes authentication tokens from the A2A request to the CAP service
5. **Joule extensibility** -- YAML-based configuration connects any A2A agent to SAP's AI copilot via BTP Destinations and the agent-request action type

---

## Further Reading

- [Joule Documentation](https://help.sap.com/docs/joule) -- SAP Joule documentation including capability development guides
- [Joule Extensibility Guide](https://help.sap.com/docs/joule/joule-extensibility-guide) -- How to extend Joule with custom capabilities and functions
- [A2A Protocol](https://a2a-protocol.org/latest/) -- The open standard for agent-to-agent communication
- [SAP AI Core](https://help.sap.com/docs/sap-ai-core) -- SAP's AI platform for LLM access and orchestration
- [BTP Destinations](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/create-http-destinations) -- Configuring HTTP destinations for service connectivity
- [CAP Documentation](https://cap.cloud.sap/docs/) -- SAP Cloud Application Programming Model reference
