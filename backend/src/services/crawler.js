import { chromium } from "playwright";
import { intelligentParse } from "./intelligentParser.js";

function normalizeUrl(link, base) {
  try {
    if (!link) return null;
    if (link.startsWith("mailto:") || link.startsWith("tel:")) return null;
    const u = new URL(link, base);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

// Removed legacy crawlWebsite. Using intelligent-only crawler below.

export async function crawlWebsiteIntelligent(startUrl, maxDepth = 3, maxPages = 50, { delayMs = 200 } = {}) {
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const results = [];
  const startHost = new URL(startUrl).hostname;
  let browser = null;
  try {
    try {
      browser = await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      browser = await chromium.launch({ headless: true });
    }

    while (queue.length > 0 && results.length < maxPages) {
      const { url, depth } = queue.shift();
      if (!url) continue;
      if (visited.has(url)) continue;
      if (depth > maxDepth) continue;

      visited.add(url);

      const parsed = await intelligentParse(url, { browser });
      results.push(parsed);

      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      const links = parsed?.links || [];
      for (const link of links) {
        try {
          const u = new URL(link, url);
          u.hash = "";
          const normalized = u.toString();
          if (new URL(normalized).hostname !== startHost) continue;
          if (visited.has(normalized)) continue;
          queue.push({ url: normalized, depth: depth + 1 });
        } catch {}
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  const dynamicCount = results.filter((p) => p?.mode === "dynamic").length;
  const staticCount = results.length - dynamicCount;
  return { startUrl, totalPages: results.length, staticCount, dynamicCount, results };
}


