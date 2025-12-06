import { chromium } from "playwright";
import { callGroq } from "./aiClient.js";

/**
 * AI-Powered Form Tester Service
 * Uses LLM to intelligently fill forms and detect success/failure
 */

// Parse JSON safely from AI response
function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {}
    }
    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
  }
  return null;
}

// Extract form elements from page using Playwright
async function extractPageFormData(page) {
  return await page.evaluate(() => {
    const forms = [];
    const formElements = document.querySelectorAll("form");
    
    // If no explicit forms, treat the whole page as implicit form
    const containers = formElements.length > 0 
      ? Array.from(formElements) 
      : [document.body];

    for (const container of containers) {
      const inputs = Array.from(container.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
      )).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || "text",
          name: el.name || el.id || "",
          id: el.id || "",
          placeholder: el.placeholder || "",
          label: el.labels?.[0]?.textContent?.trim() || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          required: el.required || el.getAttribute("aria-required") === "true",
          visible: rect.width > 0 && rect.height > 0,
          selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : null,
        };
      }).filter(inp => inp.visible && inp.selector);

      const buttons = Array.from(container.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"]'
      )).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          text: el.textContent?.trim() || el.value || "",
          id: el.id || "",
          visible: rect.width > 0 && rect.height > 0,
          selector: el.id ? `#${el.id}` : null,
        };
      }).filter(btn => btn.visible);

      if (inputs.length > 0) {
        forms.push({ inputs, buttons });
      }
    }

    return {
      url: window.location.href,
      title: document.title,
      forms,
      pageText: document.body?.innerText?.slice(0, 2000) || "",
    };
  });
}

// Ask AI how to fill the form
async function getAIFormFillPlan(formData) {
  const prompt = `You are an intelligent form testing assistant. Analyze this form and provide realistic test data to fill it.

FORM DATA:
- Page Title: ${formData.title}
- URL: ${formData.url}
- Form Inputs: ${JSON.stringify(formData.forms[0]?.inputs || [], null, 2)}
- Buttons: ${JSON.stringify(formData.forms[0]?.buttons || [], null, 2)}

TASK: Generate test data for each input field. Use realistic fake data appropriate for the field type:
- For email fields: use a realistic test email like "test@example.com"
- For name fields: use realistic names like "John Doe"
- For phone fields: use a valid format phone number like "+1 555-123-4567"
- For message/textarea: write a short realistic message
- For password: use a secure test password like "TestPass123!"
- For select/dropdown: use the value "1" or first available option
- For any other field: infer from the label/placeholder what data to use

Also identify which button to click to submit the form (look for submit buttons or buttons with text like "Send", "Submit", "Contact").

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
{
  "fillActions": [
    { "selector": "CSS_SELECTOR", "value": "VALUE_TO_FILL", "description": "what this field is" }
  ],
  "submitSelector": "CSS_SELECTOR_OF_SUBMIT_BUTTON",
  "submitDescription": "description of submit button"
}`;

  try {
    const response = await callGroq(prompt, null);
    const plan = parseJsonSafe(response);
    if (plan && Array.isArray(plan.fillActions)) {
      return plan;
    }
  } catch (err) {
    console.error("[FlowAI] AI form fill plan failed:", err?.message);
  }
  return null;
}

// Ask AI to analyze the result after form submission
async function getAIResultAnalysis(beforeState, afterState) {
  const prompt = `You are analyzing the result of a form submission test.

BEFORE SUBMISSION:
- URL: ${beforeState.url}
- Page Text Preview: ${beforeState.pageText?.slice(0, 500)}

AFTER SUBMISSION:
- URL: ${afterState.url}
- Page Text Preview: ${afterState.pageText?.slice(0, 1000)}
- URL Changed: ${beforeState.url !== afterState.url}
- New Elements Appeared: ${afterState.newElements?.join(", ") || "none detected"}

TASK: Determine if the form submission was successful or failed.

Look for:
- Success indicators: "thank you", "success", "submitted", "received", "confirmation", redirect to thank-you page
- Failure indicators: "error", "invalid", "required", "failed", "please try again", validation messages
- Neutral: no clear indication either way

RESPOND WITH ONLY THIS JSON FORMAT (no other text):
{
  "status": "passed" | "failed" | "inconclusive",
  "confidence": 0.0-1.0,
  "reason": "explanation of why you determined this status",
  "detectedMessages": ["any success or error messages found"]
}`;

  try {
    const response = await callGroq(prompt, null);
    const analysis = parseJsonSafe(response);
    if (analysis && analysis.status) {
      return analysis;
    }
  } catch (err) {
    console.error("[FlowAI] AI result analysis failed:", err?.message);
  }
  return { status: "inconclusive", confidence: 0, reason: "AI analysis failed", detectedMessages: [] };
}

// Helper to check if page is still valid
function isPageValid(page) {
  try {
    return !page.isClosed();
  } catch {
    return false;
  }
}

// Main function to test a single form page
async function testFormPage(browser, formPage) {
  const result = {
    url: formPage.url,
    title: formPage.title,
    status: "pending",
    aiPlan: null,
    filledFields: [],
    submitClicked: false,
    aiAnalysis: null,
    error: null,
  };

  let page = null;
  
  try {
    // Create a new context and page for each test (isolated)
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    
    page = await context.newPage();
    
    // Set longer timeout for navigation
    page.setDefaultTimeout(30000);
    
    // Navigate to the form page
    console.log(`[FlowAI] Testing form at: ${formPage.url}`);
    await page.goto(formPage.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    if (!isPageValid(page)) {
      throw new Error("Page closed unexpectedly after navigation");
    }

    // Extract form data from page
    console.log(`[FlowAI] Extracting form data...`);
    const formData = await extractPageFormData(page);
    
    if (!formData.forms || formData.forms.length === 0 || formData.forms[0].inputs.length === 0) {
      result.status = "failed";
      result.error = "No form inputs found on page";
      return result;
    }

    console.log(`[FlowAI] Found ${formData.forms[0].inputs.length} inputs and ${formData.forms[0].buttons.length} buttons`);

    // Get AI plan for filling the form
    console.log(`[FlowAI] Asking AI for form fill plan...`);
    const aiPlan = await getAIFormFillPlan(formData);
    result.aiPlan = aiPlan;

    if (!aiPlan || !aiPlan.fillActions || aiPlan.fillActions.length === 0) {
      result.status = "failed";
      result.error = "AI could not generate form fill plan";
      return result;
    }

    console.log(`[FlowAI] AI plan received with ${aiPlan.fillActions.length} actions`);

    if (!isPageValid(page)) {
      throw new Error("Page closed before filling form");
    }

    // Capture before state
    const beforeState = {
      url: page.url(),
      pageText: await page.evaluate(() => document.body?.innerText || ""),
    };

    // Fill the form using AI plan
    console.log(`[FlowAI] Filling ${aiPlan.fillActions.length} fields...`);
    for (const action of aiPlan.fillActions) {
      if (!isPageValid(page)) {
        throw new Error("Page closed during form filling");
      }
      
      try {
        console.log(`[FlowAI] Filling field: ${action.selector} with "${action.value?.slice(0, 20)}..."`);
        const element = await page.$(action.selector);
        
        if (element) {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          
          if (tagName === "select") {
            // For select, try to select by value or first option
            try {
              await element.selectOption({ value: action.value });
            } catch {
              try {
                const options = await element.$$eval("option", opts => opts.map(o => o.value).filter(v => v));
                if (options.length > 0) {
                  await element.selectOption(options[0]);
                }
              } catch (selectErr) {
                console.warn(`[FlowAI] Could not select option for ${action.selector}:`, selectErr?.message);
              }
            }
          } else {
            await element.click();
            await element.fill(action.value);
          }
          
          result.filledFields.push({
            selector: action.selector,
            value: action.value,
            description: action.description,
          });
          
          // Small delay between fields
          await page.waitForTimeout(200);
        } else {
          console.warn(`[FlowAI] Element not found: ${action.selector}`);
        }
      } catch (fieldErr) {
        console.warn(`[FlowAI] Could not fill ${action.selector}:`, fieldErr?.message);
      }
    }

    console.log(`[FlowAI] Filled ${result.filledFields.length} fields successfully`);

    if (!isPageValid(page)) {
      throw new Error("Page closed after filling form");
    }

    // Click submit button
    if (aiPlan.submitSelector) {
      console.log(`[FlowAI] Clicking submit: ${aiPlan.submitSelector}`);
      try {
        const submitBtn = await page.$(aiPlan.submitSelector);
        if (submitBtn) {
          await submitBtn.click();
          result.submitClicked = true;
          console.log(`[FlowAI] Submit button clicked`);
        } else {
          console.log(`[FlowAI] Submit button not found, trying fallbacks...`);
          // Fallback: try common submit selectors
          const fallbackSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Submit")',
            'button:has-text("Send")',
            'button:has-text("Contact")',
            'form button',
          ];
          for (const sel of fallbackSelectors) {
            try {
              const btn = await page.$(sel);
              if (btn && await btn.isVisible()) {
                await btn.click();
                result.submitClicked = true;
                console.log(`[FlowAI] Clicked fallback submit: ${sel}`);
                break;
              }
            } catch {}
          }
        }
      } catch (submitErr) {
        console.warn(`[FlowAI] Submit click failed:`, submitErr?.message);
      }
    }

    if (!result.submitClicked) {
      result.status = "failed";
      result.error = "Could not click submit button";
      return result;
    }

    // Wait for response
    console.log(`[FlowAI] Waiting for form submission response...`);
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {}
    await page.waitForTimeout(3000);

    if (!isPageValid(page)) {
      // Form might have redirected and closed, that could be success
      result.status = "inconclusive";
      result.error = "Page changed after submission - possible redirect";
      return result;
    }

    // Capture after state
    const afterState = {
      url: page.url(),
      pageText: await page.evaluate(() => document.body?.innerText || ""),
      newElements: await page.evaluate(() => {
        const toasts = document.querySelectorAll(
          '[class*="toast"], [class*="snackbar"], [class*="alert"], [class*="notification"], [role="alert"], [role="status"], [class*="success"], [class*="error"], [class*="message"]'
        );
        return Array.from(toasts).map(el => el.textContent?.trim()).filter(Boolean);
      }),
    };

    // Ask AI to analyze the result
    console.log(`[FlowAI] Asking AI to analyze submission result...`);
    const aiAnalysis = await getAIResultAnalysis(beforeState, afterState);
    result.aiAnalysis = aiAnalysis;
    result.status = aiAnalysis.status;

  } catch (err) {
    console.error(`[FlowAI] Form test error:`, err?.message);
    result.status = "error";
    result.error = err?.message || String(err);
  } finally {
    // Clean up page
    if (page) {
      try {
        await page.context().close();
      } catch {}
    }
  }

  return result;
}

export async function testForms(formPages, { headless = true } = {}) {
  if (!formPages || formPages.length === 0) {
    return {
      total: 0,
      passed: [],
      failed: [],
      inconclusive: [],
      errors: [],
      passRate: 0,
    };
  }

  let browser = null;
  const results = {
    total: formPages.length,
    passed: [],
    failed: [],
    inconclusive: [],
    errors: [],
    passRate: 0,
  };

  try {
    // Launch browser with longer timeout
    console.log(`[FlowAI] Launching browser...`);
    try {
      browser = await chromium.launch({ 
        headless, 
        channel: "msedge",
        timeout: 60000,
      });
    } catch {
      browser = await chromium.launch({ 
        headless,
        timeout: 60000,
      });
    }
    console.log(`[FlowAI] Browser launched`);

    // Test each form page sequentially
    for (let i = 0; i < formPages.length; i++) {
      const formPage = formPages[i];
      console.log(`[FlowAI] Testing form ${i + 1}/${formPages.length}: ${formPage.url}`);
      
      try {
        const result = await testFormPage(browser, formPage);
        console.log(`[FlowAI] Form test result: ${result.status} for ${formPage.url}`);
        
        switch (result.status) {
          case "passed":
            results.passed.push(result);
            break;
          case "failed":
            results.failed.push(result);
            break;
          case "inconclusive":
            results.inconclusive.push(result);
            break;
          default:
            results.errors.push(result);
        }
      } catch (err) {
        console.error(`[FlowAI] Unexpected error testing ${formPage.url}:`, err?.message);
        results.errors.push({
          url: formPage.url,
          title: formPage.title,
          status: "error",
          error: err?.message || String(err),
        });
      }
    }

    // Calculate pass rate
    const totalCompleted = results.passed.length + results.failed.length;
    results.passRate = totalCompleted > 0 
      ? Math.round((results.passed.length / totalCompleted) * 100) 
      : 0;

  } finally {
    // Clean up browser
    if (browser) {
      console.log(`[FlowAI] Closing browser...`);
      try {
        await browser.close();
      } catch {}
    }
  }

  console.log(`[FlowAI] Form testing complete. Passed: ${results.passed.length}, Failed: ${results.failed.length}, Inconclusive: ${results.inconclusive.length}, Errors: ${results.errors.length}`);
  return results;
}
