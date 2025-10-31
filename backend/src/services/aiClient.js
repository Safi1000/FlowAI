const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1";

export const MODEL_PRIORITY = [
  "models/gemini-2.5-pro",
  "models/gemini-2.5-flash",
  "models/gemini-2.0-flash-lite",
];

export async function callGemini(prompt, data = null) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const parts = [{ text: prompt }];
  if (data) {
    try {
      const text = JSON.stringify(data);
      parts.push({ text: text.length > 15000 ? text.slice(0, 15000) : text });
    } catch {
      parts.push({ text: String(data).slice(0, 15000) });
    }
  }

  const body = {
    contents: [
      {
        parts,
      },
    ],
  };

  const endpoint = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${GEMINI_API_KEY}`;

  let res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Fallback: if 404, retry with v1 and "-latest" model alias
  if (res.status === 404) {
    const altModel = GEMINI_MODEL.endsWith("-latest") ? GEMINI_MODEL : `${GEMINI_MODEL}-latest`;
    const altEndpoint = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(altModel)}:generateContent?key=${GEMINI_API_KEY}`;
    res = await fetch(altEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function callGeminiModel(model, prompt, data = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in .env file");
  }
  const parts = [{ text: prompt }];
  if (data) {
    try {
      const text = typeof data === "string" ? data : JSON.stringify(data);
      parts.push({ text: text.length > 20000 ? text.slice(0, 20000) : text });
    } catch {
      parts.push({ text: String(data).slice(0, 20000) });
    }
  }

  const startModel = model || "models/gemini-2.5-pro";
  const attempts = [startModel, ...MODEL_PRIORITY.filter((m) => m !== startModel)];

  const tryOnce = async (attemptModel) => {
    const apiModel = String(attemptModel).replace(/^models\//, "");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(apiModel)}:generateContent?key=${apiKey}`;
    console.log(`[FlowAI Gemini] Attempting model: ${attemptModel}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }] }),
        signal: controller.signal,
      });
      console.log(`[FlowAI Gemini] Response: ${res.status}`);
      if (!res.ok) {
        let bodyText = "";
        try { bodyText = await res.text(); } catch {}
        if (res.status === 401) {
          console.error("[FlowAI Gemini Error] Invalid or expired API key. Check your .env configuration and restart the server.");
          const err = new Error(`Gemini API error: ${res.status} ${bodyText}`);
          err.name = "GeminiAuthError";
          throw err;
        }
        if (res.status === 429 || /RESOURCE_EXHAUSTED/i.test(bodyText)) {
          const retryAfter = Number(res.headers.get("retry-after")) || 0;
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : 5000;
          console.warn(`[FlowAI Gemini] Response 429 — retrying with next model after ${waitMs}ms`);
          const err = new Error("GeminiQuotaExceeded");
          err.name = "GeminiQuotaExceeded";
          err.waitMs = waitMs;
          throw err;
        }
        const err = new Error(`Gemini API error: ${res.status} ${bodyText}`);
        err.name = "GeminiApiError";
        throw err;
      }
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new Error("Gemini returned an invalid or empty response");
      }
      console.log(`[FlowAI Gemini] Using ${attemptModel} — Request OK (200)`);
      console.log(`[FlowAI Gemini] Parsed decision: ${text.trim().toLowerCase().slice(0, 20)}`);
      return text;
    } finally {
      clearTimeout(timeout);
    }
  };

  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    const m = attempts[i];
    try {
      return await tryOnce(m);
    } catch (e) {
      lastErr = e;
      if (e?.name === "GeminiQuotaExceeded") {
        if (i < attempts.length - 1) {
          console.warn(`[FlowAI Gemini Fallback] Switched from ${attempts[i]} to ${attempts[i + 1]} (due to quota)`);
          const waitMs = Number(e?.waitMs) || 5000;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }
      // Non-quota errors: do not switch models
      break;
    }
  }
  throw new Error("All Gemini models exhausted");
}


