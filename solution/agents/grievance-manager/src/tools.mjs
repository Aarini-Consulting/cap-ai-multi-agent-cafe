import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveAuthHeaders } from "./auth.mjs";

export function createGrievanceTools(capServiceUrl, authToken) {
  async function get(path) {
    try {
      const headers = await resolveAuthHeaders(authToken);
      const res = await fetch(`${capServiceUrl}${path}`, { headers });
      const data = await res.json();
      if (!res.ok) return JSON.stringify({ error: data.error?.message || res.statusText });
      return JSON.stringify(data.value || data, null, 2);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  }

  async function post(path, body) {
    try {
      const headers = await resolveAuthHeaders(authToken);
      const res = await fetch(`${capServiceUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return JSON.stringify({ error: data.error?.code, message: data.error?.message });
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  }

  const submitFeedback = tool(
    async ({ orderId, rating, comment }) => post("/api/cafe/submitFeedback", { orderId, rating, comment }),
    { name: "submitFeedback", description: "Submit customer feedback for an order with a rating and comment", schema: z.object({ orderId: z.string(), rating: z.number().min(1).max(5), comment: z.string() }) }
  );

  const getFeedbackDetails = tool(
    async ({ feedbackId }) => get(`/api/cafe/getFeedbackDetails(feedbackId=${feedbackId})`),
    { name: "getFeedbackDetails", description: "Get the full details of a specific feedback entry", schema: z.object({ feedbackId: z.string() }) }
  );

  const getOpenComplaints = tool(
    async () => get("/api/cafe/getOpenComplaints()"),
    { name: "getOpenComplaints", description: "Get a list of all open and unresolved customer complaints", schema: z.object({}) }
  );

  const resolveComplaint = tool(
    async ({ feedbackId, resolution }) => post("/api/cafe/resolveComplaint", { feedbackId, resolution }),
    { name: "resolveComplaint", description: "Resolve a customer complaint by providing a resolution message", schema: z.object({ feedbackId: z.string(), resolution: z.string() }) }
  );

  const generateComplaintResponse = tool(
    async ({ feedbackId }) => post("/api/cafe/generateComplaintResponse", { feedbackId }),
    { name: "generateComplaintResponse", description: "Generate an AI-powered empathetic response for a customer complaint", schema: z.object({ feedbackId: z.string() }) }
  );

  return [submitFeedback, getFeedbackDetails, getOpenComplaints, resolveComplaint, generateComplaintResponse];
}
