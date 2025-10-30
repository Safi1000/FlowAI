import { chromium } from "playwright";
import axios from "axios";

function labelIntentFromElement(el) {
  const text = (el.text || "").toLowerCase();
  const placeholder = (el.placeholder || "").toLowerCase();
  const name = (el.name || "").toLowerCase();
  const type = (el.type || "").toLowerCase();
  const tag = (el.tag || "").toLowerCase();
  const href = (el.href || "").toLowerCase();

  if (/login|sign in/.test(text) || /login|signin/.test(href)) return "auth_login";
  if (/register|sign up/.test(text) || /signup|register/.test(href)) return "auth_signup";
  if (/logout|sign out/.test(text)) return "auth_logout";
  if (/search/.test(text) || /search/.test(placeholder) || (tag === "input" && type === "search")) return "search_input";
  if (/cart|buy|checkout|add to cart/.test(text) || /checkout|cart/.test(href)) return "purchase_action";
  if (/contact|support|help/.test(text)) return "contact_action";
  if (tag === "form" && (/login|sign in/.test(name + " " + placeholder + " " + text))) return "auth_login";
  if (tag === "button" && /submit|next|continue/.test(text)) return "submit_action";
  return undefined;
}

export async function intelligentParse(url, { browser } = {}) {
  let ownBrowser = null;
  try {
    if (!browser) {
      try {
        ownBrowser = await chromium.launch({ headless: true, channel: "msedge" });
      } catch {
        ownBrowser = await chromium.launch({ headless: true });
      }
      browser = ownBrowser;
    }

    const page = await browser.newPage();
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "media"].includes(type)) route.abort();
      else route.continue();
    });

    await Promise.race([
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Manual Timeout")), 15000)),
    ]);

    const result = await page.evaluate(() => {
      const extractData = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: el.innerText?.trim() || el.getAttribute('aria-label') || el.getAttribute('alt') || '',
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          href: el.getAttribute('href') || '',
          selector: el.outerHTML.slice(0, 100) + '...',
          isVisible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          parentTag: el.parentElement?.tagName?.toLowerCase() || ''
        };
      };

      const elements = [...document.querySelectorAll('a, button, input, form, select, textarea')].map(extractData);
      const links = [...document.querySelectorAll('a')].map(a => a.href);
      const buttons = [...document.querySelectorAll('button')].map(b => b.innerText.trim());
      const forms = document.querySelectorAll('form').length;
      const inputs = document.querySelectorAll('input').length;
      const totalText = document.body?.innerText?.length || 0;

      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        elements,
        links,
        summary: { links, buttons, forms, inputs, totalText },
      };
    });

    // Basic intent tagging
    result.elements = result.elements.map((el) => ({ ...el, intent: labelIntentFromElement(el) }));

    // Compare with static HTML to classify dynamic vs static-like
    let staticTextLength = 0;
    let staticHtml = "";
    try {
      const { data } = await axios.get(url, { timeout: 8000, headers: { "User-Agent": "FlowAI-HybridBot/1.0" } });
      staticHtml = data || "";
      staticTextLength = (staticHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "").length;
    } catch {}
    const hasSpaMarkers = /data-reactroot|__NEXT_DATA__|ng-version|id=\"app\"|id=\"root\"|__NUXT__|webpackJsonp|vite/i.test(staticHtml);

    const dynamicTotal = result?.summary?.totalText || 0;
    const isDynamic = hasSpaMarkers || dynamicTotal > staticTextLength * 1.2;

    return { url, mode: isDynamic ? "dynamic" : "static", ...result };
  } finally {
    if (ownBrowser) await ownBrowser.close();
  }
}


