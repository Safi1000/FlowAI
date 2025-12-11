import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { crawlWebsiteIntelligent } from "./services/crawler.js";
import { detectFormsFromCrawl } from "./services/workflowDetection.js";
import { testForms, extractPageFormData, getAIFormFillPlan, dismissBlockingOverlays } from "./services/formTester.js";
import { chromium } from "playwright";
import { testLinks } from "./services/linkTester.js";
import { testResponsive, getScreenshots, clearScreenshots } from "./services/responsiveTester.js";
import { testPerformance } from "./services/performanceTester.js";
import { detectWorkflows, executeWorkflow, discoverWorkflows } from "./services/workflowEngine.js";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// Serve screenshots as static files
app.use("/screenshots", express.static(path.join(process.cwd(), "screenshots")));


app.post("/api/intelligent-crawl", async (req, res) => {
  const { url, maxDepth = 3, maxPages = 50 } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  try {
    const result = await crawlWebsiteIntelligent(url, Number(maxDepth), Number(maxPages));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/detect-forms", async (req, res) => {
  const { crawlData } = req.body || {};
  if (!crawlData || !Array.isArray(crawlData?.results)) {
    return res.status(400).json({ error: "Missing crawl results" });
  }
  try {
    const detection = await detectFormsFromCrawl(crawlData);
    res.json(detection);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Get form fill plan without executing (for preview/customization)
app.post("/api/get-form-plan", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  
  let browser = null;
  let page = null;
  
  try {
    console.log(`[FlowAI] Getting form plan for: ${url}`);
    
    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    
    // Navigate to the form page (use domcontentloaded for JS-heavy sites)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for networkidle with shorter timeout (optional, don't fail if it times out)
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {
      // Continue even if networkidle times out - page may still be usable
    }
    
    // Scroll to trigger lazy loading, then wait for forms to render
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    
    // Dismiss any blocking overlays
    await dismissBlockingOverlays(page);
    
    // Extract form data
    const formData = await extractPageFormData(page);
    
    if (!formData.forms || formData.forms.length === 0) {
      return res.status(400).json({ error: "No forms found on page" });
    }
    
    // Get AI plan for filling the form
    const aiPlan = await getAIFormFillPlan(formData);
    
    if (!aiPlan || !aiPlan.fillActions) {
      return res.status(500).json({ error: "AI could not generate form fill plan" });
    }
    
    // Return the plan with form metadata
    res.json({
      url,
      title: formData.title,
      formData: {
        inputs: formData.forms[0]?.inputs || [],
        buttons: formData.forms[0]?.buttons || [],
      },
      aiPlan: {
        fillActions: aiPlan.fillActions,
        submitSelector: aiPlan.submitSelector,
        submitDescription: aiPlan.submitDescription,
      },
    });
    
  } catch (err) {
    console.error(`[FlowAI] Error getting form plan:`, err?.message);
    res.status(500).json({ error: err?.message || String(err) });
  } finally {
    if (page) {
      try { await page.context().close(); } catch {}
    }
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
});

app.post("/api/test-forms", async (req, res) => {
  const { formPages, customPlan } = req.body || {};
  if (!Array.isArray(formPages)) {
    return res.status(400).json({ error: "Missing formPages array" });
  }
  try {
    const results = await testForms(formPages, { customPlan });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/test-links", async (req, res) => {
  const { crawlData, testExternal = false, maxLinks = 100 } = req.body || {};
  if (!crawlData || !Array.isArray(crawlData?.results)) {
    return res.status(400).json({ error: "Missing crawl results" });
  }
  try {
    const results = await testLinks(crawlData, { testExternal, maxLinks });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/test-responsive", async (req, res) => {
  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Missing urls array" });
  }
  try {
    const results = await testResponsive(urls);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/screenshots", (req, res) => {
  try {
    const screenshots = getScreenshots();
    res.json({ screenshots });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.delete("/api/screenshots", (req, res) => {
  try {
    const result = clearScreenshots();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/test-performance", async (req, res) => {
  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Missing urls array" });
  }
  try {
    const results = await testPerformance(urls);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// New intelligent workflow discovery endpoint
app.post("/api/discover-workflows", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  try {
    console.log(`[FlowAI] Discovering workflows for: ${url}`);
    const result = await discoverWorkflows({ url });
    res.json(result);
  } catch (err) {
    console.error(`[FlowAI] Workflow discovery error:`, err?.message);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Legacy detect-workflows endpoint (kept for backward compatibility)
app.post("/api/detect-workflows", async (req, res) => {
  const { url, maxSteps = 12, goal = "checkout" } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  try {
    const result = await detectWorkflows({ url, maxSteps: Number(maxSteps), goal });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/execute-workflow", async (req, res) => {
  const { url, pageUrl, steps } = req.body || {};
  console.log(`[FlowAI] Execute workflow request: ${steps?.length || 0} steps for ${pageUrl || url}`);
  
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    console.log(`[FlowAI] No steps provided in request`);
    return res.status(400).json({ error: "Missing workflow steps" });
  }
  try {
    // Pass pageUrl to execute workflow on the correct page
    const result = await executeWorkflow({ url, pageUrl, steps });
    console.log(`[FlowAI] Execution complete, returning result: ${result.status}`);
    res.json(result);
  } catch (err) {
    console.error(`[FlowAI] Execute workflow error:`, err?.message);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



