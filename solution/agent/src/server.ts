import "dotenv/config";
import { createServer } from "http";
import { cafeOrchestrator } from "./orchestrator.js";

const PORT = parseInt(process.env.AGENT_PORT || "4005", 10);

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/cafe/invokeAgent") {
    let body = "";
    for await (const chunk of req) body += chunk;

    try {
      const { message } = JSON.parse(body);
      if (!message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing 'message' in request body" }));
        return;
      }

      console.log(`\n[Agent Server] Received: "${message}"`);

      const result = await cafeOrchestrator.invoke({ userMessage: message });

      console.log(`[Agent Server] Done (${result.iterationCount} iterations)`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        response: result.finalResponse,
        iterations: result.iterationCount,
        history: result.conversationHistory,
      }));
    } catch (err: any) {
      console.error(`[Agent Server] Error:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(`\nCafé Multi-Agent Server`);
  console.log(`=======================`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Endpoint: POST /api/cafe/invokeAgent`);
  console.log(`CAP service: ${process.env.CAP_SERVICE_URL || "http://localhost:4004"}`);
  console.log(`Ready!\n`);
});
