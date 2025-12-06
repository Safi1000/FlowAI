import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { crawlWebsiteIntelligent } from "./services/crawler.js";
import { detectFormsFromCrawl } from "./services/workflowDetection.js";
import { testForms } from "./services/formTester.js";
import { testLinks } from "./services/linkTester.js";
import { testResponsive, getScreenshots, clearScreenshots } from "./services/responsiveTester.js";
import { testPerformance } from "./services/performanceTester.js";

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
    const detection = detectFormsFromCrawl(crawlData);
    res.json(detection);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/test-forms", async (req, res) => {
  const { formPages } = req.body || {};
  if (!Array.isArray(formPages)) {
    return res.status(400).json({ error: "Missing formPages array" });
  }
  try {
    const results = await testForms(formPages);
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

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



