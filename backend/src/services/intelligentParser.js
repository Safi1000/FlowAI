import { chromium } from "playwright";
import axios from "axios";
import * as cheerio from "cheerio";
import { callGroqModel } from "./aiClient.js";

const groqDecisionCache = new Map();
let groqCallsInFlight = 0;
const maxGroqConcurrency = Number(process.env.GROQ_MAX_CONCURRENCY || 3);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function withGroqLimit(fn) {
  while (groqCallsInFlight >= maxGroqConcurrency) await wait(50);
  groqCallsInFlight += 1;
  try {
    return await fn();
  } finally {
    groqCallsInFlight -= 1;
  }
}
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h &= 0xffffffff;
  }
  return (h >>> 0).toString(36);
}

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

function classifyScriptBySrc(src = "") {
  const u = (src || "").toLowerCase();
  if (/googletagmanager|gtag|google-analytics|analytics\.js|ga\.|hotjar|meta\.com|facebook\.net|fbq|clarity|segment|mixpanel/.test(u)) return "analytics";
  if (/cdn.jsdelivr|cdnjs.cloudflare|unpkg|bootstrap|tailwind|fontawesome|polyfill/.test(u)) return "library";
  if (/lottie|aos|anime|gsap|scrollreveal|swiper/.test(u)) return "animation";
  return null;
}

function classifyScriptByCode(code = "") {
  const c = (code || "").toLowerCase();
  if (/fetch\s*\(|xmlhttprequest|axios\.|new\s+websocket|navigator\.sendbeacon/.test(c)) return "network";
  if (/innerhtml\s*=|appendchild\s*\(|replacechild\s*\(|insertadjacenthtml\s*\(|mutationobserver/.test(c)) return "dom-mutation";
  if (/__next_data__|self\.__next_f|__nuxt__|data-reactroot|id="root"|id="app"|vite/.test(c)) return "framework-bootstrap";
  if (/opacity|transform|animation|transition|classlist\.(add|remove)/.test(c)) return "animation";
  if (/gtag\(|fbq\(|hotjar|mixpanel|segment/.test(c)) return "analytics";
  if (/config|settings|env|json/.test(c)) return "config";
  return "other";
}

async function analyzeScripts(html = "", baseUrl = "") {
  const $ = cheerio.load(html || "");
  const scripts = [];
  const externalFetches = [];
  const base = (() => { try { return new URL(baseUrl); } catch { return null; } })();
  const endpoints = new Set();
  $("script").each((_, el) => {
    const src = $(el).attr("src") || "";
    const inline = src ? "" : ($(el).html() || "");
    const entry = { src, inlineSnippet: (inline || "").slice(0, 400), labels: new Set() };
    const srcLabel = classifyScriptBySrc(src);
    if (srcLabel) entry.labels.add(srcLabel);
    if (inline) {
      entry.labels.add(classifyScriptByCode(inline));
      try {
        const m = inline.match(/https?:\/\/[\w.-]+(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=%]*)?/gi) || [];
        m.forEach((u) => endpoints.add(u));
        const rel = inline.match(/\/(?:api|v1|v2|graphql|auth)\/[A-Za-z0-9_\-/.]+/gi) || [];
        rel.forEach((p) => { try { const u = base ? new URL(p, baseUrl).toString() : p; endpoints.add(u); } catch {} });
      } catch {}
    }
    scripts.push(entry);
    // Schedule external same-origin small fetch for deeper inspection
    if (src && base) {
      try {
        const u = new URL(src, base);
        if (u.origin === base.origin) externalFetches.push(u.toString());
      } catch {}
    }
  });

  // Limit external script inspections to 3, 50KB, 2s timeout each
  const toFetch = externalFetches.slice(0, 3);
  for (const url of toFetch) {
    try {
      const res = await axios.get(url, { timeout: 2000, responseType: "text" });
      let code = String(res.data || "");
      if (code.length > 50000) code = code.slice(0, 50000);
      const label = classifyScriptByCode(code);
      const idx = scripts.findIndex((s) => s.src && new URL(s.src, baseUrl).toString() === url);
      if (idx >= 0) scripts[idx].labels.add(label);
    } catch {}
  }

  // Summarize
  let networkCount = 0;
  let domMutationCount = 0;
  let analyticsCount = 0;
  let animationCount = 0;
  let frameworkBootstrap = false;
  for (const s of scripts) {
    if (s.labels.has("network")) networkCount += 1;
    if (s.labels.has("dom-mutation")) domMutationCount += 1;
    if (s.labels.has("analytics")) analyticsCount += 1;
    if (s.labels.has("animation")) animationCount += 1;
    if (s.labels.has("framework-bootstrap")) frameworkBootstrap = true;
  }

  const items = scripts.map((s) => ({
    name: s.src ? (s.src.split("/").pop() || s.src) : "inline-script",
    src: s.src || null,
    note: s.inlineSnippet,
    roles: Array.from(s.labels),
  }));

  return {
    items,
    metrics: { networkCount, domMutationCount, analyticsCount, animationCount, frameworkBootstrap, totalScripts: scripts.length, endpoints: Array.from(endpoints).slice(0, 10) },
  };
}

export async function intelligentParse(url, { browser, domainSeenModes } = {}) {
  let ownBrowser = null;
  try {
    // 1) Fetch static HTML first and compute metrics + heuristics
    let staticHtml = "";
    let axiosOk = false;
    try {
      const { data } = await axios.get(url, { timeout: 8000, headers: { "User-Agent": "FlowAI-HybridBot/1.0" } });
      staticHtml = data || "";
      axiosOk = !!staticHtml;
    } catch {}

    const stripTags = (html) => (html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    const staticTextOnly = stripTags(staticHtml);
    const staticTextLength = staticTextOnly.length;
    const scriptCountStatic = (staticHtml.match(/<script\b/gi) || []).length;
    const hasSpaMarkersStatic = /data-reactroot|__NEXT_DATA__|ng-version|id=\"app\"|id=\"root\"|__NUXT__|webpackJsonp|vite/i.test(staticHtml);
    const scriptAnalysis = await analyzeScripts(staticHtml, url);
    // Login/interactivity hints
    let hasLoginInteractivity = false;
    try {
      const $s = cheerio.load(staticHtml || "");
      const passwordInputs = $s('input[type="password"]').length;
      const loginId = $s('#login').length;
      const formCount = $s('form').length;
      const interactiveAttrs = /on(click|submit|change)\s*=/i.test(staticHtml);
      const loginWords = /\blogin\b|\bsign\s*in\b/i.test(staticHtml);
      hasLoginInteractivity = (passwordInputs > 0) || (loginId > 0) || (formCount > 0 && (interactiveAttrs || loginWords));
    } catch {}
    const linksStatic = Array.from(staticHtml.matchAll(/<a [^>]*href=["']([^"']+)["'][^>]*>/gi)).map((m) => m[1]);
    const buttonsStatic = (staticHtml.match(/<button\b/gi) || []).length;

    // Decide initial mode using static-first heuristics + confidence
    let initialMode = "static";
    let rule = "sufficientStaticContent";
    let confidenceScore = 0.7;
    if (staticTextLength < 300 && (scriptAnalysis.metrics.networkCount + scriptAnalysis.metrics.domMutationCount) > 0) {
      initialMode = "dynamic";
      rule = "textTooShort+activeScripts";
      confidenceScore = 0.8;
    } else if (staticTextLength < 300) {
      initialMode = "dynamic";
      rule = "textTooShort";
      confidenceScore = 0.7;
    } else if ((scriptAnalysis.metrics.networkCount + scriptAnalysis.metrics.domMutationCount) >= 2) {
      initialMode = "dynamic";
      rule = "hasDynamicScripts";
      confidenceScore = 0.85;
    } else if (staticTextLength >= 1500 && scriptCountStatic <= 5) {
      initialMode = "static";
      rule = "richTextLowScripts";
      confidenceScore = 0.85;
    } else {
      initialMode = "static";
      rule = "sufficientStaticContent";
      confidenceScore = 0.7;
    }
    const strongDynamicCandidate = (rule === "hasDynamicScripts" && confidenceScore > 0.8);

    // React/Vite/CRA SPA detection: id="root", vite assets, main.jsx
    const reactViteSpa = /id=\"root\"|id='root'|main\.jsx|vite\.svg|\/assets\/index-[a-z0-9]+\.js/i.test(staticHtml);

    // AI validation layer when low confidence AND domain has both modes observed
    let aiVerifiedMode = null;
    let aiStatus = "skipped";
    let aiErrorDetail = undefined;
    let finalMode = initialMode;
    let reason = "rule";
    const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
    const htmlSnippet = staticHtml.slice(0, 2000);
    const signature = `${host}|${hashString(htmlSnippet)}|${scriptCountStatic}|${Math.min(9, Math.floor(staticTextLength / 500))}`;
    const domainHasMixed = !!(domainSeenModes && domainSeenModes.has("static") && domainSeenModes.has("dynamic"));
    if (confidenceScore < 0.6 && domainHasMixed) {
      if (groqDecisionCache.has(signature)) {
        aiVerifiedMode = groqDecisionCache.get(signature);
        if (aiVerifiedMode) finalMode = aiVerifiedMode;
        reason = "ai-cache";
        aiStatus = "ok";
      } else {
        try {
          const prompt = "Analyze this webpage’s HTML and structure. Is its main visible content rendered statically in the HTML or dynamically through JavaScript after page load? Respond with one word only: static or dynamic.";
          const data = {
            url,
            htmlSnippet,
            scriptCountStatic,
            staticTextLength,
            heuristic: { initialMode, rule, confidenceScore },
          };
          const aiText = await withGroqLimit(() => callGroqModel("llama-3.1-8b-instant", prompt, data));
          const v = (aiText || "").trim().toLowerCase();
          if (v.startsWith("static")) {
            aiVerifiedMode = "static";
          } else if (v.startsWith("dynamic")) {
            aiVerifiedMode = "dynamic";
          }
          console.log(`[FlowAI Groq] Parsed decision: ${aiVerifiedMode || "unknown"}`);
          if (!aiVerifiedMode) {
            throw new Error("Groq returned an invalid or empty response for " + url);
          }
          if (aiVerifiedMode) {
            groqDecisionCache.set(signature, aiVerifiedMode);
            finalMode = aiVerifiedMode;
            reason = "ai";
            aiStatus = "ok";
          }
        } catch (e) {
          console.error(`[FlowAI Groq Error] API failed for ${url} — using heuristic only.`, e?.message || e);
          // Fallback to heuristic decision on AI failure
          reason = "rule-fallback";
          aiVerifiedMode = null;
          aiStatus = "error";
        }
      }
    }

    // Honor AI overriding to static (verification only, not default decision)
    if (aiVerifiedMode === "static") finalMode = "static";

    // Decide if we should render dynamically: always render for SPA candidates (React/Vite markers or SPA markers),
    // otherwise follow heuristic low-confidence dynamic rule
    const spaCandidate = reactViteSpa || hasSpaMarkersStatic;
    const _pathname = (() => { try { return new URL(url).pathname || "/"; } catch { return url; } })();
    const isLoginPath = /\/login(\/|$)/i.test(_pathname);
    const shouldRenderDynamic = spaCandidate || isLoginPath || hasLoginInteractivity || (initialMode === "dynamic" && confidenceScore < 0.7);

    // 2) If final decision is dynamic and we should render, compute metrics/intents from the DOM
    if (finalMode === "dynamic" && shouldRenderDynamic) {
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
        const scriptCount = document.querySelectorAll('script').length;
        const hasSpaMarkersDom = !!(document.querySelector('[data-reactroot]') ||
                                    document.getElementById('__NEXT_DATA__') ||
                                    document.querySelector('[ng-version]') ||
                                    document.getElementById('app') ||
                                    document.getElementById('root') ||
                                    document.getElementById('__NUXT__'));

        return {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || '',
          elements,
          links,
          summary: { links, buttons, forms, inputs, totalText },
          scriptCount,
          hasSpaMarkersDom,
        };
      });

      // Intent tagging after metrics
      result.elements = result.elements.map((el) => ({ ...el, intent: labelIntentFromElement(el) }));

      const linksCount = Array.isArray(result?.summary?.links) ? result.summary.links.length : 0;
      const buttonsCount = Array.isArray(result?.summary?.buttons) ? result.summary.buttons.length : 0;
      const totalTextLength = result?.summary?.totalText || 0;

      // Optional ratio diagnostic when dynamic
      const textRatio = staticTextLength > 0 ? totalTextLength / staticTextLength : (totalTextLength > 0 ? 2 : 0);
      if (rule === "sufficientStaticContent" && textRatio >= 1.3 && totalTextLength >= 800) {
        rule = "renderedTextExceeded";
      }

      const intentCounts = new Map();
      for (const el of result.elements) if (el.intent) intentCounts.set(el.intent, (intentCounts.get(el.intent) || 0) + 1);
      const intentSummary = Array.from(intentCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([intent, count]) => ({ intent, count }));

      const base = {
        url,
        mode: "dynamic",
        engineUsed: "playwright",
        title: result.title,
        description: result.description,
        elements: result.elements,
        links: result.links,
        linksCount,
        buttonsCount,
        totalTextLength,
        textLength: totalTextLength,
        intentSummary,
        scriptAnalysis,
        diagnostic: {
          rule,
          hasSpaMarkersStatic,
          hasSpaMarkersDom: !!result?.hasSpaMarkersDom,
          reactViteSpa,
          scriptCountStatic,
          scriptCountDom: result?.scriptCount || 0,
          staticTextLength,
          dynamicTextLength: totalTextLength,
          textRatio,
        },
      };
      // Final classification adjustment: if DOM diff <5% and no active scripts, treat as static
      const activeScripts = (scriptAnalysis?.metrics?.networkCount || 0) + (scriptAnalysis?.metrics?.domMutationCount || 0);
      const diffPercent = Math.abs((totalTextLength || 0) - (staticTextLength || 0)) / Math.max(1, (staticTextLength || 0));
      if (!Number.isNaN(diffPercent)) {
        console.log(`[FlowAI] DOM diff percent: ${(diffPercent * 100).toFixed(1)}%`);
      }
      if ((scriptAnalysis?.metrics?.endpoints || []).length > 0) {
        console.log(`[FlowAI] Detected script endpoints: ${(scriptAnalysis.metrics.endpoints || []).slice(0,3).join(', ')}`);
      }
      let finalModeAdj = "static";
      if (diffPercent >= 0.30 || activeScripts >= 2 || reactViteSpa) finalModeAdj = "dynamic";
      else if (diffPercent >= 0.05 || activeScripts === 1 || hasLoginInteractivity || isLoginPath) finalModeAdj = "hybrid";
      else finalModeAdj = "static";
      if (finalModeAdj === "hybrid") {
        console.log(`[FlowAI] Page ${_pathname} classified as hybrid (server HTML + JS interactivity)`);
      }
      return {
        ...base,
        initialMode,
        aiVerifiedMode,
        finalMode: finalModeAdj,
        confidenceScore,
        aiConfidenceScore: aiVerifiedMode ? 0.95 : undefined,
        reason,
        aiStatus,
        fallback: reason === "rule-fallback",
        ...(aiErrorDetail ? { errorDetail: aiErrorDetail } : {}),
      };
    }

    // 3) Static path: compute counts from static HTML and return
    const staticResult = {
      url,
      mode: "static",
      engineUsed: "cheerio",
      title: "",
      description: "",
      elements: [],
      links: linksStatic,
      linksCount: linksStatic.length,
      buttonsCount: buttonsStatic,
      totalTextLength: staticTextLength,
      textLength: staticTextLength,
      intentSummary: [],
      scriptAnalysis,
      diagnostic: {
        rule,
        hasSpaMarkersStatic,
        scriptCountStatic: (staticHtml.match(/<script\b/gi) || []).length,
        staticTextLength,
      },
      initialMode,
      aiVerifiedMode,
      finalMode: "static",
      confidenceScore,
      aiConfidenceScore: aiVerifiedMode ? 0.95 : undefined,
      reason,
      aiStatus,
      fallback: reason === "rule-fallback",
      ...(aiErrorDetail ? { errorDetail: aiErrorDetail } : {}),
    };

    if (!shouldRenderDynamic) {
      const desired = strongDynamicCandidate ? "dynamic" : (hasLoginInteractivity || isLoginPath ? "hybrid" : "static");
      staticResult.mode = desired;
      staticResult.finalMode = desired;
    }

    const pathname = (() => { try { return new URL(url).pathname || "/"; } catch { return url; } })();
    console.log(`[FlowAI] Page: ${pathname}`);
    console.log(`Axios: ${axiosOk ? "success" : "fail"}`);
    console.log(`Heuristic: ${initialMode} (${confidenceScore.toFixed(2)})`);
    console.log(`shouldUseDynamic: ${shouldRenderDynamic}`);
    console.log(`Engine used: cheerio`);
    console.log(`Final: ${staticResult.mode}`);
    return staticResult;
  } finally {
    if (ownBrowser) await ownBrowser.close();
  }
}


