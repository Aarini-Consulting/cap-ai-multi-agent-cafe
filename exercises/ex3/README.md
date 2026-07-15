# Exercise 3: Authorization & Authentication

## Overview

In Exercise 0, the starter project was configured with mocked authentication for local development — a test user `cafe-user` with password `initial`. In Exercise 2, all curl commands used `-u cafe-user:initial` to authenticate. But the CAP service itself does not *enforce* authentication yet. If you remove the `-u` flag from a curl command, the request still succeeds — CAP accepts anonymous requests by default.

In this exercise, you will lock down the service so that **only authenticated users and agents can access it**. You will also prepare the security configuration for production deployment on SAP BTP.

**What you will learn:**

- How CAP's `@requires` annotation gates access at the service level
- How to add production dependencies for JWT validation
- How to create an XSUAA security descriptor for SAP BTP deployment
- How authentication propagates to AI agents that call service operations

**References:**

- [CAP Authentication](https://cap.cloud.sap/docs/node.js/authentication)
- [CAP XSUAA Integration](https://cap.cloud.sap/docs/node.js/authentication#xsuaa)
- [OWASP Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)

---

## Step 1: The Problem — No Enforcement

Start `cds watch` and try accessing the menu **without credentials**:

```bash
curl http://localhost:4004/api/cafe/Menu
```

You get a 200 OK with the full menu — no credentials required. Even though the `package.json` defines a mocked user, CAP does not reject anonymous requests unless the service explicitly requires authentication. Now consider what is exposed without any access control:

- `POST /api/cafe/placeOrder` — anyone can place orders
- `POST /api/cafe/createRestockRequest` — anyone can tamper with stock
- `GET /api/cafe/getOpenComplaints()` — anyone can read customer complaints

> **Why this matters for AI agents:** When you later expose these operations as agent tools, the agent will call them on behalf of a user. Without authentication enforcement, there is no way to know *who* the agent is acting for, and no way to enforce per-user permissions.

---

## Step 2: Add the `@requires` Annotation

The simplest way to gate access in CAP is the [`@requires` annotation](https://cap.cloud.sap/docs/guides/security/authorization) on the service definition. This tells the CDS runtime to reject any request that does not come from an authenticated user.

&#9654; Open `srv/cafe-service.cds` and add `@requires: 'authenticated-user'` after the `@path` annotation:

```cds
@description: 'Cafe service with stock management and customer feedback. Supports multi-agent orchestration: Cafe Assistant handles orders, Kitchen Manager handles restocking, Grievance Manager handles complaints.'
@path: '/api/cafe'
@requires: 'authenticated-user'
service CafeService {

  // ... all entity projections and operations remain unchanged ...

}
```

That single line is the only change to the service definition. The CDS runtime now checks every incoming request for a valid authentication token before any handler code runs.

> **Important:** If `cds watch` is running, it will auto-reload when you save the file. If it does not, stop and restart `cds watch` to pick up the change.

> **How it works under the hood:** CAP's authentication middleware inspects the incoming request for credentials (basic auth in development, JWT in production). If the user does not have the required role (`authenticated-user`), the framework returns an error *before* your handler code executes. You do not need to add manual checks in `cafe-service.js`.

---

## Step 3: Add Production Dependencies

For production deployment on SAP BTP, CAP uses XSUAA (SAP Authorization and Trust Management Service) to validate JWT tokens. This requires two additional dependencies.

&#9654; Install the production security dependencies:

```bash
npm install @sap/xssec passport
```

| Dependency | Purpose |
|---|---|
| `@sap/xssec` | SAP security library for JWT token validation |
| `passport` | HTTP authentication middleware used by CAP with XSUAA |

Your `package.json` already has `[development]` and `[production]` profiles configured from the starter project. The `[development]` profile uses mocked auth with the `cafe-user` test user. The `[production]` profile specifies `"auth": "xsuaa"` — these new dependencies provide the runtime libraries CAP needs to make that work.

---

## Step 4: Create xs-security.json

For XSUAA to work on SAP BTP, you need a security descriptor that defines the scopes and role templates for your application.

&#9654; Create a file `xs-security.json` in the project root: `my-cafe`

```json
{
  "scopes": [
    {
      "name": "$XSAPPNAME.cafe-user",
      "description": "Cafe user — can browse menu, place orders, and interact with the AI agent"
    }
  ],
  "attributes": [],
  "role-templates": [
    {
      "name": "CafeUser",
      "description": "Cafe user with access to menu, ordering, and AI agent",
      "scope-references": [
        "$XSAPPNAME.cafe-user"
      ],
      "attribute-references": []
    },
    {
      "name": "Token_Exchange",
      "description": "UAA token exchange for SAML authentication",
      "scope-references": [
        "uaa.user"
      ]
    }
  ],
  "role-collections": [
    {
      "name": "CafeUser",
      "description": "Cafe user — browse menu, place orders, chat with AI agent",
      "role-template-references": [
        "$XSAPPNAME.CafeUser"
      ]
    }
  ]
}
```

> **What's happening here?**
>
> - `$XSAPPNAME` is a placeholder that XSUAA replaces with your application's unique name at deployment time
> - The `cafe-user` scope is a custom permission for cafe operations
> - The `CafeUser` role template groups this scope into an assignable role
> - The `Token_Exchange` role template enables SAML-to-JWT token exchange for browser-based SSO
> - The `role-collections` section pre-creates a role collection that BTP admins can assign to users

---

## Step 5: Test Authentication

&#9654; Restart the server to pick up the changes:

```bash
cds watch
```

You should see authentication-related output in the startup logs:

```
[cds] - using auth strategy {
  kind: 'mocked',
  impl: 'node_modules/@sap/cds/lib/srv/middlewares/auth/basic-auth.js'
}
```

This confirms CAP loaded the mocked auth configuration.

> **Windows users:** In PowerShell, `curl` is an alias for `Invoke-WebRequest`, which behaves differently. Use `curl.exe` (with `.exe`) instead, or run the commands from **Git Bash** or **WSL**.

&#9654; Try accessing the menu **without credentials**:

```bash
curl -i http://localhost:4004/api/cafe/Menu
```

&#9989; **Result:** You get HTTP **401 Unauthorized**. The service is now locked.

```
HTTP/1.1 401 Unauthorized
```

&#9654; Now try **with credentials** using HTTP Basic Auth:

```bash
curl -u cafe-user:initial http://localhost:4004/api/cafe/Menu
```

&#9989; **Result:** You get HTTP **200 OK** with the full menu data. The mocked user `cafe-user` has the `authenticated-user` role, so the `@requires` check passes.

&#9654; Verify that other operations also require auth:

```bash
# Without credentials -- 401
curl -i "http://localhost:4004/api/cafe/getLowStockItems()"

# With credentials -- 200
curl -u cafe-user:initial "http://localhost:4004/api/cafe/getLowStockItems()"
```

&#9989; **Result:** All operations are gated. The `@requires` annotation on the service definition applies to every entity, function, and action within it.

> **Browser behavior:** When you open the CDS service index page (`http://localhost:4004`) in a browser, CAP's mocked auth pops up a basic login dialog. Enter `cafe-user` / `initial` and the browser will send credentials automatically on subsequent requests.

---

## Verification Checklist

Confirm the following before moving on:

- [ ] `srv/cafe-service.cds` has `@requires: 'authenticated-user'` on the service definition
- [ ] `@sap/xssec` and `passport` are installed as production dependencies
- [ ] `xs-security.json` exists with `cafe-user` scope, `CafeUser` role template, and role collection
- [ ] `curl http://localhost:4004/api/cafe/Menu` returns **401 Unauthorized**
- [ ] `curl -u cafe-user:initial http://localhost:4004/api/cafe/Menu` returns **200 OK** with menu items
- [ ] CDS startup logs show `using auth strategy`

---

## Key Insight: Authentication and AI Agents

When you build the AI agent, it will call service operations like `placeOrder` and `getLowStockItems`. How does the agent authenticate?

**In local development**, the orchestrator runs inside the CDS server process. The agent tools call service operations via internal CDS APIs, and the calling user's context (from HTTP Basic Auth) is automatically propagated. No separate credentials are needed.

**In production on Cloud Foundry**, the specialist agents (Cafe Assistant, Kitchen Manager, Grievance Manager) run as separate applications that communicate via the A2A protocol over HTTP. In this case:

- The CAP server forwards the user's JWT `authorization` header to the orchestrator
- The orchestrator passes this token to specialist agents via A2A HTTP calls
- Each specialist agent validates the token against the same XSUAA instance
- All audit logs correctly attribute actions to the original user

This means the same `@requires: 'authenticated-user'` annotation protects the service whether agents call it locally or remotely — the authentication mechanism changes, but the authorization model stays the same.

---

## Further Reading

- [CAP Node.js Authentication](https://cap.cloud.sap/docs/node.js/authentication) — full guide to CAP authentication strategies
- [CAP XSUAA Integration](https://cap.cloud.sap/docs/node.js/authentication#xsuaa) — production JWT authentication with SAP BTP
- [OWASP Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/) — why access control is the #1 web security risk
- [CAP Authorization & Roles](https://cap.cloud.sap/docs/guides/security/authorization) — fine-grained role-based access beyond `@requires`

---

## Summary

You secured the cafe service with:

- A single CDS annotation (`@requires: 'authenticated-user'`) on the service definition
- `@sap/xssec` and `passport` as production dependencies for JWT validation
- An `xs-security.json` descriptor defining scopes, role templates, and role collections

No handler code was changed. The CDS runtime enforces authentication before your business logic runs. The `[development]` and `[production]` profiles in `package.json` (configured in Exercise 0) ensure mocked auth locally and XSUAA in production — same codebase, different behavior.

Continue to [Exercise 4: Audit Logging](../ex4/README.md).
