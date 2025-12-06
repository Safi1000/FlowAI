import { chromium } from "playwright";

/**
 * Simple Website Crawler
 * Focused on finding pages with forms - nothing else
 */

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
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000); // Let JS render
    
    const data = await page.evaluate(() => {
      // Get all links
      const links = [...document.querySelectorAll("a[href]")]
        .map(a => a.href)
        .filter(href => href && !href.startsWith("javascript:"));
      
      // Count forms and inputs
      const forms = document.querySelectorAll("form").length;
      const inputs = document.querySelectorAll("input:not([type='hidden']), textarea, select").length;
      const buttons = document.querySelectorAll("button, input[type='submit']").length;
      
      return {
        title: document.title || "",
        links: [...new Set(links)],
        forms,
        inputs,
        buttons,
      };
    });
    
    return {
      url,
      title: data.title,
      links: data.links,
      forms: data.forms,
      inputs: data.inputs,
      buttons: data.buttons,
      hasForm: data.forms > 0 || data.inputs > 2,
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
  const queue = [startUrl];
  const results = [];
  
  let browser = null;
  
  // Get the base domain (strip www for comparison)
  const startHost = new URL(startUrl).hostname.replace(/^www\./, "");
  
  console.log(`[FlowAI] Starting crawl: ${startUrl}`);
  console.log(`[FlowAI] Max pages: ${maxPages}`);
  
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
      
      // Add new links to queue
      for (const link of pageData.links) {
        const normalized = normalizeUrl(link, url);
        if (normalized && !visited.has(normalized) && !queue.includes(normalized)) {
          queue.push(normalized);
        }
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
  console.log(`[FlowAI] Crawl complete: ${results.length} pages, ${pagesWithForms.length} with forms`);
  
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
