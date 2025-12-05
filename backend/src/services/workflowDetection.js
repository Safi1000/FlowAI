function summarizeIntents(elements = []) {
  const counts = new Map();
  for (const el of elements) {
    const intent = el?.intent;
    if (!intent) continue;
    counts.set(intent, (counts.get(intent) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => ({ intent, count }));
}

function summarizeForms(page = {}) {
  const forms = page?.summary?.forms ?? page?.forms ?? 0;
  const inputs = page?.summary?.inputs ?? 0;
  const buttons = page?.summary?.buttons?.length ?? page?.buttonsCount ?? 0;
  return { forms, inputs, buttons };
}

export function detectWorkflowsFromCrawl(crawlData) {
  const results = crawlData?.results || [];
  const nodes = [];
  const edges = [];
  const pageByUrl = new Map();

  for (const page of results) {
    const intents = summarizeIntents(page?.elements || []);
    const { forms, inputs, buttons } = summarizeForms(page);
    const node = {
      id: page.url,
      url: page.url,
      title: page.title || page.url,
      mode: page.finalMode || page.mode || "unknown",
      intents,
      linkCount: Array.isArray(page.links) ? page.links.length : 0,
      forms,
      inputs,
      buttons,
      textLength: page.totalTextLength || page.textLength || page?.summary?.totalText || 0,
    };
    nodes.push(node);
    pageByUrl.set(page.url, node);
  }

  for (const page of results) {
    const intents = summarizeIntents(page?.elements || []);
    const primaryIntent = intents[0]?.intent || "navigate";
    const links = Array.isArray(page.links) ? page.links : [];
    for (const link of links) {
      if (!link || !pageByUrl.has(link)) continue;
      const toNode = pageByUrl.get(link);
      edges.push({
        from: page.url,
        to: link,
        fromTitle: page.title || page.url,
        toTitle: toNode?.title || link,
        intent: primaryIntent,
        action: "navigate",
        reason: "link",
      });
    }
  }

  const adjacency = nodes.map((n) => ({
    id: n.id,
    out: edges.filter((e) => e.from === n.id).map((e) => ({ to: e.to, intent: e.intent, action: e.action })),
  }));

  return {
    totalPages: nodes.length,
    totalEdges: edges.length,
    nodes,
    edges,
    graph: adjacency,
    summary: {
      intentsSeen: Array.from(
        nodes.reduce((set, n) => {
          (n.intents || []).forEach((i) => set.add(i.intent));
          return set;
        }, new Set())
      ),
      formPages: nodes.filter((n) => (n.forms || 0) > 0).length,
    },
  };
}


