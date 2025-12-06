/**
 * Link Tester - Check all links on a website for broken links (404s)
 */

import { chromium } from "playwright";

/**
 * Test a single URL and return its status
 */
async function checkLink(url, timeout = 10000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: "HEAD", // Use HEAD for faster checks
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    
    clearTimeout(timeoutId);
    
    return {
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      redirected: response.redirected,
      finalUrl: response.url,
    };
  } catch (err) {
    // If HEAD fails, try GET (some servers don't support HEAD)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      clearTimeout(timeoutId);
      
      return {
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        redirected: response.redirected,
        finalUrl: response.url,
      };
    } catch (getErr) {
      return {
        url,
        status: 0,
        statusText: "Connection Failed",
        ok: false,
        error: getErr?.message || "Failed to connect",
      };
    }
  }
}

/**
 * Categorize a link as internal or external
 */
function categorizeLink(link, baseHost) {
  try {
    const linkHost = new URL(link).hostname.replace(/^www\./, "");
    const isInternal = linkHost === baseHost;
    return { isInternal, isExternal: !isInternal };
  } catch {
    return { isInternal: false, isExternal: true };
  }
}

/**
 * Test all links from crawl results
 */
export async function testLinks(crawlData, options = {}) {
  const { testExternal = false, maxLinks = 100 } = options;
  
  const results = crawlData?.results || [];
  if (results.length === 0) {
    return {
      total: 0,
      tested: 0,
      working: [],
      broken: [],
      redirected: [],
      errors: [],
      summary: { working: 0, broken: 0, redirected: 0, errors: 0 },
    };
  }
  
  // Get base domain
  const baseHost = new URL(crawlData.startUrl).hostname.replace(/^www\./, "");
  
  // Collect all unique links
  const allLinks = new Set();
  for (const page of results) {
    if (page.links && Array.isArray(page.links)) {
      for (const link of page.links) {
        if (link && link.startsWith("http")) {
          allLinks.add(link);
        }
      }
    }
  }
  
  // Filter and categorize links
  const linksToTest = [];
  for (const link of allLinks) {
    const { isInternal, isExternal } = categorizeLink(link, baseHost);
    
    // Skip external links if not requested
    if (isExternal && !testExternal) continue;
    
    // Skip obvious non-page URLs
    const path = new URL(link).pathname.toLowerCase();
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|mp4|mp3|pdf|zip)$/i.test(path)) {
      continue;
    }
    
    linksToTest.push({ url: link, isInternal, isExternal });
    
    if (linksToTest.length >= maxLinks) break;
  }
  
  console.log(`[FlowAI] Testing ${linksToTest.length} links (internal: ${linksToTest.filter(l => l.isInternal).length}, external: ${linksToTest.filter(l => l.isExternal).length})`);
  
  // Test links in batches
  const batchSize = 10;
  const working = [];
  const broken = [];
  const redirected = [];
  const errors = [];
  
  for (let i = 0; i < linksToTest.length; i += batchSize) {
    const batch = linksToTest.slice(i, i + batchSize);
    
    console.log(`[FlowAI] Testing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(linksToTest.length / batchSize)}`);
    
    const results = await Promise.all(
      batch.map(async ({ url, isInternal, isExternal }) => {
        const result = await checkLink(url);
        return { ...result, isInternal, isExternal };
      })
    );
    
    for (const result of results) {
      if (result.error) {
        errors.push(result);
      } else if (result.status >= 400) {
        broken.push(result);
      } else if (result.redirected) {
        redirected.push(result);
      } else {
        working.push(result);
      }
    }
  }
  
  console.log(`[FlowAI] Link testing complete: ${working.length} working, ${broken.length} broken, ${redirected.length} redirected, ${errors.length} errors`);
  
  return {
    total: allLinks.size,
    tested: linksToTest.length,
    working,
    broken,
    redirected,
    errors,
    summary: {
      working: working.length,
      broken: broken.length,
      redirected: redirected.length,
      errors: errors.length,
    },
  };
}

/**
 * Extract all links from a single page using Playwright
 */
export async function extractLinksFromPage(url) {
  let browser = null;
  
  try {
    try {
      browser = await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    
    const links = await page.evaluate(() => {
      return [...document.querySelectorAll("a[href]")]
        .map(a => a.href)
        .filter(href => href && href.startsWith("http"));
    });
    
    await page.close();
    
    return [...new Set(links)];
  } finally {
    if (browser) await browser.close();
  }
}

