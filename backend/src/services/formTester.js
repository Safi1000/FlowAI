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

// AI-driven overlay/popup detection and dismissal
export async function dismissBlockingOverlays(page) {
  try {
    // Extract information about potential overlays from the page
    const overlayData = await page.evaluate(() => {
      // Find elements that might be overlays (positioned fixed/absolute, high z-index, covering viewport)
      const potentialOverlays = [];
      const allElements = document.querySelectorAll('*');
      
      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        // Check if element looks like an overlay (fixed/absolute position, covers significant area)
        const isOverlayLike = 
          (style.position === 'fixed' || style.position === 'absolute') &&
          rect.width > window.innerWidth * 0.3 &&
          rect.height > window.innerHeight * 0.2 &&
          parseInt(style.zIndex) > 100;
        
        if (isOverlayLike && style.display !== 'none' && style.visibility !== 'hidden') {
          // Get buttons/clickable elements inside this overlay
          const buttons = [...el.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')]
            .slice(0, 10)
            .map(btn => ({
              text: (btn.textContent || btn.value || '').trim().slice(0, 50),
              tag: btn.tagName.toLowerCase(),
              id: btn.id || null,
              className: btn.className || null,
            }));
          
          if (buttons.length > 0) {
            potentialOverlays.push({
              id: el.id || null,
              className: el.className || null,
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').slice(0, 200),
              buttons,
            });
          }
        }
      }
      
      return potentialOverlays.slice(0, 3); // Limit to top 3 potential overlays
    });
    
    if (overlayData.length === 0) {
      console.log(`[FlowAI] No blocking overlays detected`);
      return false;
    }
    
    console.log(`[FlowAI] Found ${overlayData.length} potential overlay(s), asking AI to analyze...`);
    
    // Ask AI to identify if there's a blocking overlay and how to dismiss it
    const prompt = `You are analyzing a webpage to detect blocking overlays (like cookie banners, consent dialogs, popups).

POTENTIAL OVERLAYS FOUND:
${JSON.stringify(overlayData, null, 2)}

TASK: Determine if any of these is a blocking overlay that needs to be dismissed before interacting with the page.

If there IS a blocking overlay:
- Identify which button dismisses/accepts/closes it
- Return the button text that should be clicked

If there is NO blocking overlay (just normal page elements):
- Return null

RESPOND WITH ONLY THIS JSON (no other text):
{
  "hasOverlay": true/false,
  "dismissButtonText": "exact button text to click" or null,
  "reason": "brief explanation"
}`;

    const response = await callGroq(prompt, null);
    const analysis = parseJsonSafe(response);
    
    if (analysis && analysis.hasOverlay && analysis.dismissButtonText) {
      console.log(`[FlowAI] AI identified overlay, dismissing with button: "${analysis.dismissButtonText}"`);
      
      // Find and click the button with matching text
      const clicked = await page.evaluate((buttonText) => {
        const buttons = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
        for (const btn of buttons) {
          const text = (btn.textContent || btn.value || '').trim().toLowerCase();
          if (text.includes(buttonText.toLowerCase())) {
            btn.click();
            return true;
          }
        }
        return false;
      }, analysis.dismissButtonText);
      
      if (clicked) {
        await page.waitForTimeout(500);
        console.log(`[FlowAI] Overlay dismissed`);
        return true;
      }
    } else {
      console.log(`[FlowAI] AI determined no blocking overlay present`);
    }
    
    return false;
  } catch (err) {
    console.log(`[FlowAI] Overlay detection error: ${err?.message}`);
    return false;
  }
}

// Extract form elements from page using Playwright
export async function extractPageFormData(page) {
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
        const isSelect = el.tagName.toLowerCase() === "select";
        const isCheckbox = el.type === "checkbox";
        const isRadio = el.type === "radio";
        
        // For select elements, extract available options
        const options = isSelect
          ? Array.from(el.options)
              .filter(o => o.value) // Skip empty placeholder options
              .slice(0, 15) // Limit to prevent huge payloads
              .map(o => ({ value: o.value, text: o.textContent?.trim() || o.value }))
          : undefined;
        
        // For checkbox/radio, build a more specific selector using value
        let selector = null;
        if (el.id) {
          selector = `#${el.id}`;
        } else if (isCheckbox || isRadio) {
          // For checkbox/radio without id, use name + value for specificity
          selector = el.name && el.value 
            ? `[name="${el.name}"][value="${el.value}"]`
            : el.name ? `[name="${el.name}"]` : null;
        } else {
          selector = el.name ? `[name="${el.name}"]` : null;
        }
        
        // Checkboxes/radios are often CSS-hidden (0x0) but still interactable
        // Check if element or its label is visible
        const labelRect = el.labels?.[0]?.getBoundingClientRect();
        const isVisible = (rect.width > 0 && rect.height > 0) || 
                          (labelRect && labelRect.width > 0 && labelRect.height > 0) ||
                          (isCheckbox || isRadio); // Always include checkbox/radio if they have a selector
        
        return {
          tag: el.tagName.toLowerCase(),
          type: isSelect ? "select" : (el.type || "text"),
          name: el.name || el.id || "",
          id: el.id || "",
          value: (isCheckbox || isRadio) ? (el.value || "") : undefined, // Checkbox/radio value
          checked: (isCheckbox || isRadio) ? el.checked : undefined, // Current checked state
          placeholder: el.placeholder || "",
          label: el.labels?.[0]?.textContent?.trim() || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          required: el.required || el.getAttribute("aria-required") === "true",
          visible: isVisible,
          selector,
          options, // Available options for select elements
        };
      }).filter(inp => inp.visible && inp.selector);

      const buttons = Array.from(container.querySelectorAll(
        'button, input[type="submit"], input[type="button"], [role="button"]'
      )).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        // Build selector: prefer ID, then construct one based on tag and position
        let selector = null;
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.type === "submit") {
          selector = 'input[type="submit"]';
        } else if (el.tagName.toLowerCase() === "button") {
          // Use button text or index for uniqueness
          const text = (el.textContent || "").trim().toLowerCase();
          if (text) {
            selector = `button:has-text("${text.slice(0, 30)}")`;
          } else {
            selector = `form button:nth-of-type(${idx + 1})`;
          }
        }
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || "",
          text: el.textContent?.trim() || el.value || "",
          id: el.id || "",
          visible: rect.width > 0 && rect.height > 0,
          selector,
        };
      }).filter(btn => btn.visible && btn.selector);

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
export async function getAIFormFillPlan(formData) {
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
- For select/dropdown: I have provided the available "options" array for each select field. Choose the most appropriate option based on the field's label/context. Use the exact "value" from the options array (NOT the text). Pick an option that makes sense for the form context.
- For checkbox fields: Return value as "true" to check or "false" to leave unchecked. Analyze the checkbox's label and the form's purpose to decide which checkboxes to check. For checkbox groups (multiple checkboxes with related purpose), select the ones that make sense for a realistic form submission.
- For radio buttons: Return value as "true" for the one option to select. Only one radio button in a group should be "true".
- For any other field: infer from the label/placeholder what data to use

Identify which button triggers the form's primary action. Analyze the form context (page title, URL, input fields) to determine which button executes the form. It could be any action verb like "Submit", "Send", "Flip", "Generate", "Calculate", "Search", "Go", "Apply", "Create", etc. Pick the button that makes the form do its intended function based on context.

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

// Ask AI to correct form values based on validation errors
async function getAICorrectedValues(originalPlan, validationErrors, formData) {
  const prompt = `A form submission failed with validation errors. Analyze the errors and provide corrected values.

ORIGINAL VALUES THAT WERE ENTERED:
${JSON.stringify(originalPlan.fillActions, null, 2)}

VALIDATION ERRORS SHOWN ON THE PAGE:
${validationErrors}

FORM CONTEXT:
- Page: ${formData.title}
- URL: ${formData.url}

YOUR TASK:
Understand what each validation error means and fix the corresponding field value.
Common fixes include:
- Phone number format issues: adjust to match expected format (e.g., remove country code, add/remove dashes)
- Email format issues: ensure valid email format
- Required field: provide a value if missing
- Character limits: shorten or lengthen text as needed
- Invalid characters: remove special characters if not allowed

IMPORTANT: Only modify fields that have errors. Keep other fields unchanged.

RESPOND WITH ONLY THIS JSON (no other text):
{
  "corrections": [
    { "selector": "CSS_SELECTOR", "value": "CORRECTED_VALUE", "description": "what was fixed" }
  ],
  "explanation": "brief explanation of what was corrected"
}`;

  try {
    const response = await callGroq(prompt, null);
    const result = parseJsonSafe(response);
    if (result && Array.isArray(result.corrections)) {
      console.log(`[FlowAI] AI suggested ${result.corrections.length} corrections: ${result.explanation}`);
      return result;
    }
  } catch (err) {
    console.error("[FlowAI] AI correction failed:", err?.message);
  }
  return null;
}

// Extract validation error messages from the page
async function extractValidationErrors(page) {
  try {
    const errors = await page.evaluate(() => {
      const errorMessages = [];
      
      // Look for elements that commonly contain validation errors
      // Using broad selectors - AI will interpret the content
      const errorElements = document.querySelectorAll([
        '[class*="error"]',
        '[class*="invalid"]',
        '[class*="validation"]',
        '[class*="warning"]',
        '[role="alert"]',
        '[aria-invalid="true"]',
        '.error',
        '.invalid',
        '.field-error',
        '.form-error',
        '.validation-message',
      ].join(', '));
      
      for (const el of errorElements) {
        const text = el.textContent?.trim();
        // Filter out empty or very short messages, and common false positives
        if (text && text.length > 3 && text.length < 200) {
          // Avoid duplicates
          if (!errorMessages.includes(text)) {
            errorMessages.push(text);
          }
        }
      }
      
      // Also check for inputs with validation attributes that failed
      const invalidInputs = document.querySelectorAll('input:invalid, select:invalid, textarea:invalid');
      for (const input of invalidInputs) {
        const name = input.name || input.id || input.placeholder || 'Field';
        const validationMsg = input.validationMessage;
        if (validationMsg) {
          const msg = `${name}: ${validationMsg}`;
          if (!errorMessages.includes(msg)) {
            errorMessages.push(msg);
          }
        }
      }
      
      return errorMessages;
    });
    
    if (errors && errors.length > 0) {
      return errors.join('\n');
    }
  } catch (err) {
    console.warn("[FlowAI] Error extracting validation errors:", err?.message);
  }
  return null;
}

// Ask AI to analyze the result after form submission
async function getAIResultAnalysis(beforeState, afterState) {
  const beforeText = (beforeState.pageText || "").trim();
  const afterText = (afterState.pageText || "").trim();
  const urlChanged = beforeState.url !== afterState.url;
  
  // Compute what text is NEW (appeared after submission)
  // Simple approach: find text in afterText that wasn't in beforeText
  const beforeLines = new Set(beforeText.split('\n').map(l => l.trim()).filter(l => l.length > 5));
  const afterLines = afterText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
  const newLines = afterLines.filter(line => !beforeLines.has(line));
  const newTextContent = newLines.join('\n').slice(0, 1000);
  
  // Also check if text was removed (form might have disappeared after success)
  const textLengthDiff = afterText.length - beforeText.length;

  const prompt = `You are analyzing the result of a form submission to determine if it succeeded, failed, or is inconclusive.

BEFORE SUBMISSION:
- URL: ${beforeState.url}
- Page Content Summary (first 500 chars):
${beforeText.slice(0, 500)}

AFTER SUBMISSION:
- URL: ${afterState.url}
- URL Changed: ${urlChanged}
- Text Length Change: ${textLengthDiff > 0 ? `+${textLengthDiff}` : textLengthDiff} characters

NEW TEXT THAT APPEARED AFTER SUBMISSION:
${newTextContent || "(No new text detected)"}

YOUR TASK:
Analyze the above data and determine if the form submission was successful.

- PASSED: There is clear evidence of success (thank you message, confirmation, success notification, redirect to thank-you page, form replaced with confirmation)
- FAILED: There are error messages, validation failures, or explicit failure indicators. This includes:
  * Field validation errors (e.g., "Invalid email", "Phone must be 10 digits", "Required field")
  * Format errors (e.g., "Invalid format", "Please enter a valid...")
  * Server errors (e.g., "Error submitting form", "Something went wrong")
- INCONCLUSIVE: The page looks the same, no clear feedback either way

Be strict: if there's no clear evidence in the "NEW TEXT" section or URL change, mark as INCONCLUSIVE.

RESPOND WITH ONLY THIS JSON:
{
  "status": "passed" | "failed" | "inconclusive",
  "confidence": 0.0-1.0,
  "reason": "what specific text/change led to this conclusion",
  // detectedMessages removed
  "isValidationError": true/false (set to true if the failure is due to input validation that could be fixed by adjusting values)
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
  return { status: "inconclusive", confidence: 0, reason: "AI analysis failed" };
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
async function testFormPage(browser, formPage, customPlan = null, dedupContext = null) {
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
    
    // Navigate to the form page (use domcontentloaded for JS-heavy sites like Shopify)
    console.log(`[FlowAI] Testing form at: ${formPage.url}`);
    await page.goto(formPage.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for networkidle with shorter timeout (optional)
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {
      // Continue even if networkidle times out
    }
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    if (!isPageValid(page)) {
      throw new Error("Page closed unexpectedly after navigation");
    }

    // AI-driven overlay/popup dismissal
    await dismissBlockingOverlays(page);

    // Extract form data from page
    console.log(`[FlowAI] Extracting form data...`);
    const formData = await extractPageFormData(page);
    
    // Dedup + filter: skip search-only forms and duplicate newsletters
    if (formData.forms && formData.forms[0]) {
      const formMeta = formData.forms[0];
      const inputs = formMeta.inputs || [];
      
      // Build a normalized signature: action + sorted field identifiers
      const actionSig = (formMeta.action || formPage.url || "").toLowerCase();
      const fieldNames = inputs
        .map((i) => (i.name || i.label || i.placeholder || i.type || "").toLowerCase().trim())
        .filter(Boolean);
      const normFields = Array.from(new Set(fieldNames)).sort();
      const signature = `${actionSig}|${normFields.join("|")}`;
      
      // Heuristic: detect search-only forms (one text/search input)
      const hasOnlyOneField = normFields.length === 1;
      const isSearchField = normFields.some((f) => f.includes("search") || f === "q");
      const isSearchForm = hasOnlyOneField && isSearchField;
      if (isSearchForm) {
        console.log("[FlowAI] Skipping search-only form");
        result.status = "skipped";
        result.reason = "search-only form";
        return result;
      }
      
      // Heuristic: detect newsletter (email-only, no textarea/subject/message)
      const hasTextarea = inputs.some((i) => (i.type || "").toLowerCase() === "textarea");
      const hasSubjectOrMessage = normFields.some((f) => f.includes("subject") || f.includes("message"));
      const hasEmailLike = normFields.some((f) => f.includes("email") || f.includes("mail"));
      const isNewsletter = !hasTextarea && !hasSubjectOrMessage && hasEmailLike && normFields.length <= 2;
      
      if (dedupContext && isNewsletter) {
        const { dedupSignatures, dedupCounts } = dedupContext;
        const currentCount = dedupCounts.get(signature) || 0;
        if (dedupSignatures.has(signature)) {
          dedupCounts.set(signature, currentCount + 1);
          console.log(`[FlowAI] Skipping duplicate newsletter (count=${currentCount + 1})`);
          result.status = "skipped";
          result.reason = "duplicate newsletter";
          return result;
        }
        dedupSignatures.add(signature);
        dedupCounts.set(signature, currentCount + 1);
        result.dedupCount = currentCount + 1;
        console.log(`[FlowAI] Keeping newsletter (first occurrence), signature=${signature}`);
      }
    }
    
    if (!formData.forms || formData.forms.length === 0 || formData.forms[0].inputs.length === 0) {
      result.status = "failed";
      result.error = "No form inputs found on page";
      return result;
    }

    console.log(`[FlowAI] Found ${formData.forms[0].inputs.length} inputs and ${formData.forms[0].buttons.length} buttons`);

    // Use custom plan if provided, otherwise get AI plan
    let aiPlan;
    if (customPlan && customPlan.fillActions) {
      console.log(`[FlowAI] Using custom plan with ${customPlan.fillActions.length} actions`);
      aiPlan = customPlan;
    } else {
      console.log(`[FlowAI] Asking AI for form fill plan...`);
      aiPlan = await getAIFormFillPlan(formData);
    }
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

    // Capture before state - just the raw page text for AI comparison
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
          
          // Get input type for checkbox/radio handling
          const inputType = await element.evaluate(el => el.type?.toLowerCase() || "");
          
          if (tagName === "select") {
            // For select, get available options and choose intelligently
            try {
              const availableOptions = await element.$$eval("option", opts => 
                opts.map(o => o.value).filter(v => v)
              );
              
              // Use AI's choice if it's a valid option, otherwise pick first non-empty
              let valueToSelect = null;
              if (action.value && availableOptions.includes(action.value)) {
                valueToSelect = action.value;
                console.log(`[FlowAI] Using AI-selected option: ${valueToSelect}`);
              } else if (availableOptions.length > 0) {
                valueToSelect = availableOptions[0];
                console.log(`[FlowAI] AI value "${action.value}" not in options, using first: ${valueToSelect}`);
              }
              
              if (valueToSelect) {
                await element.selectOption(valueToSelect);
              }
            } catch (selectErr) {
              console.warn(`[FlowAI] Could not select option for ${action.selector}:`, selectErr?.message);
            }
          } else if (inputType === "checkbox" || inputType === "radio") {
            // For checkbox/radio, check if AI wants it checked
            const shouldCheck = action.value === "true" || action.value === true;
            if (shouldCheck) {
              let checked = false;
              // Try 1: Normal check
              try {
                await element.check({ timeout: 3000 });
                console.log(`[FlowAI] Checked ${inputType}: ${action.selector}`);
                checked = true;
              } catch {
                // Try 2: Force check (for overlays)
                try {
                  await element.check({ force: true });
                  console.log(`[FlowAI] Force checked ${inputType}: ${action.selector}`);
                  checked = true;
                } catch {
                  // Try 3: Click the associated label (for CSS-hidden checkboxes)
                  try {
                    const elementId = await element.evaluate(el => el.id);
                    if (elementId) {
                      const label = await page.$(`label[for="${elementId}"]`);
                      if (label) {
                        await label.click();
                        console.log(`[FlowAI] Clicked label for ${inputType}: ${action.selector}`);
                        checked = true;
                      }
                    }
                  } catch (labelErr) {
                    console.warn(`[FlowAI] Could not check ${inputType} ${action.selector}: all methods failed`);
                  }
                }
              }
              if (!checked) {
                console.warn(`[FlowAI] Failed to check ${inputType}: ${action.selector}`);
              }
            } else {
              console.log(`[FlowAI] Skipping unchecked ${inputType}: ${action.selector}`);
            }
          } else {
            // Regular text input - scroll into view, click and fill
            try {
              // First scroll element into view
              await element.scrollIntoViewIfNeeded();
              await page.waitForTimeout(300);
            } catch {
              // Manual scroll fallback
              try {
                await element.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
                await page.waitForTimeout(300);
              } catch {}
            }
            
            // Try to click and fill
            try {
              await element.click({ timeout: 5000 });
              await element.fill(action.value);
            } catch {
              // Force click fallback
              console.log(`[FlowAI] Normal interaction failed, using force for ${action.selector}`);
              try {
                await element.click({ force: true, timeout: 5000 });
                await element.fill(action.value);
              } catch {
                // Direct fill without click (some inputs don't need click)
                console.log(`[FlowAI] Trying direct fill for ${action.selector}`);
                await page.fill(action.selector, action.value, { timeout: 5000 });
              }
            }
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

    // Check if we should skip submit (from customPlan)
    if (aiPlan.skipSubmit) {
      console.log(`[FlowAI] Skipping submit as requested`);
      result.submitClicked = false;
      result.status = "passed";
      result.aiAnalysis = {
        status: "passed",
        confidence: 1.0,
        reason: "Form filled successfully (submit skipped as requested)",
        // detectedMessages removed
      };
      return result;
    }

    // Click submit button
    if (aiPlan.submitSelector) {
      console.log(`[FlowAI] Clicking submit: ${aiPlan.submitSelector}`);
      try {
        const submitBtn = await page.$(aiPlan.submitSelector);
        if (submitBtn) {
          // Try normal click first, then force click if blocked
          try {
            await submitBtn.click({ timeout: 5000 });
          } catch {
            console.log(`[FlowAI] Normal submit click blocked, using force click`);
            await submitBtn.click({ force: true });
          }
          result.submitClicked = true;
          console.log(`[FlowAI] Submit button clicked`);
        } else {
          console.log(`[FlowAI] Submit button not found, trying fallbacks...`);
          // Fallback: try various submit button selectors
          const fallbackSelectors = [
            'input[type="submit"]',
            'button[type="submit"]',
            '[aria-label*="search" i]:not(input)',
            '[aria-label*="submit" i]:not(input)',
            'button:has(svg)',
            '.search-button',
            '.search-submit',
            'form button:first-of-type',
            'form input[type="button"]:first-of-type',
          ];
          
          for (const sel of fallbackSelectors) {
            try {
              const btn = await page.$(sel);
              if (btn && await btn.isVisible()) {
                try {
                  await btn.click({ timeout: 5000 });
                } catch {
                  await btn.click({ force: true });
                }
                result.submitClicked = true;
                console.log(`[FlowAI] Clicked fallback submit: ${sel}`);
                break;
              }
            } catch {}
          }
          
          // Last resort: Press Enter key (works for search forms)
          if (!result.submitClicked) {
            console.log(`[FlowAI] No submit button found, pressing Enter key...`);
            try {
              await page.keyboard.press('Enter');
              result.submitClicked = true;
              console.log(`[FlowAI] Submitted using Enter key`);
            } catch (enterErr) {
              console.log(`[FlowAI] Enter key failed: ${enterErr?.message}`);
            }
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
    
    // Wait for page to stabilize after submission (for AJAX forms)
    await page.waitForTimeout(3000);

    if (!isPageValid(page)) {
      // Form might have redirected and closed, that could be success
      result.status = "inconclusive";
      result.error = "Page changed after submission - possible redirect";
      return result;
    }

    // Capture after state - just the raw page text for AI comparison
    const afterState = {
      url: page.url(),
      pageText: await page.evaluate(() => document.body?.innerText || ""),
    };

    // Ask AI to analyze the result
    console.log(`[FlowAI] Asking AI to analyze submission result...`);
    let aiAnalysis = await getAIResultAnalysis(beforeState, afterState);
    result.aiAnalysis = aiAnalysis;
    result.status = aiAnalysis.status;

    // If validation failed, try to correct and retry (max 2 attempts)
    let retryCount = 0;
    const maxRetries = 2;
    
    while (result.status === "failed" && retryCount < maxRetries && isPageValid(page)) {
      console.log(`[FlowAI] Form failed, checking for validation errors (attempt ${retryCount + 1}/${maxRetries})...`);
      
      // Extract validation errors from the page
      const validationErrors = await extractValidationErrors(page);
      
      if (!validationErrors) {
        console.log(`[FlowAI] No validation errors found, not retrying`);
        break;
      }
      
      console.log(`[FlowAI] Validation errors found: ${validationErrors.slice(0, 100)}...`);
      
      // Ask AI to suggest corrections
      const corrections = await getAICorrectedValues(aiPlan, validationErrors, formData);
      
      if (!corrections || !corrections.corrections || corrections.corrections.length === 0) {
        console.log(`[FlowAI] AI could not suggest corrections, not retrying`);
        break;
      }
      
      console.log(`[FlowAI] Applying ${corrections.corrections.length} corrections...`);
      
      // Apply corrections to the form
      for (const correction of corrections.corrections) {
        try {
          const element = await page.$(correction.selector);
          if (element) {
            const inputType = await element.evaluate(el => el.type?.toLowerCase() || "");
            
            if (inputType === "checkbox" || inputType === "radio") {
              // For checkbox/radio, handle check/uncheck
              const shouldCheck = correction.value === "true" || correction.value === true;
              if (shouldCheck) {
                await element.check({ force: true }).catch(() => {});
              } else {
                await element.uncheck({ force: true }).catch(() => {});
              }
            } else {
              // For text inputs, clear and refill
              await element.click({ force: true }).catch(() => {});
              await element.fill("");
              await element.fill(correction.value);
            }
            console.log(`[FlowAI] Corrected ${correction.selector}: ${correction.description}`);
            
            // Update the aiPlan with corrected value for future reference
            const planAction = aiPlan.fillActions.find(a => a.selector === correction.selector);
            if (planAction) {
              planAction.value = correction.value;
            }
          }
        } catch (corrErr) {
          console.warn(`[FlowAI] Could not apply correction for ${correction.selector}:`, corrErr?.message);
        }
      }
      
      // Resubmit the form
      console.log(`[FlowAI] Resubmitting form with corrections...`);
      result.submitClicked = false;
      
      try {
        // Try the original submit selector first
        if (aiPlan.submitSelector) {
          const submitBtn = await page.$(aiPlan.submitSelector);
          if (submitBtn) {
            await submitBtn.click({ force: true });
            result.submitClicked = true;
          }
        }
        
        // Fallback to standard selectors
        if (!result.submitClicked) {
          for (const sel of ['button[type="submit"]', 'input[type="submit"]', 'form button:first-of-type']) {
            try {
              const btn = await page.$(sel);
              if (btn && await btn.isVisible()) {
                await btn.click({ force: true });
                result.submitClicked = true;
                break;
              }
            } catch {}
          }
        }
      } catch (submitErr) {
        console.warn(`[FlowAI] Retry submit failed:`, submitErr?.message);
      }
      
      if (!result.submitClicked) {
        console.log(`[FlowAI] Could not resubmit form`);
        break;
      }
      
      // Wait for response
      try {
        await page.waitForLoadState("networkidle", { timeout: 10000 });
      } catch {}
      await page.waitForTimeout(2000);
      
      if (!isPageValid(page)) {
        result.status = "inconclusive";
        result.error = "Page changed after retry submission";
        break;
      }
      
      // Capture new state and re-analyze
      const retryAfterState = {
        url: page.url(),
        pageText: await page.evaluate(() => document.body?.innerText || ""),
      };
      
      console.log(`[FlowAI] Re-analyzing submission result...`);
      aiAnalysis = await getAIResultAnalysis(beforeState, retryAfterState);
      result.aiAnalysis = aiAnalysis;
      result.status = aiAnalysis.status;
      result.retryCount = retryCount + 1;
      
      retryCount++;
      
      if (result.status !== "failed") {
        console.log(`[FlowAI] Retry successful! Status: ${result.status}`);
        break;
      }
    }

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

export async function testForms(formPages, { headless = true, customPlan = null } = {}) {
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

  // Dedup context shared across pages
  const dedupContext = {
    dedupSignatures: new Set(),
    dedupCounts: new Map(),
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
        const result = await testFormPage(browser, formPage, customPlan, dedupContext);
        console.log(`[FlowAI] Form test result: ${result.status} for ${formPage.url}`);

        // Skip adding skipped forms to results
        if (result.status === "skipped") {
          continue;
        }
        
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
