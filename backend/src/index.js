import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { crawlWebsiteIntelligent } from "./services/crawler.js";
import { generateAdaptiveWorkflows } from "./services/adaptiveWorkflowGenerator.js";
import { generateAIWorkflows } from "./services/aiWorkflowGenerator.js";

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


