const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";

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

