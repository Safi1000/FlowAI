import { chromium } from "playwright";
import axios from "axios";
import { intelligentParse } from "./intelligentParser.js";

function normalizeUrl(link, base) {
  try {
    if (!link) return null;
    if (link.startsWith("mailto:") || link.startsWith("tel:")) return null;
    const u = new URL(link, base);
    u.hash = "";
    u.search = "";
    const p = u.pathname.toLowerCase();
    if (/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|json|webp|woff|woff2|ttf|otf)$/.test(p)) return null;
    if (p.includes("/assets/") || p.includes("/static/") || p.includes("/cdn/") || p.includes("/images/")) return null;
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
  const seenModes = new Set();
  let totalDiscovered = 0;
  const MAX_ROUTES_PER_DOMAIN = Number(process.env.FLOWAI_MAX_ROUTES || 20);
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

      let parsed = null;
      try {
        parsed = await intelligentParse(url, { browser, domainSeenModes: seenModes });
        results.push(parsed);
        // Diagnostic logging per page
        try {
          const pathname = new URL(url).pathname || "/";
          const heuristicStr = `${parsed.initialMode || parsed.mode} (${typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore.toFixed(2) : 'n/a'})`;
          const aiStr = parsed.aiVerifiedMode ? parsed.aiVerifiedMode : (parsed.aiStatus === 'error' ? 'error' : 'skipped');
          const finalStr = parsed.finalMode || parsed.mode;
          const fb = parsed.fallback ? 'yes' : 'no';
          console.log(`[FlowAI] Page: ${pathname}\nHeuristic: ${heuristicStr}\nGemini: ${aiStr}\nEngine: ${parsed.engineUsed || 'unknown'}\nFinal: ${finalStr}\nFallback: ${fb}`);
        } catch {}
        if (parsed?.mode === "static" || parsed?.mode === "dynamic") {
          seenModes.add(parsed.mode);
        }
      } catch (err) {
        results.push({ url, mode: "error", error: err?.message || String(err) });
        continue;
      }

      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      let links = parsed?.links || [];

      // SPA internal route discovery
      const hasSpa = parsed?.diagnostic?.hasSpaMarkersStatic || parsed?.diagnostic?.hasSpaMarkersDom;
      const isDynamicEngine = parsed?.engineUsed === "playwright" || parsed?.mode === "dynamic";
      if ((hasSpa || isDynamicEngine) && browser) {
        try {
          const page = await browser.newPage();
          await page.route("**/*", (route) => {
            const type = route.request().resourceType();
            if (["image", "font", "media"].includes(type)) route.abort();
            else route.continue();
          });
          try { await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" }); } catch {}
          try { await page.setViewportSize({ width: 1366, height: 900 }); } catch {}
          const internalPaths = new Set();
          const trackInternal = (u) => {
            try {
              const t = new URL(u);
              if (t.hostname === startHost && t.pathname.startsWith('/')) internalPaths.add(t.pathname);
            } catch {}
          };
          page.on("request", (req) => { try { trackInternal(req.url()); } catch {} });

          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
          const manifest = await page.evaluate((host) => {
            const out = new Set();
            let framework = 'unknown';
            const sources = { anchors: 0, absoluteAnchors: 0, nextData: 0, scriptsJson: 0, nuxt: 0, routeManifest: 0 };
            const add = (v, src) => { try { if (typeof v === 'string' && v.startsWith('/')) { out.add(v); if (src) sources[src]++; } } catch {} };
            document.querySelectorAll('a[href^="/"]').forEach(a => add(a.getAttribute('href'), 'anchors'));
            document.querySelectorAll('a[href^="http"]').forEach(a => { try { const u = new URL(a.getAttribute('href')); if (u.hostname === host && u.pathname.startsWith('/')) add(u.pathname, 'absoluteAnchors'); } catch {} });
            document.querySelectorAll('[data-href^="/"]').forEach(el => add(el.getAttribute('data-href'), 'anchors'));
            document.querySelectorAll('[role="link"][href^="/"]').forEach(el => add(el.getAttribute('href'), 'anchors'));
            try { const n = (window).__NEXT_DATA__; if (n) { framework = 'Next.js'; add(n.page, 'nextData'); const s = JSON.stringify(n); const re = /\"\/(?:[A-Za-z0-9_\-/.])+\"/g; (s.match(re) || []).forEach(m => { try { const v = JSON.parse(m); if (v.startsWith('/')) add(v,'nextData');} catch{} }); } } catch {}
            try { const nuxt = (window).__NUXT__; const r = nuxt?.router?.routes || nuxt?.data?.routes; if (Array.isArray(r)) { framework = framework === 'unknown' ? 'Nuxt' : framework; r.forEach((p) => add(p?.path || p, 'nuxt')); } } catch {}
            try { const rm = (window).__ROUTE_MANIFEST__ || (window).__APP_ROUTES__; if (rm) { try { Object.keys(rm).forEach(k=>add(k,'routeManifest')); framework = framework === 'unknown' ? 'React/Vite' : framework; } catch {} } } catch {}
            document.querySelectorAll('script[id="__NEXT_DATA__"],script[type="application/json"]').forEach(s => {
              try { const txt = s.textContent || ''; const re = /\"\/(?:[A-Za-z0-9_\-/.])+\"/g; (txt.match(re) || []).forEach(m => { try { const v = JSON.parse(m); if (v.startsWith('/')) add(v,'scriptsJson');} catch{} }); } catch {}
            });
            if (framework === 'unknown' && document.getElementById('root')) framework = 'React/Vite';
            return { routes: Array.from(out), framework, sources };
          }, startHost);
          for (const p of (manifest?.routes || [])) { try { trackInternal(new URL(p, url).toString()); } catch {} }
          if (manifest?.framework && manifest.framework !== 'unknown') {
            console.log(`[FlowAI] Detected ${manifest.framework} SPA`);
          }

          // Scan JS bundles for embedded route strings (same-origin assets)
          try {
            const bundleSrcs = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src')));
            const candidateBundles = (bundleSrcs || []).filter((s) => typeof s === 'string' && /\/assets\/.+\.js$/i.test(s));
            const bundleRoutes = new Set();
            for (const b of candidateBundles.slice(0, 3)) {
              try {
                const abs = new URL(b, url).toString();
                const res = await axios.get(abs, { timeout: 5000, responseType: 'text' });
                const code = String(res.data || '');
                const re = /["'`](\/(?:[A-Za-z0-9_\-\/]{1,60}))["'`]/g;
                let m;
                while ((m = re.exec(code)) !== null) {
                  const path = m[1];
                  try {
                    const u = new URL(path, url);
                    if (u.hostname === startHost && !/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|json|webp|woff|woff2|ttf|otf)$/i.test(u.pathname)) {
                      bundleRoutes.add(u.pathname);
                    }
                  } catch {}
                }
                const reHash = /#\/(?:[A-Za-z0-9_\-\/]{1,60})/g;
                let h;
                while ((h = reHash.exec(code)) !== null) {
                  const path = h[0].slice(1); // drop '#'
                  try { const u = new URL(path, url); if (u.hostname === startHost) bundleRoutes.add(u.pathname); } catch {}
                }
              } catch {}
            }
            if (bundleRoutes.size > 0) {
              for (const p of bundleRoutes) internalPaths.add(p);
              const sample = Array.from(bundleRoutes).slice(0, 10).join(', ');
              console.log(`[FlowAI SPA] Extracted routes from bundles: ${sample}`);
            }
          } catch {}

          if (internalPaths.size === 0) {
            const seeds = ["/about", "/services", "/projects", "/contact", "/packages", "/services/web", "/services/ios", "/services/android", "/services/ui-ux", "/work"];
            for (const s of seeds) internalPaths.add(s);
            console.log(`[FlowAI SPA] No routes found by manifests; seeding common routes.`);
          }
          const toTry = Array.from(internalPaths).slice(0, MAX_ROUTES_PER_DOMAIN);
          for (const p of toTry) {
            try {
              await page.evaluate((path) => {
                try {
                  const w = window;
                  const anyW = w;
                  if (anyW.next && anyW.next.router && typeof anyW.next.router.push === 'function') {
                    anyW.next.router.push(path);
                  } else if (anyW.router && typeof anyW.router.push === 'function') {
                    anyW.router.push(path);
                  } else {
                    history.pushState({}, '', path);
                    window.dispatchEvent(new Event('popstate'));
                  }
                } catch {}
              }, p);
              await new Promise((r) => setTimeout(r, 1500));
              try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
              try {
                const size = await page.evaluate(() => (document.body?.innerHTML?.length || 0));
                console.log(`[FlowAI SPA] Visited route ${p} — DOM size: ${size}`);
              } catch {}
            } catch {}
          }

          // As a last resort, simulate clicks on nav-like anchors to trigger client routing
          try {
            await page.evaluate(() => {
              try {
                window._flowaiRoutes = new Set();
                const origPush = history.pushState.bind(history);
                history.pushState = function (...args) {
                  origPush.apply(history, args);
                  try { window._flowaiRoutes.add(location.pathname); } catch {}
                };
                window.addEventListener('popstate', () => {
                  try { window._flowaiRoutes.add(location.pathname); } catch {}
                });
              } catch {}
            });
            const clicked = await page.evaluate(async () => {
              const cand = Array.from(document.querySelectorAll('a, [role="link"]'))
                .filter((el) => {
                  const href = el.getAttribute && el.getAttribute('href') || '';
                  const text = (el.textContent || '').toLowerCase();
                  if (/^https?:/i.test(href)) return false;
                  if (href && href.startsWith('/')) return true;
                  if (/about|service|project|contact|package|work/.test(text)) return true;
                  return false;
                })
                .slice(0, 10);
              for (const el of cand) {
                try {
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                  await new Promise((r) => setTimeout(r, 800));
                } catch {}
              }
              return Array.from((window)._flowaiRoutes || []);
            });
            for (const p of (clicked || [])) { try { trackInternal(new URL(p, url).toString()); } catch {} }
          } catch {}

          const normalizedExtra = [];
          const normSet = new Set();
          for (const p of internalPaths) {
            const n = normalizeUrl(p, url);
            if (n && !normSet.has(n)) { normSet.add(n); normalizedExtra.push(n); }
          }
          const before = links.length;
          links = Array.from(new Set([...(links || []).map(l => normalizeUrl(l, url)).filter(Boolean), ...normalizedExtra]));
          const added = Math.max(0, links.length - before);
          if (added > 0) {
            totalDiscovered += added;
            const sample = normalizedExtra.map(x => { try { return new URL(x).pathname; } catch { return x; } }).slice(0, 10);
            const srcs = manifest?.sources || {};
            const srcDetails = Object.entries(srcs).filter(([,v]) => v>0).map(([k,v])=>`${v} from ${k}`).join(', ');
            console.log(`[FlowAI SPA] Discovered ${added} client routes: ${sample.join(', ')}${srcDetails ? ` (sources: ${srcDetails})` : ''}`);
          }
          await page.close();
        } catch (e) {
          console.warn(`[FlowAI] SPA discovery failed on ${url}: ${e?.message || e}`);
        }
      }

      // Capture virtual views as separate results when URL doesn't change (client-side routing)
      if ((hasSpa || isDynamicEngine) && browser && results.length < maxPages) {
        try {
          const page = await browser.newPage();
          await page.route("**/*", (route) => {
            const type = route.request().resourceType();
            if (["image", "font", "media"].includes(type)) route.abort();
            else route.continue();
          });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
          const baseText = await page.evaluate(() => (document.body?.innerText?.length || 0));
          const linksForViews = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a, [role="link"]')).map((el) => ({
              href: (el.getAttribute && el.getAttribute('href')) || '',
              text: (el.textContent || '').trim(),
            })).filter(x => x.text.length > 0).slice(0, 12);
          });
          const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32) || 'view';
          const seenLabels = new Set();
          for (const c of linksForViews) {
            if (results.length >= maxPages) break;
            const label = slugify(c.text);
            if (seenLabels.has(label)) continue;
            seenLabels.add(label);
            try {
              await page.evaluate((txt) => {
                const el = Array.from(document.querySelectorAll('a, [role="link"]')).find(e => (e.textContent || '').trim() === txt);
                if (!el) return;
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }, c.text);
              await new Promise((r) => setTimeout(r, 1200));
              try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch {}
              const view = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a')).map((a) => (a.getAttribute && a.getAttribute('href')) || '');
                const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.innerText ? b.innerText.trim() : ((b.textContent || '').trim())));
                const forms = document.querySelectorAll('form').length;
                const inputs = document.querySelectorAll('input').length;
                const totalText = document.body?.innerText?.length || 0;
                const title = document.title || '';
                return { title, summary: { links, buttons, forms, inputs, totalText } };
              });
              const totalText = Number(view?.summary?.totalText || 0);
              const diff = Math.abs(totalText - baseText) / Math.max(1, baseText);
              const mode = diff >= 0.30 ? 'dynamic' : (diff >= 0.05 ? 'hybrid' : 'static');
              const virtualUrl = `${url}#view=${label}`;
              results.push({
                url: virtualUrl,
                mode,
                engineUsed: 'playwright',
                title: view?.title || '',
                description: '',
                elements: [],
                links: view?.summary?.links || [],
                linksCount: Array.isArray(view?.summary?.links) ? view.summary.links.length : 0,
                buttonsCount: Array.isArray(view?.summary?.buttons) ? view.summary.buttons.length : 0,
                totalTextLength: totalText,
                textLength: totalText,
                initialMode: mode,
                finalMode: mode,
                confidenceScore: diff,
                diagnostic: { virtualView: true, label, baseText, diffPercent: diff },
              });
              console.log(`[FlowAI SPA] Captured virtual view: ${label} (mode: ${mode})`);
            } catch {}
          }
          await page.close();
        } catch {}
      }
      for (const link of links) {
        const normalized = normalizeUrl(link, url);
        if (!normalized) continue;
        try {
          if (new URL(normalized).hostname !== startHost) continue;
        } catch { continue; }
        if (visited.has(normalized)) continue;
        queue.push({ url: normalized, depth: depth + 1 });
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  const dynamicCount = results.filter((p) => p?.mode === "dynamic").length;
  const hybridCount = results.filter((p) => p?.mode === "hybrid").length;
  const staticCount = results.length - dynamicCount - hybridCount;
  const samplePages = results.slice(0, 10).map((p) => ({
    url: p.url,
    mode: p.mode,
    initialMode: p.initialMode,
    aiVerifiedMode: p.aiVerifiedMode,
    finalMode: p.finalMode,
    confidenceScore: p.confidenceScore,
    reason: p.reason,
    aiStatus: p.aiStatus,
    fallback: p.fallback,
    linksCount: p.linksCount || 0,
    buttonsCount: p.buttonsCount || 0,
    totalTextLength: p.totalTextLength || p.textLength || 0,
    error: p.error,
    diagnostic: p.diagnostic,
  }));
  if (totalDiscovered === 0) {
    console.warn(`[FlowAI] No additional routes discovered beyond initial links for ${startUrl}.`);
  }
  console.log(`[FlowAI] Discovered: ${totalDiscovered} routes, Parsed: ${results.length}`);
  return { startUrl, totalPages: results.length, staticCount, hybridCount, dynamicCount, samplePages, results };
}


