/**
 * /api/claude.js
 * Vercel Serverless Function — secure Anthropic API proxy
 *
 * - Keeps ANTHROPIC_API_KEY on the server, never exposed to the browser
 * - Accepts POST { prompt: string }
 * - Returns { text: string }
 *
 * Set ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables
 */

export const maxDuration = 60; // allow up to 60s for AI response

export default async function handler(req, res) {
  // ── CORS headers (allow your Vercel domain) ──────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate request body
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid prompt" });
  }

  // Validate API key exists
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY not configured. Add it in Vercel → Settings → Environment Variables.",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Anthropic API error",
        detail: data,
      });
    }

    if (!data.content || !Array.isArray(data.content)) {
      return res.status(500).json({ error: "Unexpected Anthropic response shape", detail: data });
    }

    const text = data.content.map((b) => b.text || "").join("").trim();
    return res.status(200).json({ text });

  } catch (err) {
    console.error("Anthropic proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
