import { chromium } from "playwright";

/**
 * Simple Website Crawler
 * Focused on finding pages with forms - nothing else
 */

// Locale pattern: /en-US/, /de/, /fr-CA/, /zh-CN/, etc.
const LOCALE_PREFIX_PATTERN = /^\/[a-z]{2}(-[A-Z]{2})?\//i;

// Intelligent limits per page type - we only need a few of each to test functionality
const PAGE_TYPE_LIMITS = {
  collections: 2,    // Enough to test filters/sorting on e-commerce
  products: 2,       // Enough to test add-to-cart
  blog: 1,           // Just the index for newsletter forms
  news: 1,           // Just the index
  // These are unlimited (primary testing targets):
  // contact, support, help, faq, cart, checkout, pages
};

/**
 * Detect page type from URL path for intelligent limiting
 */
function getPageType(pathname) {
  const path = pathname.toLowerCase();
  
  if (/^\/collections?(\/|$)/i.test(path)) return "collections";
  if (/^\/products?(\/|$)/i.test(path)) return "products";
  if (/^\/blog(\/|$)/i.test(path)) return "blog";
  if (/^\/news(\/|$)/i.test(path)) return "news";
  if (/^\/(contact|contact-us|kontakt|contacto)(\/|$)/i.test(path)) return "contact";
  if (/^\/(support|help|faq)(\/|$)/i.test(path)) return "support";
  if (/^\/(cart|basket|bag)(\/|$)/i.test(path)) return "cart";
  if (/^\/(checkout|pay)(\/|$)/i.test(path)) return "checkout";
  if (/^\/pages?\//i.test(path)) return "pages"; // Shopify static pages
  
  return "other";
}

// Patterns for pages to ALWAYS skip (redundant/low-value for testing)
const SKIP_PATH_PATTERNS = [
  // Technical/internal routes
  /^\/api\//i,                              // API routes
  /^\/auth\//i,                             // Auth routes  
  /^\/_/,                                   // Internal routes (_next, _app, etc.)
  /\/(sitemap|robots\.txt|feed|rss|atom)/i, // Technical pages
  /\.(xml|json|txt)$/i,                     // Data files
  
  // Documentation pages (low testing value - mostly static content)
  /^\/docs?(\/|$)/i,                        // All /doc and /docs pages
  /^\/documentation(\/|$)/i,                // Documentation
  /^\/guides?\/(?!$).+/i,                   // Guide subpages (keep /guides index)
  /^\/tutorials?\/(?!$).+/i,                // Tutorial subpages (keep index)
  /^\/learn\/(?!$).+/i,                     // Learning subpages (keep index)
  /^\/resources?\/(?!$).+/i,                // Resource subpages (keep index)
  /^\/knowledge-?base\/(?!$).+/i,           // KB articles (keep index)
  /^\/wiki\/(?!$).+/i,                      // Wiki articles (keep index)
  
  // Support/Help/FAQ - keep INDEX pages (may have contact forms), skip articles
  /^\/help\/(?!$).+/i,                      // Help articles (keep /help index)
  /^\/support\/(?!$).+/i,                   // Support articles (keep /support index)
  /^\/faq\/(?!$).+/i,                       // FAQ subpages (keep /faq index)
  
  // Legal/policy pages (low testing value)
  /\/(privacy|terms|tos|terms-of-service|security|data-use|cookie|gdpr|legal|imprint|impressum|disclaimer|acceptable-use)$/i,
  
  // Individual content items (keep index pages only)
  /\/blog\/(?!$)[^\/]+/i,                   // Blog posts AND subcategories like /blog/topic/x
  /\/changelog\/(?!$).+/i,                  // Changelog entries
  /\/news\/(?!$)[^\/]+/i,                   // News articles
  /\/posts?\/(?!$)[^\/]+/i,                 // Posts
  /\/articles?\/(?!$)[^\/]+/i,              // Articles
  /\/careers?\/(?!$)[^\/]+/i,               // Individual job listings
  /\/jobs?\/(?!$)[^\/]+/i,                  // Job postings
  /\/events?\/(?!$)[^\/]+/i,                // Individual events
  /\/case-stud(y|ies)\/(?!$)[^\/]+/i,       // Case studies
  /\/testimonials?\/(?!$)[^\/]+/i,          // Individual testimonials
  /\/reviews?\/(?!$)[^\/]+/i,               // Individual reviews
  /\/portfolio\/(?!$)[^\/]+/i,              // Portfolio items
  /\/projects?\/(?!$)[^\/]+/i,              // Individual projects
  /\/team\/(?!$)[^\/]+/i,                   // Individual team member pages
  /\/staff\/(?!$)[^\/]+/i,                  // Staff pages
  /\/people\/(?!$)[^\/]+/i,                 // People pages
  
  // NOTE: E-commerce pages like /products/*, /collections/* are NOT blocked
  // They have forms (add to cart, filters, checkout) that are worth testing
  
  // Taxonomy/archive pages
  /\/tags?\/[^\/]+/i,                       // Tag pages
  /\/categories?\/[^\/]+/i,                 // Category pages
  /\/topics?\/[^\/]+/i,                     // Topic pages
  /\/authors?\/[^\/]+/i,                    // Author pages
  /\/page\/\d+/i,                           // Pagination pages
  /\/\d{4}\/\d{2}(\/\d{2})?/i,              // Date-based archives (2024/01/15)
  /[?&]page=\d+/i,                          // Query-based pagination
  
  // Download/external
  /\/downloads?\/(?!$).+/i,                 // Individual downloads
  /\/files?\/(?!$).+/i,                     // File paths
  
  // User/account (requires auth)
  /\/(dashboard|account|profile|settings|admin|login|logout|signup|register|signin|signout)/i,
];


/**
 * Get the base path without locale prefix for deduplication
 */
function getBasePath(pathname) {
  return pathname.replace(LOCALE_PREFIX_PATTERN, '/').toLowerCase();
}

/**
 * Check if a URL should be crawled based on skip patterns (not deduplication)
 * Deduplication is handled separately by queuedBasePaths
 */
function shouldCrawlByPattern(url, debug = false) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // Get base path (without locale prefix) for pattern matching
    const basePath = getBasePath(path);
    
    // Check against skip patterns (use basePath to ignore locale in patterns)
    for (const pattern of SKIP_PATH_PATTERNS) {
      if (pattern.test(basePath)) {
        if (debug) console.log(`[FlowAI] Skip ${path}: matches pattern ${pattern}`);
        return false;
      }
    }
    
    return true;
  } catch (e) {
    if (debug) console.log(`[FlowAI] Skip ${url}: error - ${e.message}`);
    return false;
  }
}

function normalizeUrl(link, baseUrl) {
  try {
    if (!link) return null;
    if (link.startsWith("mailto:") || link.startsWith("tel:") || link.startsWith("javascript:")) return null;
    if (link.startsWith("#")) return null;
    
    const url = new URL(link, baseUrl);
    url.hash = "";
    
    const path = url.pathname.toLowerCase();
    
    // Skip static assets
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf|mp4|mp3|pdf|zip|xml|json)$/i.test(path)) {
      return null;
    }
    
    // Skip asset directories
    if (/\/(assets|static|_next|node_modules|vendor|dist|build|public\/images)\//.test(path)) {
      return null;
    }
    
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

async function extractPageData(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for page to be fully interactive (Shopify/React sites need this)
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {
      // Continue even if networkidle times out
    }
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    
    // Try to wait for navigation links to appear (common selectors)
    try {
      await page.waitForSelector('nav a, header a, [role="navigation"] a, .nav a, #nav a', { timeout: 5000 });
    } catch {
      // Continue even if no nav found
    }
    
    const data = await page.evaluate(() => {
      const normalizeText = (text) => (text || "").replace(/\s+/g, " ").trim();

      // Get all links - try multiple methods for JS-heavy sites
      const linkElements = document.querySelectorAll("a[href]");
      const links = [];
      
      for (const a of linkElements) {
        try {
          // Try href property first (resolved URL)
          let href = a.href;
          // Fall back to getAttribute for relative URLs
          if (!href || href === "javascript:void(0)") {
            href = a.getAttribute("href");
            if (href && !href.startsWith("http") && !href.startsWith("javascript:") && !href.startsWith("#")) {
              // Resolve relative URL
              href = new URL(href, window.location.origin).href;
            }
          }
          if (href && !href.startsWith("javascript:") && !href.startsWith("#") && href.startsWith("http")) {
            links.push(href);
          }
        } catch {
          // Skip malformed links
        }
      }
      
      const formNodes = [...document.querySelectorAll("form")].slice(0, 10);

      const formsMeta = formNodes.map((form, idx) => {
        const inputs = [...form.querySelectorAll("input, textarea, select")]
          .filter((el) => el.getAttribute("type") !== "hidden")
          .slice(0, 20)
          .map((input) => {
            const label = input.id ? document.querySelector(`label[for='${input.id}']`) : null;
            return {
              tag: input.tagName.toLowerCase(),
              type: input.getAttribute("type") || (input.tagName.toLowerCase() === "textarea" ? "textarea" : "text"),
              name: input.getAttribute("name") || "",
              placeholder: input.getAttribute("placeholder") || "",
              ariaLabel: input.getAttribute("aria-label") || "",
              label: label ? normalizeText(label.textContent || "") : "",
            };
          });

        const buttons = [...form.querySelectorAll("button, input[type='submit']")].slice(0, 5).map((btn) => {
          const tag = btn.tagName.toLowerCase();
          return {
            tag,
            type: btn.getAttribute("type") || (tag === "button" ? "button" : "submit"),
            text: normalizeText(btn.textContent || btn.value || ""),
          };
        });

        const surrounding = normalizeText(form.textContent || "").slice(0, 400);

        return {
          index: idx,
          action: form.getAttribute("action") || "",
          method: (form.getAttribute("method") || "get").toLowerCase(),
          inputs,
          buttons,
          text: surrounding,
        };
      });

      const forms = formsMeta.length;
      const inputsCount = [...document.querySelectorAll("input:not([type='hidden']), textarea, select")].length;
      const buttonsCount = [...document.querySelectorAll("button, input[type='submit']")].length;
      
      return {
        title: document.title || "",
        links: [...new Set(links)],
        forms,
        inputs: inputsCount,
        buttons: buttonsCount,
        formsMeta,
      };
    });
    
    return {
      url,
      title: data.title,
      links: data.links,
      forms: data.forms,
      inputs: data.inputs,
      buttons: data.buttons,
      formsMeta: data.formsMeta || [],
      hasForm: (data.formsMeta || []).length > 0 || data.inputs > 2,
      error: null,
    };
  } catch (err) {
    return {
      url,
      title: "",
      links: [],
      forms: 0,
      inputs: 0,
      buttons: 0,
      hasForm: false,
      error: err?.message || String(err),
    };
  }
}

export async function crawlWebsite(startUrl, maxPages = 20) {
  const visited = new Set();
  const queuedBasePaths = new Set(); // Track base paths we've queued (for dedup when adding to queue)
  const pageTypeCounts = {}; // Track how many pages of each type we've crawled
  const queue = [startUrl];
  const results = [];
  let skippedCount = 0;
  let skippedByLimit = 0;
  
  // Add start URL's base path
  queuedBasePaths.add(getBasePath(new URL(startUrl).pathname));
  
  let browser = null;
  
  // Get the base domain (strip www for comparison)
  const startHost = new URL(startUrl).hostname.replace(/^www\./, "");
  
  console.log(`[FlowAI] Starting crawl: ${startUrl}`);
  console.log(`[FlowAI] Max pages: ${maxPages}`);
  console.log(`[FlowAI] Smart filtering enabled (skipping redundant pages)`);
  
  try {
    // Launch browser
    try {
      browser = await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    
    const page = await context.newPage();
    
    // Block images and fonts for speed
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "media", "stylesheet"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    while (queue.length > 0 && results.length < maxPages) {
      const url = queue.shift();

      if (!url || visited.has(url)) continue;
      visited.add(url);

      // Only crawl same domain (strip www for comparison)
      try {
        const urlHost = new URL(url).hostname.replace(/^www\./, "");
        if (urlHost !== startHost) continue;
      } catch {
        continue;
      }

      const pathname = new URL(url).pathname || "/";
      console.log(`[FlowAI] (${results.length + 1}/${maxPages}) ${pathname}`);
      
      const pageData = await extractPageData(page, url);
      results.push(pageData);
      
      // Debug: if no links found, check page state
      if (pageData.links.length === 0) {
        const debugInfo = await page.evaluate(() => ({
          title: document.title,
          bodyLength: document.body?.innerHTML?.length || 0,
          allAnchors: document.querySelectorAll("a").length,
          anchorsWithHref: document.querySelectorAll("a[href]").length,
        }));
        console.log(`[FlowAI] Debug - Title: "${debugInfo.title}", Body: ${debugInfo.bodyLength} chars, Anchors: ${debugInfo.allAnchors} (${debugInfo.anchorsWithHref} with href)`);
      }
      
      console.log(`[FlowAI] Extracted ${pageData.links.length} links from page`);
      
      // Add new links to queue (with smart filtering)
      let addedToQueue = 0;
      let skippedByPattern = 0;
      let skippedByDedup = 0;
      let skippedByLimitLocal = 0;
      for (const link of pageData.links) {
        const normalized = normalizeUrl(link, url);
        if (!normalized) continue;
        if (visited.has(normalized)) continue;
        if (queue.includes(normalized)) continue;
        
        // Get base path for deduplication (strips locale prefix)
        const linkBasePath = getBasePath(new URL(normalized).pathname);
        
        // Skip if we've already queued this base path (handles locale dedup)
        if (queuedBasePaths.has(linkBasePath)) {
          skippedByDedup++;
          continue;
        }
        
        // Check against skip patterns
        if (!shouldCrawlByPattern(normalized, false)) {
          skippedByPattern++;
          skippedCount++;
          continue;
        }
        
        // Check page type limits (e.g., max 2 collections, max 2 products)
        const linkPathname = new URL(normalized).pathname;
        const pageType = getPageType(linkPathname);
        const limit = PAGE_TYPE_LIMITS[pageType];
        
        if (limit !== undefined) {
          const currentCount = pageTypeCounts[pageType] || 0;
          if (currentCount >= limit) {
            skippedByLimitLocal++;
            skippedByLimit++;
            continue;
          }
          pageTypeCounts[pageType] = currentCount + 1;
        }
        
        // Track base path to prevent duplicates (locale or otherwise)
        queuedBasePaths.add(linkBasePath);
        queue.push(normalized);
        addedToQueue++;
      }
      if (addedToQueue > 0 || skippedByLimitLocal > 0) {
        console.log(`[FlowAI] Links: ${addedToQueue} added, ${skippedByDedup} dup, ${skippedByPattern} filtered, ${skippedByLimitLocal} limited`);
      }
    }
    
    await page.close();
    await context.close();
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  // Summary
  const pagesWithForms = results.filter(r => r.hasForm);
  console.log(`[FlowAI] Crawl complete: ${results.length} pages crawled`);
  if (skippedCount > 0 || skippedByLimit > 0) {
    console.log(`[FlowAI] Skipped: ${skippedCount} by pattern, ${skippedByLimit} by type limit`);
  }
  console.log(`[FlowAI] Found ${pagesWithForms.length} pages with forms`);
  
  return {
    startUrl,
    totalPages: results.length,
    pagesWithForms: pagesWithForms.length,
    results,
  };
}

// Keep the old function name for compatibility
export async function crawlWebsiteIntelligent(startUrl, maxDepth = 2, maxPages = 20) {
  return crawlWebsite(startUrl, maxPages);
}
