/**
 * Responsive Testing - Test pages at different viewport sizes
 * Takes screenshots and checks for layout issues
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";

// Common device viewports
const VIEWPORTS = {
  mobile: { width: 375, height: 667, name: "Mobile", device: "iPhone SE" },
  tablet: { width: 768, height: 1024, name: "Tablet", device: "iPad Mini" },
  desktop: { width: 1440, height: 900, name: "Desktop", device: "Laptop" },
};

// Screenshot output directory
const SCREENSHOT_DIR = path.join(process.cwd(), "screenshots");

/**
 * Ensure screenshot directory exists
 */
function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

/**
 * Generate a safe filename from URL
 */
function urlToFilename(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\//g, "_").replace(/^_/, "") || "home";
    return `${urlObj.hostname}_${pathname}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  } catch {
    return "page_" + Date.now();
  }
}

/**
 * Test a single page at multiple viewports
 */
async function testPageResponsive(page, url, viewports = VIEWPORTS) {
  const results = {
    url,
    viewports: {},
    issues: [],
    screenshots: {},
  };

  for (const [key, viewport] of Object.entries(viewports)) {
    console.log(`[FlowAI] Testing ${url} at ${viewport.name} (${viewport.width}x${viewport.height})`);

    try {
      // Set viewport
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navigate to page
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1000); // Let animations settle

      // Take screenshot
      const filename = `${urlToFilename(url)}_${key}.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Analyze the page at this viewport
      const analysis = await page.evaluate((vp) => {
        const issues = [];
        const body = document.body;
        const html = document.documentElement;

        // Check for horizontal overflow
        const pageWidth = Math.max(body.scrollWidth, html.scrollWidth);
        if (pageWidth > vp.width + 20) {
          issues.push({
            type: "horizontal_overflow",
            severity: "high",
            message: `Page content (${pageWidth}px) exceeds viewport width (${vp.width}px)`,
          });
        }

        // Check for elements overflowing viewport
        const allElements = document.querySelectorAll("*");
        let overflowingElements = 0;
        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          if (rect.right > vp.width + 10 && rect.width > 0) {
            overflowingElements++;
          }
        }
        if (overflowingElements > 0) {
          issues.push({
            type: "elements_overflow",
            severity: "medium",
            message: `${overflowingElements} elements extend beyond viewport`,
          });
        }

        // Check for tiny text (less than 12px)
        const textElements = document.querySelectorAll("p, span, a, li, td, th, label, div");
        let tinyTextCount = 0;
        for (const el of textElements) {
          const style = window.getComputedStyle(el);
          const fontSize = parseFloat(style.fontSize);
          if (fontSize < 12 && el.textContent?.trim().length > 0) {
            tinyTextCount++;
          }
        }
        if (tinyTextCount > 5) {
          issues.push({
            type: "tiny_text",
            severity: "low",
            message: `${tinyTextCount} elements have text smaller than 12px`,
          });
        }

        // Check for touch target sizes on mobile
        if (vp.width < 500) {
          const clickables = document.querySelectorAll("a, button, input, select, textarea, [onclick]");
          let smallTargets = 0;
          for (const el of clickables) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
              smallTargets++;
            }
          }
          if (smallTargets > 3) {
            issues.push({
              type: "small_touch_targets",
              severity: "medium",
              message: `${smallTargets} clickable elements are smaller than 44x44px (recommended touch target size)`,
            });
          }
        }

        // Check for fixed elements that might cause issues
        const fixedElements = document.querySelectorAll("[style*='position: fixed'], [style*='position:fixed']");
        const computedFixed = [...document.querySelectorAll("*")].filter(el => {
          return window.getComputedStyle(el).position === "fixed";
        });
        if (computedFixed.length > 3) {
          issues.push({
            type: "many_fixed_elements",
            severity: "low",
            message: `${computedFixed.length} fixed position elements detected`,
          });
        }

        // Check images without responsive sizing
        const images = document.querySelectorAll("img");
        let nonResponsiveImages = 0;
        for (const img of images) {
          const style = window.getComputedStyle(img);
          const hasMaxWidth = style.maxWidth && style.maxWidth !== "none";
          const hasWidth100 = style.width === "100%";
          const rect = img.getBoundingClientRect();
          if (rect.width > vp.width && !hasMaxWidth && !hasWidth100) {
            nonResponsiveImages++;
          }
        }
        if (nonResponsiveImages > 0) {
          issues.push({
            type: "non_responsive_images",
            severity: "medium",
            message: `${nonResponsiveImages} images overflow the viewport`,
          });
        }

        // Get page metrics
        return {
          issues,
          metrics: {
            pageWidth,
            pageHeight: Math.max(body.scrollHeight, html.scrollHeight),
            elementCount: allElements.length,
            imageCount: images.length,
          },
        };
      }, viewport);

      results.viewports[key] = {
        ...viewport,
        screenshot: `/screenshots/${filename}`,
        issues: analysis.issues,
        metrics: analysis.metrics,
        status: analysis.issues.length === 0 ? "pass" : 
                analysis.issues.some(i => i.severity === "high") ? "fail" : "warning",
      };

      results.issues.push(...analysis.issues.map(i => ({ ...i, viewport: key })));
      results.screenshots[key] = `/screenshots/${filename}`;

    } catch (err) {
      results.viewports[key] = {
        ...viewport,
        status: "error",
        error: err?.message || String(err),
      };
    }
  }

  // Overall status
  const hasHighSeverity = results.issues.some(i => i.severity === "high");
  const hasMediumSeverity = results.issues.some(i => i.severity === "medium");
  results.status = hasHighSeverity ? "fail" : hasMediumSeverity ? "warning" : "pass";

  return results;
}

/**
 * Test multiple pages for responsive design
 */
export async function testResponsive(urls, options = {}) {
  const { viewports = VIEWPORTS } = options;
  
  ensureScreenshotDir();
  
  const results = [];
  let browser = null;

  console.log(`[FlowAI] Starting responsive testing for ${urls.length} pages`);

  try {
    // Launch browser
    try {
      browser = await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      browser = await chromium.launch({ headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[FlowAI] Testing page ${i + 1}/${urls.length}: ${url}`);
      
      try {
        const result = await testPageResponsive(page, url, viewports);
        results.push(result);
      } catch (err) {
        results.push({
          url,
          status: "error",
          error: err?.message || String(err),
          viewports: {},
          issues: [],
          screenshots: {},
        });
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
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === "pass").length,
    warnings: results.filter(r => r.status === "warning").length,
    failed: results.filter(r => r.status === "fail").length,
    errors: results.filter(r => r.status === "error").length,
  };

  console.log(`[FlowAI] Responsive testing complete: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed`);

  return {
    results,
    summary,
    viewportsTested: Object.keys(viewports),
  };
}

/**
 * Get available screenshots
 */
export function getScreenshots() {
  ensureScreenshotDir();
  try {
    const files = fs.readdirSync(SCREENSHOT_DIR);
    return files.filter(f => f.endsWith(".png")).map(f => `/screenshots/${f}`);
  } catch {
    return [];
  }
}

/**
 * Clear all screenshots
 */
export function clearScreenshots() {
  ensureScreenshotDir();
  try {
    const files = fs.readdirSync(SCREENSHOT_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, file));
    }
    return { cleared: files.length };
  } catch (err) {
    return { error: err?.message };
  }
}

