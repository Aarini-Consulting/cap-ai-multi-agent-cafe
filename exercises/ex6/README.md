# Exercise 6 — Stream AI Responses from Your Service

In the previous exercises you built a complete, agent-ready CAP service with authentication, audit logging, and observability. But there is one more capability that modern AI-powered services need: **streaming**. When an AI generates a long response — a meal recommendation, an empathetic complaint response — the user should not have to wait for the entire response before seeing anything.

In this exercise you will add two streaming actions to your service using Server-Sent Events (SSE): one for the Cafe Assistant (`getRecommendation`) and one for the Grievance Manager (`generateComplaintResponse`).

---

## Overview

You will:

1. Understand why streaming matters for AI-powered services
2. Learn the SSE protocol format
3. Add `getRecommendation` and `generateComplaintResponse` actions to the service definition
4. Implement the streaming handlers using SSE
5. Test streaming with `curl`

---

## Step 1: Why Streaming Matters

When you call a standard REST endpoint, the server processes the entire request, builds the complete response, and sends it back in one piece. For simple database queries this is fine — the response is ready in milliseconds.

But AI-generated responses are different:

- **Token-by-token generation**: Large Language Models generate text one token at a time. A recommendation might take 3-5 seconds to generate fully.
- **Perceived performance**: If the user sees nothing for 5 seconds, it feels broken. If they see words appearing one by one, it feels responsive and engaging.
- **Early cancellation**: With streaming, the user can cancel mid-response if they already have what they need.

The standard protocol for streaming text from server to client over HTTP is **[Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)**. Unlike WebSockets, SSE is one-directional (server to client), uses plain HTTP, and works through proxies and load balancers without special configuration.

### The SSE Protocol

[Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) use a simple text-based protocol. Each event consists of one or more fields followed by a blank line:

```
event: chunk
data: {"content":"Based "}

event: chunk
data: {"content":"on "}

event: complete
data: {"message":"Recommendation complete"}

```

| Field | Purpose |
|---|---|
| `event:` | Names the event type. The client uses this to dispatch to different handlers. |
| `data:` | The payload. Can be any string, but JSON is conventional. |
| `\n\n` | A blank line terminates the event. The client will not process an event until it sees this. |

---

## Step 2: Add the Streaming Actions

Open `srv/cafe-service.cds` and add the following two actions. Add `getRecommendation` after the Cafe Assistant operations, and `generateComplaintResponse` after the Grievance Manager operations:

```cds
  // Add after cancelOrderItem, in the Cafe Assistant section:

  @description: 'Get an AI-powered meal recommendation. Streamed as Server-Sent Events.'
  action getRecommendation(
    @description: 'What you are in the mood for' preferences : String,
    @description: 'Maximum budget in EUR' budget : Decimal
  ) returns String;
```

```cds
  // Add after resolveComplaint, in the Grievance Manager section:

  @description: 'Generate an empathetic AI-powered response to a customer complaint. Streamed as Server-Sent Events.'
  action generateComplaintResponse(
    @description: 'UUID of the feedback to respond to' feedbackId : UUID
  ) returns String;
```

> **What's happening here?**
>
> Both actions are declared to `return String` in CDS, but the actual handlers will bypass the normal response mechanism and write directly to the HTTP response stream. CDS allows this — the handler has access to the raw Node.js response object via `req._.res`.

---

## Step 3: Implement the Streaming Handlers

Open `srv/cafe-service.js` and add the following two handlers.

### getRecommendation handler

Add this after the `cancelOrderItem` handler:

```javascript
  this.on('getRecommendation', async (req) => {
    const { preferences, budget } = req.data;
    const res = req._.res;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const sendEvent = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      const items = await SELECT.from(MenuItems).where({ available: true });
      const affordable = items.filter(i => i.price <= (budget || 999) && i.stockQuantity > 0);
      let matching = affordable;
      const keywords = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'];
      for (const kw of keywords) {
        if (preferences && preferences.toLowerCase().includes(kw.replace('_', ' '))) {
          matching = matching.filter(i => i.dietary && i.dietary.includes(kw));
        }
      }
      if (matching.length === 0) matching = affordable;

      sendEvent('start', { message: 'Analyzing your preferences...' });
      await new Promise(r => setTimeout(r, 300));

      const text = `Based on your preference for "${preferences}" with a budget of €${budget}, I'd recommend the ${matching[0]?.name || "Chef's Special"} (€${matching[0]?.price || '?'}). ${matching.length > 1 ? `You could also try the ${matching[1]?.name} (€${matching[1]?.price}).` : ''} We have ${matching[0]?.stockQuantity || 0} in stock, so plenty available!`;
      const words = text.split(' ');
      for (const word of words) {
        sendEvent('chunk', { content: word + ' ' });
        await new Promise(r => setTimeout(r, 60));
      }
      sendEvent('complete', { message: 'Done' });
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      res.end();
    }
    return 'Streaming complete';
  });
```

### generateComplaintResponse handler

Add this after the `resolveComplaint` handler:

```javascript
  this.on('generateComplaintResponse', async (req) => {
    const { feedbackId } = req.data;
    const res = req._.res;

    const feedback = await SELECT.one.from(CustomerFeedback, feedbackId, f => { f('*'), f.order(o => { o('*'), o.items(i => { i('*'), i.item(m => m('*')) }) }) });
    if (!feedback) return req.reject(404, 'FEEDBACK_NOT_FOUND', `Feedback not found: ${feedbackId}`);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const sendEvent = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

    try {
      sendEvent('start', { message: 'Preparing empathetic response...' });
      await new Promise(r => setTimeout(r, 300));

      const orderItems = feedback.order?.items?.map(i => i.item?.name).filter(Boolean).join(', ') || 'your order';
      const text = `Dear valued customer, I sincerely apologize for your experience with ${orderItems}. Your feedback — "${feedback.comment}" — is important to us and I completely understand your frustration. We take this very seriously. As a gesture of goodwill, we would like to offer you a complimentary replacement or a 50% discount on your next order. Our kitchen team has been notified and we are taking immediate steps to ensure this does not happen again. Thank you for bringing this to our attention, and we hope to serve you better next time.`;

      const words = text.split(' ');
      for (const word of words) {
        sendEvent('chunk', { content: word + ' ' });
        await new Promise(r => setTimeout(r, 60));
      }
      sendEvent('complete', { message: 'Response generated' });
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      res.end();
    }
    return 'Streaming complete';
  });
```

> **What's happening here?**
>
> **Accessing the raw response:**
> `req._.res` gives you the underlying Express `http.ServerResponse`. You can write directly to it, bypassing CDS's normal response handling.
>
> **Setting SSE headers:**
> `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive` tell the client this is a streaming connection.
>
> **The sendEvent helper:**
> Wraps the SSE wire format — each call writes one event with `event:` and `data:` fields followed by `\n\n`.
>
> **Simulated streaming:**
> Both handlers split text into words and send them one at a time with a 60ms delay. In production, you would replace this with a streaming call to SAP AI Core's Orchestration Service, forwarding each token as it arrives.
>
> **`generateComplaintResponse` loads context:**
> It fetches the feedback with the related order and items so the response can reference the specific dishes the customer ordered.

---

## Step 4: Test Streaming with curl

> **Windows users:** Use `curl.exe` instead of `curl` in PowerShell, or run from Git Bash.

Make sure `cds watch` is running.

### Test getRecommendation

```bash
curl -N -u cafe-user:initial -X POST http://localhost:4004/api/cafe/getRecommendation \
  -H "Content-Type: application/json" \
  -d '{"preferences": "something light and vegan", "budget": 15}'
```

The `-N` flag disables curl's output buffering so you see each SSE event as it arrives. You should see words appearing one at a time:

```
event: start
data: {"message":"Analyzing your preferences..."}

event: chunk
data: {"content":"Based "}

event: chunk
data: {"content":"on "}

...

event: complete
data: {"message":"Done"}
```

### Test generateComplaintResponse

Use one of the open complaint IDs from the seed data:

```bash
curl -N -u cafe-user:initial -X POST http://localhost:4004/api/cafe/generateComplaintResponse \
  -H "Content-Type: application/json" \
  -d '{"feedbackId": "c3000001-0000-0000-0000-000000000003"}'
```

You should see an empathetic response streamed word by word, referencing the specific order items (Pasta Carbonara).

---

## Summary

You added streaming capability to your CAP service:

- Added `getRecommendation` (Cafe Assistant) and `generateComplaintResponse` (Grievance Manager) as streaming actions
- Learned the SSE protocol format (`event:`, `data:`, `\n\n`)
- Accessed the raw HTTP response via `req._.res` to bypass CDS's normal response handling
- Tested the streaming output with `curl -N`

Your service now has everything an AI agent needs: discoverable metadata, structured operations, error handling, authentication, audit logging, observability, and streaming support.

---

## Further Reading

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) — the SSE protocol specification and browser API
- [CAP Service Handlers](https://cap.cloud.sap/docs/node.js/core-services#srv-on) — registering custom handlers that access the raw HTTP response
- [CAP Node.js Runtime](https://cap.cloud.sap/docs/node.js/) — understanding the CDS runtime and how it wraps Express
- [SAP AI Core Overview](https://help.sap.com/docs/sap-ai-core) — the production AI backend you would use for real streaming LLM calls

---

[Continue to Exercise 7 →](../ex7/README.md)
