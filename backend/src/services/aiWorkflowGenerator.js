import { callGroq } from "./aiClient.js";

export async function generateAIWorkflows(parsedSiteData) {
  const prompt = `
You are FlowAI's intelligent workflow engine.\n
Given data about website pages, their detected intents, and interconnections,\n
generate realistic user workflows that represent actual navigation paths or goals.\n
Each workflow should include: a goal (e.g., purchase_product, authenticate_user),\n
ordered steps (page URL + action intent), and logical transitions.\n
Return strict JSON: {"workflows":[{"goal":"...","steps":[{"page":"...","action":"..."}]}]}. No prose.
`;

  const response = await callGroq(prompt, parsedSiteData);
  try {
    const parsed = JSON.parse(response);
    if (parsed && Array.isArray(parsed.workflows)) return parsed;
    return { workflows: [] };
  } catch {
    return { workflows: [] };
  }
}


