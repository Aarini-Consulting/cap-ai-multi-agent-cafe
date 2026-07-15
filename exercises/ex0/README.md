# Exercise 0 — Prerequisites & Setup

In this exercise, you'll set up your development environment and configure connectivity to SAP AI Core.

---

## Prerequisites

Before starting this workshop, ensure you have:

- **Node.js** >= 18 ([download](https://nodejs.org/))
- **SAP CAP CLI** (`@sap/cds-dk`): `npm i -g @sap/cds-dk` — see [CAP Getting Started](https://cap.cloud.sap/docs/get-started/)
- **CF CLI** ([install guide](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html))
- **SAP BTP subaccount** with an **AI Core** service instance named `agent-ai` — see [SAP AI Core documentation](https://help.sap.com/docs/sap-ai-core). For this exercise, we will provide you with the service key.

---

## Step 1: Clone the Repository

Clone this repository and navigate to the workshop folder:

```bash
git clone https://github.com/Aarini-Consulting/cap-ai-multi-agent-cafe.git
cd cap-ai-multi-agent-cafe/my-cafe
```

Install the node modules.

```bash
npm install
```

---

## Step 2: Start the CAP Server

Start the CAP server:

```bash
cds watch
```

You should see:

```
[cds] - server listening on { url: 'http://localhost:4004' }
```

> **Note:** The server won't have any services yet — that's what we'll build in Exercise 1.

> **Note:** Common errors during `cds watch` — the `better-sqlite3` module could not locate native bindings. Should you face this problem, do the following:
>
> 1. Try rebuilding the project with `npm rebuild better-sqlite3`
> 2. If that did not work, remove `node_modules` and `package-lock.json` and run `npm install` again.
> 3. Check for scripts that are blocked: `npm install-scripts ls`
> 4. If `better-sqlite3` script needs permission, approve by running: `npm install-scripts approve better-sqlite3`
> 5. Then rebuild again with: `npm rebuild better-sqlite3`
> 6. Start `cds watch` to verify the error is resolved.

---

## Summary

Your environment is ready:

- Node.js and CAP CLI installed
- CAP server starts successfully

---

## Further Reading

- [CAP Getting Started Guide](https://cap.cloud.sap/docs/get-started/) — installation, project setup, and first steps with CAP
- [SAP AI Core Overview](https://help.sap.com/docs/sap-ai-core) — service provisioning, resource groups, and AI model deployment
- [CAP Node.js Runtime](https://cap.cloud.sap/docs/node.js/) — how the CAP server works under the hood

---

[Continue to Exercise 1 →](../ex1/README.md)
