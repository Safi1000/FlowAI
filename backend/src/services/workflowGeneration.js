import { callGroq } from "./aiClient.js";

function buildCoverageWorkflows(nodes, edges) {
  const workflows = [];
  const maxEdgeWorkflows = 30;

  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }

  const visited = new Set();
  const order = [];
  const queue = [];
  const start = nodes[0]?.id || nodes[0]?.url;
  if (start) queue.push(start);
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    order.push(current);
    const next = adjacency.get(current) || [];
    for (const n of next) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  for (const n of nodes) {
    const id = n.id || n.url;
    if (id && !visited.has(id)) order.push(id);
  }

  workflows.push({
    id: "coverage_all_pages",
    goal: "cover_all_detected_pages",
    steps: order.map((p) => ({ page: p, action: "visit" })),
  });

  for (const edge of edges.slice(0, maxEdgeWorkflows)) {
    workflows.push({
      id: `${edge.from}->${edge.to}`,
      goal: edge.intent || "navigation",
      steps: [
        { page: edge.from, action: "visit" },
        { page: edge.to, action: edge.intent || "navigate" },
      ],
    });
  }

  return workflows;
}

async function generateAiWorkflows(detection) {
  const nodes = detection?.nodes || [];
  const edges = detection?.edges || [];
  const graph = detection?.graph || [];
  const summary = detection?.summary || {};
  const payload = {
    nodes: nodes.slice(0, 60).map((n) => ({
      id: n.id,
      title: n.title,
      intents: n.intents,
      forms: n.forms,
      inputs: n.inputs,
      buttons: n.buttons,
      mode: n.mode,
      linkCount: n.linkCount,
    })),
    edges: edges.slice(0, 120).map((e) => ({
      from: e.from,
      to: e.to,
      intent: e.intent,
      action: e.action,
    })),
    graph: graph.slice(0, 120),
    summary,
  };

  const prompt = `
You are FlowAI. Given website detection data (nodes with intents/forms/inputs/buttons/mode and edges with actions), propose realistic multi-step workflows without hardcoding rules.
- Cover diverse goals: auth (login/signup), form submission (if forms/inputs exist), search navigation, add-to-cart -> checkout, and general navigation.
- Prefer 3-8 steps when possible; avoid duplicates.
- If a page has forms/inputs, include at least one form submission workflow that uses that page.
Return ONLY strict JSON (no prose): {"workflows":[{"id":"string","goal":"string","steps":[{"page":"url","action":"string","note":"optional"}]}]}
Keep ids stable (use page URLs or derived ids).`;

  try {
    const text = await callGroq(prompt, payload);
    const parseJsonSafe = (t) => {
      try {
        return JSON.parse(t);
      } catch {
        try {
          const match = t.match(/{[\s\S]*}/);
          if (match) return JSON.parse(match[0]);
        } catch {}
      }
      return null;
    };
    const parsed = parseJsonSafe(text);
    if (parsed && Array.isArray(parsed.workflows)) return parsed.workflows;
    console.warn("[FlowAI Groq] Falling back to empty AI workflows; response was not valid JSON");
  } catch (e) {
    console.error("[FlowAI Groq] AI workflow generation failed", e?.message || e);
  }
  return [];
}

export async function generateWorkflowsFromDetection(detection) {
  const nodes = detection?.nodes || [];
  const edges = detection?.edges || [];
  if (!nodes.length) {
    return { workflows: [] };
  }

  const coverage = buildCoverageWorkflows(nodes, edges);
  const aiWorkflows = await generateAiWorkflows(detection);

  const combined = [...coverage, ...aiWorkflows];
  return { total: combined.length, workflows: combined };
}


