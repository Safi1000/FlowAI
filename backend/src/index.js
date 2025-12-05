import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { crawlWebsiteIntelligent } from "./services/crawler.js";
import { generateAdaptiveWorkflows } from "./services/adaptiveWorkflowGenerator.js";
import { generateAIWorkflows } from "./services/aiWorkflowGenerator.js";
import { detectWorkflowsFromCrawl } from "./services/workflowDetection.js";
import { generateWorkflowsFromDetection } from "./services/workflowGeneration.js";
import { executeWorkflows } from "./services/workflowExecution.js";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));


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

app.post("/api/detect-workflows", async (req, res) => {
  const { crawlData } = req.body || {};
  if (!crawlData || !Array.isArray(crawlData?.results)) {
    return res.status(400).json({ error: "Missing crawl results" });
  }
  try {
    const detection = detectWorkflowsFromCrawl(crawlData);
    res.json(detection);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/generate-workflows", async (req, res) => {
  const { detection } = req.body || {};
  if (!detection || !Array.isArray(detection?.nodes) || !Array.isArray(detection?.edges)) {
    return res.status(400).json({ error: "Missing detection data" });
  }
  try {
    const generated = await generateWorkflowsFromDetection(detection);
    res.json(generated);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/execute-workflows", async (req, res) => {
  const { workflows } = req.body || {};
  if (!Array.isArray(workflows)) {
    return res.status(400).json({ error: "Missing workflows" });
  }
  try {
    const execResult = await executeWorkflows(workflows);
    res.json(execResult);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/adaptive-workflows", async (req, res) => {
  const { crawlData } = req.body || {};
  if (!crawlData || !Array.isArray(crawlData?.results)) {
    return res.status(400).json({ error: "Missing crawl results" });
  }
  try {
    const wf = generateAdaptiveWorkflows(crawlData);
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post("/api/ai-workflows", async (req, res) => {
  try {
    const data = await generateAIWorkflows(req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


