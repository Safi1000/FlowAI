/**
 * Performance Testing - Measure page load times and Core Web Vitals
 * Uses Playwright's built-in performance metrics
 */

import { chromium } from "playwright";

/**
 * Performance thresholds based on Google's recommendations
 */
const THRESHOLDS = {
  // Core Web Vitals
  LCP: { good: 2500, needsImprovement: 4000 }, // Largest Contentful Paint (ms)
  FID: { good: 100, needsImprovement: 300 },   // First Input Delay (ms) - approximated
  CLS: { good: 0.1, needsImprovement: 0.25 },  // Cumulative Layout Shift
  
  // Other metrics
  FCP: { good: 1800, needsImprovement: 3000 }, // First Contentful Paint (ms)
  TTFB: { good: 800, needsImprovement: 1800 }, // Time to First Byte (ms)
  TTI: { good: 3800, needsImprovement: 7300 }, // Time to Interactive (ms)
  TBT: { good: 200, needsImprovement: 600 },   // Total Blocking Time (ms)
  
  // Resource metrics
  pageSize: { good: 2000000, needsImprovement: 4000000 }, // 2MB / 4MB
  requestCount: { good: 50, needsImprovement: 100 },
  imageSize: { good: 500000, needsImprovement: 1000000 }, // 500KB / 1MB
  jsSize: { good: 300000, needsImprovement: 600000 },     // 300KB / 600KB
  cssSize: { good: 100000, needsImprovement: 200000 },    // 100KB / 200KB
};

/**
 * Get score based on value and thresholds
 */
function getScore(value, metric) {
  const threshold = THRESHOLDS[metric];
  if (!threshold) return "unknown";
  
  // For CLS, lower is better (same as others)
  if (value <= threshold.good) return "good";
  if (value <= threshold.needsImprovement) return "needs-improvement";
  return "poor";
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Test performance of a single page
 */
async function testPagePerformance(context, url) {
  const page = await context.newPage();
  
  const result = {
    url,
    metrics: {},
    resources: {
      total: { count: 0, size: 0 },
      byType: {},
    },
    scores: {},
    issues: [],
    status: "pass",
  };

  try {
    // Track network requests
    const requests = [];
    page.on("response", async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();
        const url = request.url();
        
        // Get response size
        const headers = response.headers();
        let size = 0;
        
        try {
          const buffer = await response.body();
          size = buffer.length;
        } catch {
          // Some responses can't be read
          size = parseInt(headers["content-length"] || "0", 10);
        }
        
        requests.push({
          url,
          type: resourceType,
          size,
          status: response.status(),
        });
      } catch {}
    });

    // Start timing
    const startTime = Date.now();
    
    // Navigate to page
    const response = await page.goto(url, { 
      waitUntil: "networkidle", 
      timeout: 60000 
    });
    
    // TTFB - Time to First Byte
    const ttfb = Date.now() - startTime;
    
    // Wait for page to be fully loaded
    await page.waitForLoadState("load");
    
    // Get performance timing from browser
    const performanceTiming = await page.evaluate(() => {
      const timing = performance.timing;
      const paint = performance.getEntriesByType("paint");
      const navigation = performance.getEntriesByType("navigation")[0];
      
      // Get LCP
      let lcp = 0;
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      if (lcpEntries.length > 0) {
        lcp = lcpEntries[lcpEntries.length - 1].startTime;
      }
      
      // Get CLS
      let cls = 0;
      const layoutShiftEntries = performance.getEntriesByType("layout-shift");
      for (const entry of layoutShiftEntries) {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      }
      
      // FCP
      const fcpEntry = paint.find(p => p.name === "first-contentful-paint");
      const fcp = fcpEntry ? fcpEntry.startTime : 0;
      
      // FP
      const fpEntry = paint.find(p => p.name === "first-paint");
      const fp = fpEntry ? fpEntry.startTime : 0;
      
      return {
        // Navigation timing
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart,
        domInteractive: timing.domInteractive - timing.navigationStart,
        
        // Paint timing
        firstPaint: fp,
        firstContentfulPaint: fcp,
        largestContentfulPaint: lcp,
        
        // Layout shift
        cumulativeLayoutShift: cls,
        
        // DOM stats
        domElements: document.querySelectorAll("*").length,
        domDepth: (() => {
          let maxDepth = 0;
          const walk = (node, depth) => {
            if (depth > maxDepth) maxDepth = depth;
            for (const child of node.children) {
              walk(child, depth + 1);
            }
          };
          walk(document.body, 0);
          return maxDepth;
        })(),
      };
    });

    // Calculate metrics
    result.metrics = {
      // Core Web Vitals
      LCP: Math.round(performanceTiming.largestContentfulPaint || performanceTiming.loadComplete),
      CLS: parseFloat(performanceTiming.cumulativeLayoutShift.toFixed(3)),
      
      // Other timing metrics
      FCP: Math.round(performanceTiming.firstContentfulPaint),
      TTFB: ttfb,
      DOMContentLoaded: Math.round(performanceTiming.domContentLoaded),
      LoadComplete: Math.round(performanceTiming.loadComplete),
      DOMInteractive: Math.round(performanceTiming.domInteractive),
      
      // DOM metrics
      DOMElements: performanceTiming.domElements,
      DOMDepth: performanceTiming.domDepth,
    };

    // Calculate resource metrics
    let totalSize = 0;
    const byType = {};
    
    for (const req of requests) {
      totalSize += req.size;
      
      if (!byType[req.type]) {
        byType[req.type] = { count: 0, size: 0 };
      }
      byType[req.type].count++;
      byType[req.type].size += req.size;
    }
    
    result.resources = {
      total: { count: requests.length, size: totalSize },
      byType,
    };
    
    result.metrics.PageSize = totalSize;
    result.metrics.RequestCount = requests.length;
    result.metrics.ImageSize = byType.image?.size || 0;
    result.metrics.JSSize = byType.script?.size || 0;
    result.metrics.CSSSize = byType.stylesheet?.size || 0;

    // Calculate scores
    result.scores = {
      LCP: getScore(result.metrics.LCP, "LCP"),
      CLS: getScore(result.metrics.CLS, "CLS"),
      FCP: getScore(result.metrics.FCP, "FCP"),
      TTFB: getScore(result.metrics.TTFB, "TTFB"),
      PageSize: getScore(result.metrics.PageSize, "pageSize"),
      RequestCount: getScore(result.metrics.RequestCount, "requestCount"),
    };

    // Identify issues
    if (result.scores.LCP === "poor") {
      result.issues.push({
        type: "LCP",
        severity: "high",
        message: `Largest Contentful Paint is ${(result.metrics.LCP / 1000).toFixed(2)}s (should be < 2.5s)`,
        suggestion: "Optimize images, use lazy loading, improve server response time",
      });
    } else if (result.scores.LCP === "needs-improvement") {
      result.issues.push({
        type: "LCP",
        severity: "medium",
        message: `Largest Contentful Paint is ${(result.metrics.LCP / 1000).toFixed(2)}s (target: < 2.5s)`,
        suggestion: "Consider optimizing largest visible element",
      });
    }

    if (result.scores.CLS === "poor") {
      result.issues.push({
        type: "CLS",
        severity: "high",
        message: `Cumulative Layout Shift is ${result.metrics.CLS} (should be < 0.1)`,
        suggestion: "Add size attributes to images/videos, avoid inserting content above existing content",
      });
    }

    if (result.scores.FCP === "poor") {
      result.issues.push({
        type: "FCP",
        severity: "medium",
        message: `First Contentful Paint is ${(result.metrics.FCP / 1000).toFixed(2)}s (should be < 1.8s)`,
        suggestion: "Reduce render-blocking resources, optimize CSS delivery",
      });
    }

    if (result.scores.TTFB === "poor") {
      result.issues.push({
        type: "TTFB",
        severity: "medium",
        message: `Time to First Byte is ${result.metrics.TTFB}ms (should be < 800ms)`,
        suggestion: "Improve server response time, use CDN, enable caching",
      });
    }

    if (result.scores.PageSize === "poor") {
      result.issues.push({
        type: "PageSize",
        severity: "medium",
        message: `Page size is ${formatBytes(result.metrics.PageSize)} (should be < 2MB)`,
        suggestion: "Compress images, minify JS/CSS, remove unused code",
      });
    }

    if (result.scores.RequestCount === "poor") {
      result.issues.push({
        type: "RequestCount",
        severity: "low",
        message: `${result.metrics.RequestCount} requests (should be < 50)`,
        suggestion: "Bundle resources, use sprites, lazy load non-critical resources",
      });
    }

    if (result.metrics.DOMElements > 1500) {
      result.issues.push({
        type: "DOMSize",
        severity: "low",
        message: `DOM has ${result.metrics.DOMElements} elements (recommended < 1500)`,
        suggestion: "Simplify page structure, use virtualization for long lists",
      });
    }

    // Overall status
    const hasHighSeverity = result.issues.some(i => i.severity === "high");
    const hasMediumSeverity = result.issues.some(i => i.severity === "medium");
    result.status = hasHighSeverity ? "poor" : hasMediumSeverity ? "needs-improvement" : "good";

    // Calculate overall score (0-100)
    const scoreValues = { good: 100, "needs-improvement": 50, poor: 0, unknown: 50 };
    const coreMetrics = ["LCP", "CLS", "FCP", "TTFB"];
    const avgScore = coreMetrics.reduce((sum, m) => sum + scoreValues[result.scores[m] || "unknown"], 0) / coreMetrics.length;
    result.overallScore = Math.round(avgScore);

  } catch (err) {
    result.status = "error";
    result.error = err?.message || String(err);
  } finally {
    await page.close();
  }

  return result;
}

/**
 * Test performance of multiple pages
 */
export async function testPerformance(urls, options = {}) {
  const results = [];
  let browser = null;

  console.log(`[FlowAI] Starting performance testing for ${urls.length} pages`);

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

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[FlowAI] Testing performance ${i + 1}/${urls.length}: ${url}`);
      
      const result = await testPagePerformance(context, url);
      results.push(result);
    }

    await context.close();

  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Summary
  const summary = {
    total: results.length,
    good: results.filter(r => r.status === "good").length,
    needsImprovement: results.filter(r => r.status === "needs-improvement").length,
    poor: results.filter(r => r.status === "poor").length,
    errors: results.filter(r => r.status === "error").length,
    averageScore: Math.round(
      results.filter(r => r.overallScore).reduce((sum, r) => sum + r.overallScore, 0) / 
      results.filter(r => r.overallScore).length || 0
    ),
    averageMetrics: {
      LCP: Math.round(results.reduce((sum, r) => sum + (r.metrics?.LCP || 0), 0) / results.length),
      FCP: Math.round(results.reduce((sum, r) => sum + (r.metrics?.FCP || 0), 0) / results.length),
      CLS: parseFloat((results.reduce((sum, r) => sum + (r.metrics?.CLS || 0), 0) / results.length).toFixed(3)),
      TTFB: Math.round(results.reduce((sum, r) => sum + (r.metrics?.TTFB || 0), 0) / results.length),
      PageSize: Math.round(results.reduce((sum, r) => sum + (r.metrics?.PageSize || 0), 0) / results.length),
    },
  };

  console.log(`[FlowAI] Performance testing complete: ${summary.good} good, ${summary.needsImprovement} needs improvement, ${summary.poor} poor`);

  return {
    results,
    summary,
    thresholds: THRESHOLDS,
  };
}

