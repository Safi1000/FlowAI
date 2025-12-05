import { chromium } from "playwright";

export async function executeWorkflows(workflows = [], { headless = true } = {}) {
  let browser = null;
  const results = [];
  try {
    try {
      browser = await chromium.launch({ headless, channel: "msedge" });
    } catch {
      browser = await chromium.launch({ headless });
    }

    for (const wf of workflows) {
      const page = await browser.newPage();
      const wfResult = { id: wf.id || "workflow", goal: wf.goal || "", steps: [], success: true };
      for (const step of wf.steps || []) {
        const stepResult = { page: step.page, action: step.action || "visit", status: "pending" };
        try {
          await page.goto(step.page, { waitUntil: "domcontentloaded", timeout: 15000 });
          stepResult.status = "ok";
        } catch (err) {
          stepResult.status = "error";
          stepResult.error = err?.message || String(err);
          wfResult.success = false;
          wfResult.failedStep = step.page;
          break;
        }
        wfResult.steps.push(stepResult);
      }
      results.push(wfResult);
      await page.close();
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  const stats = {
    total: results.length,
    passed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };

  return { results, stats };
}


