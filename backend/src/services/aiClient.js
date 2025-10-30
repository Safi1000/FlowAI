const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1";

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


