function classifyPageCategory(title = "", url = "") {
  const t = (title + " " + url).toLowerCase();
  if (/(^|\/)login(\/|$)/.test(url) || /login|sign in/.test(t)) return "login";
  if (/(^|\/)signup|register(\/|$)/.test(url) || /signup|register|sign up/.test(t)) return "signup";
  if (/(^|\/)checkout(\/|$)/.test(url) || /checkout|cart|payment/.test(t)) return "checkout";
  if (/(^|\/)dashboard(\/|$)/.test(url) || /dashboard|account/.test(t)) return "dashboard";
  if (/search|results/.test(t)) return "results_page";
  if (/product/.test(t)) return "product_page";
  if (/contact|support/.test(t)) return "support";
  if (/about/.test(t)) return "about";
  if (/home|welcome|index/.test(t)) return "home";
  return "page";
}

export function generateAdaptiveWorkflows(parsedSiteData) {
  const pages = parsedSiteData?.results || [];
  const pageByUrl = new Map();
  for (const p of pages) pageByUrl.set(p.url, p);

  const intentTargets = {
    auth_login: ["dashboard", "home"],
    auth_signup: ["dashboard", "home"],
    search_input: ["results_page", "product_page"],
    purchase_action: ["checkout"],
    contact_action: ["support"],
    submit_action: ["page"],
    default: ["home", "about", "page"],
  };

  const pageCategory = (p) => classifyPageCategory(p?.title, p?.url);

  const workflows = [];
  const edges = new Map();

  const addEdge = (from, to, intent, reason) => {
    const key = `${from}__${intent}__${to}`;
    if (edges.has(key)) return;
    edges.set(key, { from, to, intent, action: "navigate", reason });
  };

  for (const page of pages) {
    const intents = (page?.elements || [])
      .map((e) => e.intent)
      .filter(Boolean);
    const pCat = pageCategory(page);

    if (intents.length === 0) intents.push("default");

    for (const intent of intents) {
      const targetCats = intentTargets[intent] || intentTargets.default;

      // Prefer linked pages from this page
      const linked = new Set((page.links || []).filter((u) => pageByUrl.has(u)));
      for (const link of linked) {
        const targetPage = pageByUrl.get(link);
        const tCat = pageCategory(targetPage);
        if (targetCats.includes(tCat) && page.url !== link) {
          addEdge(page.url, link, intent, `Linked to ${tCat}`);
        }
      }

      // If none linked, connect to best matching pages globally (limit to a few)
      let added = 0;
      if (![...edges.values()].some((e) => e.from === page.url && e.intent === intent)) {
        for (const candidate of pages) {
          if (candidate.url === page.url) continue;
          const tCat = pageCategory(candidate);
          if (targetCats.includes(tCat)) {
            addEdge(page.url, candidate.url, intent, `Inferred ${intent} → ${tCat}`);
            added += 1;
            if (added >= 3) break;
          }
        }
      }
    }
  }

  const nodes = pages.map((p) => ({ id: p.url, title: p.title || p.url, type: pageCategory(p) }));
  const edgesArr = Array.from(edges.values());

  for (const e of edgesArr) {
    workflows.push({ from: e.from, to: e.to, intent: e.intent, action: e.action, reason: e.reason });
  }

  return { totalWorkflows: workflows.length, nodes, edges: edgesArr, workflows };
}


