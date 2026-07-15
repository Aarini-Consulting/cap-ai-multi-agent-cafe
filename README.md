# AI-Ready CAP Multi-Agent Cafe Workshop

Build an AI-powered cafe ordering system from scratch using SAP CAP and LangChain. Start with a basic service, make it agent-ready, then extend into a multi-agent orchestration system with three specialist agents and a supervisor.

## What You'll Build

```
         +--- Cafe Assistant ---+
         |   (orders, menu)     |
         |                      |
START -> Orchestrator <---------+
         |                      |
         +-- Kitchen Manager ---+
         |   (stock, restock)
         |
         +-- Grievance Manager -+
         |   (complaints)
         |
         +-> END
```

## Exercises

| # | Exercise | What You'll Build |
|---|----------|-------------------|
| 0 | [Prerequisites & Setup](exercises/ex0/README.md) | Development environment, AI Core binding |
| 1 | [Build the Cafe Service](exercises/ex1/README.md) | CAP data model, seed data, OData service |
| 2 | [Agent-Ready Design](exercises/ex2/README.md) | @description annotations, functions, actions, structured errors |
| 3 | [Authorization & Authentication](exercises/ex3/README.md) | @requires, mocked auth, XSUAA, xs-security.json |
| 4 | [Audit Logging](exercises/ex4/README.md) | @cap-js/audit-logging, @PersonalData annotations, SecurityEvent logging |
| 5 | [Observability](exercises/ex5/README.md) | cds.log() structured loggers, request tracing, operation timing |
| 6 | [Specialist Agents](exercises/ex6/README.md) | 3 focused agents with grouped tools |
| 7 | [Supervisor Orchestrator](exercises/ex7/README.md) | LangGraph StateGraph with dynamic routing |
| 8 | [Test & Chat UI](exercises/ex8/README.md) | 4 test scenarios, React chat interface |
| 10 | [Deploy Agents to CF with A2A](exercises/ex10/README.md) | MTA deployment, agent URLs, HANA, XSUAA bindings |
| 11 | [Integrate into Joule](exercises/ex11/README.md) | Joule integration via SAP AI Core orchestration |

> **Demo UIs:** The repository includes three React applications (cafe-order, grievance-mgr, kitchen-mgr) as pre-built demo UIs for interacting with the specialist agents. These are not part of the exercises -- they are provided as ready-to-use frontends that the MTA deployment builds and serves automatically.

## Prerequisites

- Node.js >= 18
- SAP CAP CLI (`npm i -g @sap/cds-dk`)
- CF CLI
- SAP BTP subaccount with AI Core service instance

## Getting Started

See [Exercise 0](exercises/ex0/README.md) for setup instructions.

## Architecture

**CAP Service Foundation (Exercises 1-2):**
A CAP OData service with agent-ready @description annotations, CDS functions/actions, and structured error handling.

**Enterprise Features (Exercises 3-5):**
Authorization (@requires + XSUAA), audit logging (@cap-js/audit-logging + @PersonalData), and observability (cds.log + request tracing).

**Multi-Agent (Exercises 6-8):**
Three specialist agents (Cafe Assistant, Kitchen Manager, Grievance Manager) coordinated by a supervisor orchestrator that dynamically routes requests based on context.

**Deployment (Exercises 10-11):**
MTA deployment to Cloud Foundry with HANA, XSUAA, audit log service bindings, and A2A agent communication. Joule integration via SAP AI Core.

## Key Concepts

- **Agent-Ready APIs**: `@description` annotations make OData metadata self-documenting for AI agents
- **Structured Errors**: Error codes like `ITEM_OUT_OF_STOCK` drive agent routing decisions
- **Authorization**: `@requires: 'authenticated-user'` with mocked auth locally and XSUAA in production
- **Audit Logging**: `@PersonalData` annotations for automatic audit events, plus custom `SecurityEvent` logging for agent operations
- **Observability**: `cds.log()` structured loggers with UUID-based request tracing and operation timing
- **Tool Separation**: Each specialist gets only its domain's tools
- **Supervisor Pattern**: A [supervisor LLM](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/#supervisor) decides routing -- not a fixed pipeline
- **SAP AI Core**: All LLM calls route through SAP's [orchestration service](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/orchestration)

## Resources

### SAP CAP Documentation

- [CAP Getting Started](https://cap.cloud.sap/docs/get-started/) -- Setting up and building your first CAP project
- [CDS Schema & Data Modeling (CDL)](https://cap.cloud.sap/docs/cds/cdl) -- Entity definitions, associations, compositions, and typed elements
- [CDS Service Definitions](https://cap.cloud.sap/docs/cds/services) -- Functions, actions, and entity projections
- [CDS Annotations](https://cap.cloud.sap/docs/cds/annotations) -- `@description` and other annotations for metadata
- [CAP Node.js Service Implementation](https://cap.cloud.sap/docs/node.js/core-services) -- Registering handlers and the `this.on()` pattern
- [CAP Error Handling (req.reject)](https://cap.cloud.sap/docs/node.js/events#req-reject) -- Structured error responses with error codes
- [CAP Authentication](https://cap.cloud.sap/docs/node.js/authentication) -- `@requires`, mocked auth, XSUAA integration
- [CAP Audit Logging](https://cap.cloud.sap/docs/guides/data-privacy/audit-logging) -- `@PersonalData` annotations and audit event logging
- [CAP Structured Logging (cds.log)](https://cap.cloud.sap/docs/node.js/cds-log) -- Named loggers, log levels, and production integration

### SAP AI Core & AI SDK

- [SAP AI Core](https://help.sap.com/docs/sap-ai-core) -- Platform service for hosting and managing AI models
- [SAP AI SDK for JavaScript](https://github.com/SAP/ai-sdk-js) -- The `@sap-ai-sdk/langchain` package for LangChain integration
- [Orchestration Service](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/orchestration) -- Routing LLM calls through SAP AI Core

### LangChain & LangGraph

- [LangChain JS Introduction](https://js.langchain.com/docs/introduction) -- Foundation concepts for messages, tools, and chains
- [LangGraph JS](https://langchain-ai.github.io/langgraphjs/) -- Framework for building agent orchestration graphs
- [LangGraph StateGraph](https://langchain-ai.github.io/langgraphjs/concepts/low_level/#stategraph) -- Nodes, edges, conditional routing, and state management
- [ReAct Agent Pattern](https://js.langchain.com/docs/concepts/agents) -- How `createReactAgent` implements reasoning + acting
- [Multi-Agent Architectures](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/) -- Supervisor, hierarchical, and network patterns
- [Supervisor Pattern](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/#supervisor) -- Hub-and-spoke topology with a supervisor LLM

### UI

- [SAP UI5 Web Components](https://sap.github.io/ui5-webcomponents/) -- Component library used for the chat UI


AICORE_SERVICE_KEY='{"clientid": "sb-f9ffede1-83b8-4983-9db5-7c3f5bff59ab!b486317|aicore!b540","clientsecret": "7d12ff55-1a1a-4c56-bd35-9b3844766c63$737c7IY4L9hF_0m57R3emstZw2VTWoTqS0eX81uTuVg=","url": "https://aarini-pde-aws.authentication.eu10.hana.ondemand.com",    "identityzone": "aarini-pde-aws","identityzoneid": "f751c10a-9061-4cb7-9f41-c2549432e95e","appname": "f9ffede1-83b8-4983-9db5-7c3f5bff59ab!b486317|aicore!b540","credential-type": "binding-secret","serviceurls": {"AI_API_URL": "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com"},"token-type": ["xsuaa"]}'
