const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";

// Simple in-memory cache for form classification results
const formClassificationCache = new Map();

function buildMessages(prompt, data = null) {
  if (!data) return [{ role: "user", content: prompt }];
  let serialized = "";
  try {
    serialized = JSON.stringify(data);
  } catch {
    serialized = String(data);
  }
  if (serialized.length > 20000) serialized = serialized.slice(0, 20000);
  return [
    { role: "user", content: prompt },
    { role: "user", content: `Context:\n${serialized}` },
  ];
}

export async function callGroq(prompt, data = null) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set");
  }
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: buildMessages(prompt, data),
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch {}
    throw new Error(`Groq API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const message = json?.choices?.[0]?.message?.content;
  if (!message || typeof message !== "string") {
    throw new Error("Groq returned an invalid or empty response");
  }
  return message;
}

export async function callGroqModel(model, prompt, data = null) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in .env file");
  }

  const chosenModel = model || GROQ_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: buildMessages(prompt, data),
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let bodyText = "";
      try { bodyText = await res.text(); } catch {}
      const err = new Error(`Groq API error: ${res.status} ${bodyText}`);
      err.name = res.status === 401 ? "GroqAuthError" : "GroqApiError";
      throw err;
    }

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Groq returned an invalid or empty response");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Classify a form's intent using AI.
 * Returns "transactional" for forms like contact, signup, login, checkout, etc.
 * Returns "search_or_filter" for search bars, filters, sorting controls.
 * Returns "unknown" if uncertain (treated as transactional to avoid false negatives).
 *
 * @param {object} formMeta - Form metadata from crawler (inputs, buttons, text, action, method)
 * @returns {Promise<string>} - "transactional" | "search_or_filter" | "unknown"
 */
export async function classifyFormIntent(formMeta) {
  // Build a cache key from form metadata
  const cacheKey = JSON.stringify({
    inputs: (formMeta.inputs || []).map((i) => ({
      type: i.type,
      name: i.name,
      placeholder: i.placeholder,
      label: i.label,
    })),
    buttons: (formMeta.buttons || []).map((b) => ({ text: b.text, type: b.type })),
    text: (formMeta.text || "").slice(0, 200),
  });

  if (formClassificationCache.has(cacheKey)) {
    return formClassificationCache.get(cacheKey);
  }

  // If no API key, default to keeping forms (transactional)
  if (!GROQ_API_KEY) {
    console.log("[FlowAI] No GROQ_API_KEY, defaulting form to transactional");
    return "transactional";
  }

  // Build concise prompt
  const inputSummary = (formMeta.inputs || [])
    .slice(0, 10)
    .map((i) => {
      const parts = [i.type || "text"];
      if (i.name) parts.push(`name="${i.name}"`);
      if (i.placeholder) parts.push(`placeholder="${i.placeholder}"`);
      if (i.label) parts.push(`label="${i.label}"`);
      return parts.join(" ");
    })
    .join("; ");

  const buttonSummary = (formMeta.buttons || [])
    .slice(0, 5)
    .map((b) => b.text || b.type || "button")
    .join(", ");

  const textSnippet = (formMeta.text || "").slice(0, 300);

  const prompt = `You are classifying an HTML form's purpose.

Form inputs: ${inputSummary || "none"}
Buttons: ${buttonSummary || "none"}
Surrounding text snippet: ${textSnippet || "none"}

Classify this form into ONE category:
- "transactional" — Contact forms, signup, login, checkout, newsletter subscribe, feedback, registration, booking, order, apply, etc.
- "search_or_filter" — Site search bars, product filters, date pickers used purely for filtering, sorting controls.

Reply with ONLY one word: transactional OR search_or_filter`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 20,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`[FlowAI] Form classification API error ${res.status}, defaulting to transactional`);
      return "transactional";
    }

    const json = await res.json();
    const raw = (json?.choices?.[0]?.message?.content || "").toLowerCase().trim();

    let result = "transactional";
    if (raw.includes("search_or_filter") || raw === "search" || raw === "filter") {
      result = "search_or_filter";
    } else if (raw.includes("transactional")) {
      result = "transactional";
    } else {
      // Unknown response, keep the form
      result = "transactional";
    }

    formClassificationCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.log(`[FlowAI] Form classification error: ${err?.message}, defaulting to transactional`);
    return "transactional";
  }
}

