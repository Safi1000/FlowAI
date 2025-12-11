import { chromium } from "playwright";
import { callGroq } from "./aiClient.js";
import { dismissBlockingOverlays } from "./formTester.js";

const DEFAULT_MAX_STEPS = 12;

// Workflow types and their required components
const WORKFLOW_DEFINITIONS = {
  checkout: {
    name: "Checkout",
    description: "Complete a purchase flow",
    requiredIndicators: ["cart", "add to cart", "buy", "checkout", "purchase", "shop"],
    formIndicators: ["payment", "shipping", "billing", "card number", "cvv", "expiry"],
  },
  login: {
    name: "Login",
    description: "Sign into an existing account",
    requiredIndicators: ["login", "sign in", "log in", "email", "username", "password"],
    formIndicators: ["email", "username", "password"],
  },
  registration: {
    name: "Registration",
    description: "Create a new account",
    requiredIndicators: ["register", "sign up", "create account", "join", "get started"],
    formIndicators: ["email", "password", "name", "confirm password"],
  },
  contact: {
    name: "Contact",
    description: "Submit a contact or inquiry form",
    requiredIndicators: ["contact", "get in touch", "reach us", "message", "inquiry", "feedback"],
    formIndicators: ["name", "email", "message", "subject"],
  },
  search: {
    name: "Search",
    description: "Search for content or products",
    requiredIndicators: ["search", "find", "look for", "query"],
    formIndicators: ["search", "query", "keyword"],
  },
  newsletter: {
    name: "Newsletter",
    description: "Subscribe to email updates",
    requiredIndicators: ["newsletter", "subscribe", "updates", "mailing list", "stay informed"],
    formIndicators: ["email"],
  },
  booking: {
    name: "Booking",
    description: "Book or reserve something",
    requiredIndicators: ["book", "reserve", "schedule", "appointment", "reservation"],
    formIndicators: ["date", "time", "name", "email", "phone"],
  },
};

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {}
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
    // Try to find array
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {}
    }
  }
  return null;
}

/**
 * Extract comprehensive page structure for workflow analysis
 */
async function extractPageStructure(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim().toLowerCase();
    const cleanOriginal = (v) => (v || "").replace(/\s+/g, " ").trim();

    // Get all interactive elements
    const buttons = Array.from(
      document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a.btn, a.button, [class*='btn'], [class*='button']")
    ).slice(0, 30).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      text: cleanOriginal(el.textContent || el.value || ""),
      textLower: clean(el.textContent || el.value || ""),
      id: el.id || "",
      name: el.getAttribute("name") || "",
      className: el.className || "",
      href: el.getAttribute("href") || "",
    }));

    const inputs = Array.from(
      document.querySelectorAll("input:not([type='hidden']), select, textarea")
    ).slice(0, 30).map((el) => {
      const isSelect = el.tagName.toLowerCase() === "select";
      // Extract options for select elements
      const options = isSelect 
        ? Array.from(el.options)
            .filter(opt => opt.value) // Skip empty placeholder options
            .slice(0, 10) // Limit options
            .map(opt => ({ value: opt.value, text: opt.textContent?.trim() || opt.value }))
        : undefined;
      
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || (isSelect ? "select" : "text"),
        placeholder: cleanOriginal(el.getAttribute("placeholder") || ""),
        placeholderLower: clean(el.getAttribute("placeholder") || ""),
        label: cleanOriginal(el.labels?.[0]?.textContent || ""),
        labelLower: clean(el.labels?.[0]?.textContent || ""),
        name: el.getAttribute("name") || el.id || "",
        id: el.id || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        options, // Include dropdown options for select elements
      };
    });

    const links = Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 40)
      .map((el) => ({
        text: cleanOriginal(el.textContent || ""),
        textLower: clean(el.textContent || ""),
        href: el.getAttribute("href") || "",
        className: el.className || "",
      }))
      .filter((l) => l.href && !l.href.startsWith("#") && !l.href.startsWith("javascript:"));

    const forms = Array.from(document.querySelectorAll("form")).slice(0, 10).map((form) => {
      const formInputs = Array.from(form.querySelectorAll("input:not([type='hidden']), select, textarea"));
      const formButtons = Array.from(form.querySelectorAll("button, input[type='submit'], input[type='button']"));
      return {
        action: form.action || "",
        method: form.method || "get",
        id: form.id || "",
        className: form.className || "",
        inputTypes: formInputs.map(el => el.type || el.tagName.toLowerCase()),
        inputNames: formInputs.map(el => (el.name || el.id || el.placeholder || "").toLowerCase()),
        buttonTexts: formButtons.map(el => clean(el.textContent || el.value || "")),
      };
    });

    // Get page text content for analysis
    const bodyText = document.body?.innerText || "";
    const textSample = cleanOriginal(bodyText.slice(0, 2000));
    const textLower = clean(bodyText.slice(0, 3000));

    // Check for specific e-commerce indicators
    const hasCart = textLower.includes("cart") || 
                   textLower.includes("basket") ||
                   !!document.querySelector('[class*="cart"], [id*="cart"], [class*="basket"]');
    
    const hasProducts = textLower.includes("add to cart") ||
                       textLower.includes("buy now") ||
                       textLower.includes("add to bag") ||
                       !!document.querySelector('[class*="product"], [class*="item-price"], [class*="add-to-cart"]');

    return {
      url: window.location.href,
      title: document.title || "",
      buttons,
      inputs,
      links,
      forms,
      textSample,
      textLower,
      indicators: {
        hasCart,
        hasProducts,
        hasLoginForm: inputs.some(i => 
          (i.type === "password" || i.nameLower?.includes("password")) &&
          (inputs.some(j => j.type === "email" || j.nameLower?.includes("email") || j.nameLower?.includes("username")))
        ),
        hasSearchBox: inputs.some(i => 
          i.type === "search" || 
          i.nameLower?.includes("search") || 
          i.placeholderLower?.includes("search")
        ),
      },
    };
  });
}

/**
 * Validate if a workflow type is available on the page
 */
function validateWorkflowAvailability(workflowType, pageStructure) {
  const definition = WORKFLOW_DEFINITIONS[workflowType];
  if (!definition) return { available: false, confidence: 0, reason: "Unknown workflow type" };

  const { buttons, inputs, links, forms, textLower, indicators } = pageStructure;

  // Combine all searchable text
  const allButtonText = buttons.map(b => b.textLower).join(" ");
  const allInputText = inputs.map(i => `${i.labelLower} ${i.placeholderLower} ${i.name}`).join(" ");
  const allLinkText = links.map(l => l.textLower).join(" ");
  const formInputNames = forms.flatMap(f => f.inputNames).join(" ");
  const formButtonTexts = forms.flatMap(f => f.buttonTexts).join(" ");
  
  const searchableText = `${textLower} ${allButtonText} ${allInputText} ${allLinkText} ${formInputNames} ${formButtonTexts}`;

  // Count matching indicators
  let matchedRequired = 0;
  let matchedForm = 0;
  const foundIndicators = [];
  const missingIndicators = [];

  for (const indicator of definition.requiredIndicators) {
    if (searchableText.includes(indicator.toLowerCase())) {
      matchedRequired++;
      foundIndicators.push(indicator);
    } else {
      missingIndicators.push(indicator);
    }
  }

  for (const indicator of definition.formIndicators) {
    if (searchableText.includes(indicator.toLowerCase())) {
      matchedForm++;
    }
  }

  // Special checks for specific workflow types
  let specialCheck = true;
  let specialReason = "";

  switch (workflowType) {
    case "checkout":
      // Checkout requires cart/products OR checkout-related buttons/links
      if (!indicators.hasCart && !indicators.hasProducts) {
        const hasCheckoutElements = searchableText.includes("checkout") || 
                                    searchableText.includes("buy now") ||
                                    searchableText.includes("purchase") ||
                                    searchableText.includes("add to cart");
        if (!hasCheckoutElements) {
          specialCheck = false;
          specialReason = "No cart, products, or checkout elements found";
        }
      }
      break;
    case "login":
      // Login requires password field
      const hasPasswordField = inputs.some(i => i.type === "password");
      const hasLoginButton = searchableText.includes("login") || 
                            searchableText.includes("sign in") ||
                            searchableText.includes("log in");
      if (!hasPasswordField && !hasLoginButton) {
        specialCheck = false;
        specialReason = "No password field or login button found";
      }
      break;
    case "registration":
      // Registration needs password + signup indicators
      const hasSignupIndicator = searchableText.includes("sign up") ||
                                 searchableText.includes("register") ||
                                 searchableText.includes("create account") ||
                                 searchableText.includes("join");
      const hasPassword = inputs.some(i => i.type === "password");
      if (!hasSignupIndicator || !hasPassword) {
        specialCheck = false;
        specialReason = "No registration indicators or password field found";
      }
      break;
    case "contact":
      // Contact needs a form with message field
      const hasMessageField = inputs.some(i => 
        i.type === "textarea" || 
        i.name.includes("message") || 
        i.labelLower.includes("message")
      );
      const hasContactIndicator = searchableText.includes("contact") ||
                                  searchableText.includes("get in touch") ||
                                  searchableText.includes("reach us");
      if (!hasMessageField && !hasContactIndicator) {
        specialCheck = false;
        specialReason = "No contact form or message field found";
      }
      break;
    case "newsletter":
      // Newsletter must have subscribe-specific indicators
      // AND should NOT be a full contact form (no message/subject/name fields beyond email)
      const hasSubscribeButton = searchableText.includes("subscribe") || 
                                 searchableText.includes("sign up for updates") ||
                                 searchableText.includes("join our mailing") ||
                                 searchableText.includes("get updates");
      // Check if this is actually a contact form (has message, subject, or multiple non-email fields)
      const isActuallyContactForm = inputs.some(i => 
        i.type === "textarea" || 
        i.name.toLowerCase().includes("message") || 
        i.name.toLowerCase().includes("subject") ||
        i.labelLower?.includes("message") ||
        i.labelLower?.includes("subject")
      );
      // Newsletter forms typically have just email, maybe name - not many other fields
      const nonEmailInputs = inputs.filter(i => 
        i.type !== "email" && 
        !i.name.toLowerCase().includes("email") &&
        i.type !== "submit" &&
        i.type !== "button"
      );
      const tooManyFields = nonEmailInputs.length > 2; // More than email + maybe name = probably not newsletter
      
      if (!hasSubscribeButton || isActuallyContactForm || tooManyFields) {
        specialCheck = false;
        specialReason = "No dedicated newsletter subscription form found (detected contact/inquiry form instead)";
      }
      break;
    case "booking":
      // Booking needs date/time fields OR explicit booking indicators
      const hasDateField = inputs.some(i => 
        i.type === "date" || 
        i.type === "datetime-local" ||
        i.name.toLowerCase().includes("date") ||
        i.labelLower?.includes("date")
      );
      const hasBookingIndicator = searchableText.includes("book now") ||
                                  searchableText.includes("make a reservation") ||
                                  searchableText.includes("schedule appointment") ||
                                  searchableText.includes("reserve");
      // Exclude if this looks like a contact form
      const looksLikeContactForm = inputs.some(i => 
        i.type === "textarea" || 
        i.name.toLowerCase().includes("message")
      ) && !hasDateField;
      
      if ((!hasDateField && !hasBookingIndicator) || looksLikeContactForm) {
        specialCheck = false;
        specialReason = "No booking/reservation form with date fields found";
      }
      break;
  }

  // Calculate confidence score
  const requiredRatio = definition.requiredIndicators.length > 0 
    ? matchedRequired / definition.requiredIndicators.length 
    : 0;
  const formRatio = definition.formIndicators.length > 0 
    ? matchedForm / definition.formIndicators.length 
    : 0;
  
  let confidence = (requiredRatio * 0.6 + formRatio * 0.4) * 100;
  
  // Reduce confidence if special check failed
  if (!specialCheck) {
    confidence = Math.min(confidence, 20);
  }

  // Determine availability
  const available = confidence >= 40 && specialCheck;

  return {
    available,
    confidence: Math.round(confidence),
    reason: available 
      ? `Found indicators: ${foundIndicators.slice(0, 3).join(", ")}` 
      : specialReason || `Missing key indicators for ${definition.name}`,
    foundIndicators,
    missingIndicators: missingIndicators.slice(0, 3),
  };
}

/**
 * Generate intelligent checkout workflow steps
 * Flow: Search → Select Product → Add to Cart → View Cart → Checkout → Fill Required Fields → COD → Place Order
 */
function generateCheckoutSteps(pageStructure) {
  const steps = [];
  let stepIndex = 1;
  
  // Find search input
  const searchInput = pageStructure.inputs.find(i => {
    const name = (i.name || i.id || i.placeholder || "").toLowerCase();
    const type = (i.type || "").toLowerCase();
    return type === "search" || name.includes("search") || name === "q" || name === "query";
  });
  
    // Step 1-2: Search for a product
  if (searchInput) {
    let searchSelector = "";
    if (searchInput.id) {
      searchSelector = `#${searchInput.id}`;
    } else if (searchInput.name) {
      searchSelector = `[name="${searchInput.name}"]`;
    } else {
      searchSelector = `input[type="search"], input[placeholder*="search" i], input[name="q"]`;
    }
    
    steps.push({
      index: stepIndex++,
      action: "fill",
      selector: searchSelector,
      value: "shirt", // Generic product search term
      description: "Search for a product",
    });
    
    steps.push({
      index: stepIndex++,
      action: "submit",
      selector: searchSelector,
      value: "",
      description: "Submit search",
    });
  }
  
  // Step 3: Select first product from results (dynamic - uses common selectors)
    steps.push({
      index: stepIndex++,
      action: "click",
      selector: ".product-card a:first-of-type, .product-item a:first-of-type, [class*='product'] a:first-of-type, .product-grid a:first-of-type, .collection-product a:first-of-type, article a:first-of-type",
      value: "",
      description: "Select first product from results (wait for navigation)",
    });
  
  // Step 4: Add to cart
  steps.push({
    index: stepIndex++,
    action: "click",
    selector: "button[name*='add' i], button[class*='add-to-cart' i], button:has-text('Add to Cart'), button:has-text('Add to Bag'), [class*='add-to-cart'], form[action*='cart'] button[type='submit']",
    value: "",
    description: "Add product to cart",
  });
  
  // Step 5: View cart
  steps.push({
    index: stepIndex++,
    action: "click",
    selector: "a[href*='cart'], button:has-text('View Cart'), button:has-text('Cart'), [class*='cart-icon'], [class*='cart-link'], header a[href*='cart']",
    value: "",
    description: "View shopping cart",
  });
  
  // Step 6: Proceed to checkout
  steps.push({
    index: stepIndex++,
    action: "click",
    selector: "button:has-text('Checkout'), a:has-text('Checkout'), button:has-text('Proceed'), a[href*='checkout'], [class*='checkout-button'], form[action*='checkout'] button",
    value: "",
    description: "Proceed to checkout",
  });
  
  // Steps 7+: Fill checkout form fields
  // Using selectors that target main checkout sections, avoiding footer newsletter forms
  // Prefix selectors with main/form to avoid footer elements
  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "main input[name*='email' i], form[action*='checkout'] input[type='email'], [class*='checkout'] input[type='email'], #checkout input[type='email'], input[autocomplete='email']:not(footer input)",
    value: "testbuyer@example.com",
    description: "Enter email address",
  });
  
  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "main input[name*='first' i], form input[name*='fname' i], [class*='checkout'] input[name*='first' i], input[autocomplete='given-name']",
    value: "Test",
    description: "Enter first name",
  });
  
  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "main input[name*='last' i], form input[name*='lname' i], [class*='checkout'] input[name*='last' i], input[autocomplete='family-name']",
    value: "Buyer",
    description: "Enter last name",
  });
  
  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "main input[name*='address' i]:not([name*='address2']), form input[name*='street' i], [class*='checkout'] input[name*='address' i], input[autocomplete='street-address'], input[autocomplete='address-line1']",
    value: "123 Test Street",
    description: "Enter street address",
  });
  
  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "main input[name*='city' i], form input[name*='city' i], [class*='checkout'] input[name*='city' i], input[autocomplete='address-level2']",
    value: "Test City",
    description: "Enter city",
  });
  
  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "main input[name*='phone' i], form input[name*='tel' i], form input[type='tel'], [class*='checkout'] input[name*='phone' i], input[autocomplete='tel']",
    value: "+1234567890",
    description: "Enter phone number",
  });

  // Billing address handling (best-effort)
  steps.push({
    index: stepIndex++,
    action: "click",
    selector: "input[name*='billing_address_same_as_shipping' i], input[id*='billing_address_same' i], input[id*='billing_same_as_shipping' i], input[name*='use_shipping_address' i]",
    value: "",
    description: "Use shipping address for billing (if available)",
  });

  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "input[name*='billing[address1]' i], input[name*='billing_address[address1]' i], input[name*='billing[address]' i]",
    value: "123 Test Street",
    description: "Enter billing address (if required)",
  });

  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "input[name*='billing[city]' i], input[name*='billing_address[city]' i], input[name*='billing city' i]",
    value: "Test City",
    description: "Enter billing city (if required)",
  });

  steps.push({
    index: stepIndex++,
    action: "fill",
    selector: "input[name*='billing[zip]' i], input[name*='billing[postal]' i], input[name*='billing_address[zip]' i]",
    value: "00000",
    description: "Enter billing postal code (if required)",
  });
  
  // Step: Select Cash on Delivery payment method (if available)
  steps.push({
    index: stepIndex++,
    action: "click",
    selector: "input[value*='cod' i], input[value*='cash' i], label:has-text('Cash on Delivery'), label:has-text('COD'), label:has-text('Pay on Delivery'), [data-payment-method='cod'], input[name*='payment'][value*='cod' i]",
    value: "",
    description: "Select Cash on Delivery payment",
  });
  
  // Step: Place order
  steps.push({
    index: stepIndex++,
    action: "click",
    selector: "button:has-text('Place Order'), button:has-text('Complete Order'), button:has-text('Submit Order'), button:has-text('Pay Now'), button:has-text('Confirm Order'), button[type='submit'][class*='checkout'], form[action*='checkout'] button[type='submit']",
    value: "",
    description: "Place order",
  });
  
  console.log(`[FlowAI] Checkout: Generated ${steps.length} steps (search → product → cart → checkout → place order)`);
  return steps;
}

/**
 * Generate simple 2-step newsletter workflow (no AI needed)
 * Step 1: Fill email input
 * Step 2: Submit (click icon/button or press Enter)
 */
function generateNewsletterSteps(pageStructure) {
  // Find email input in the page
  const emailInput = pageStructure.inputs.find(i => {
    const name = (i.name || i.id || i.placeholder || "").toLowerCase();
    const type = (i.type || "").toLowerCase();
    return type === "email" || name.includes("email") || name.includes("mail") || name.includes("newsletter");
  });
  
  if (!emailInput) {
    console.log("[FlowAI] Newsletter: No email input found");
    return [];
  }
  
  // Build selector for email input
  let emailSelector = "";
  if (emailInput.id) {
    emailSelector = `#${emailInput.id}`;
  } else if (emailInput.name) {
    emailSelector = `[name="${emailInput.name}"]`;
  } else {
    emailSelector = `input[type="email"]`;
  }
  
  const steps = [
    {
      index: 1,
      action: "fill",
      selector: emailSelector,
      value: "test@example.com",
      description: "Enter email address",
    },
    {
      index: 2,
      action: "submit",
      selector: emailSelector,
      value: "",
      description: "Subscribe to newsletter",
    },
  ];
  
  console.log(`[FlowAI] Newsletter: Generated ${steps.length} steps (fill + submit)`);
  return steps;
}

/**
 * Use AI to generate steps for a specific workflow
 */
async function generateWorkflowSteps(workflowType, pageStructure) {
  // Special handling for newsletter - simple 2-step workflow
  if (workflowType === "newsletter") {
    return generateNewsletterSteps(pageStructure);
  }
  
  // Special handling for checkout/cart - intelligent multi-step workflow
  if (workflowType === "checkout" || workflowType === "cart") {
    return generateCheckoutSteps(pageStructure);
  }
  
  const definition = WORKFLOW_DEFINITIONS[workflowType];
  
  // Format inputs with dropdown options
  const inputsDescription = pageStructure.inputs.slice(0, 15).map(i => {
    let desc = `${i.type}:${i.name || i.label || i.placeholder}`;
    if (i.id) desc += ` (id:${i.id})`;
    // Include dropdown options for select elements
    if (i.type === "select" && i.options && i.options.length > 0) {
      desc += ` [OPTIONS: ${i.options.map(o => `"${o.value}"`).join(", ")}]`;
    }
    return desc;
  }).join("; ");

  // Extract business context from page
  const businessContext = pageStructure.textSample.slice(0, 300);
  
  const prompt = `You are an intelligent web automation assistant. Generate specific, executable steps for a "${definition.name}" workflow on this page.

BUSINESS CONTEXT (use this to generate realistic, contextual test data):
${businessContext}

PAGE STRUCTURE:
- URL: ${pageStructure.url}
- Title: ${pageStructure.title}
- Buttons: ${pageStructure.buttons.slice(0, 15).map(b => `"${b.text}" (id:${b.id})`).join(", ")}
- Inputs: ${inputsDescription}
- Links: ${pageStructure.links.slice(0, 10).map(l => `"${l.text}" -> ${l.href}`).join(", ")}
- Forms: ${pageStructure.forms.length} form(s) with inputs: ${pageStructure.forms.flatMap(f => f.inputNames).slice(0, 10).join(", ")}

WORKFLOW: ${definition.name} - ${definition.description}

TASK: Generate 3-8 specific steps to complete this workflow. Each step must have:
- action: "click" | "fill" | "select" | "submit" | "navigate" | "assert"
- selector: A robust CSS selector (prefer #id, [name="..."], or text="..." for buttons)
- value: The value to enter (for fill/select) or text to verify (for assert)
- description: Human-readable description

IMPORTANT RULES:
1. Use REAL selectors based on the elements listed above
2. For buttons, use text="Button Text" selector format
3. For inputs, use #id or [name="fieldname"] format
4. Generate CONTEXTUAL, REALISTIC test data based on the business context above:
   - For name fields: Use realistic names like "Sarah Johnson" or "Michael Chen"
   - For email: Use test@example.com or similar
   - For phone: Use realistic formatted numbers like "+1 (555) 123-4567"
   - For subject fields: Create a RELEVANT subject based on the business (e.g., "Inquiry about Engineering Services" for an engineering company, NOT generic "Test Subject")
   - For message/textarea: Write a realistic, professional inquiry message that relates to the actual business/services shown on the page
   - For company: Use a realistic company name relevant to the industry
5. Only include steps that can actually be performed based on the elements present
6. FOR SELECT/DROPDOWN FIELDS: You MUST use one of the exact option values listed in [OPTIONS: ...]. Do NOT make up values.
7. FOR SEARCH FORMS: Use action "submit" after filling the search input. The system will automatically find the submit button, icon button, or press Enter. Set selector to the search input selector so it can press Enter on it if needed.

RESPOND WITH ONLY THIS JSON (no other text):
{
  "steps": [
    { "action": "...", "selector": "...", "value": "...", "description": "..." }
  ]
}`;

  try {
    const response = await callGroq(prompt, null);
    const parsed = parseJsonSafe(response);
    
    if (parsed && Array.isArray(parsed.steps)) {
      return parsed.steps.map((step, idx) => ({
        index: idx + 1,
        action: step.action || "click",
        selector: step.selector || "",
        value: step.value || "",
        description: step.description || `Step ${idx + 1}`,
      }));
    }
  } catch (err) {
    console.error(`[FlowAI] Error generating steps for ${workflowType}:`, err?.message);
  }
  
  return [];
}

// Keywords to identify workflow-relevant pages in URLs
const WORKFLOW_URL_KEYWORDS = [
  // Login/Auth
  "login", "signin", "sign-in", "log-in", "auth", "authenticate",
  // Registration
  "register", "signup", "sign-up", "join", "create-account", "get-started",
  // Contact
  "contact", "contact-us", "get-in-touch", "reach-us", "support", "help", "feedback", "inquiry",
  // Checkout/Cart
  "cart", "checkout", "basket", "shop", "store", "buy", "purchase", "order",
  // Newsletter
  "subscribe", "newsletter", "updates", "mailing", "email-signup",
  // Booking
  "book", "booking", "reserve", "reservation", "appointment", "schedule",
  // Search
  "search", "find", "browse",
  // Account
  "account", "profile", "my-account", "dashboard",
];

/**
 * Extract all internal links from a page and filter to workflow-relevant ones
 */
async function extractWorkflowRelevantLinks(page, baseUrl) {
  const links = await page.evaluate((base) => {
    const allLinks = Array.from(document.querySelectorAll("a[href]"));
    const baseHost = new URL(base).hostname;
    
    return allLinks
      .map((a) => {
        try {
          const href = a.getAttribute("href") || "";
          // Skip anchors, javascript, mailto, tel
          if (href.startsWith("#") || href.startsWith("javascript:") || 
              href.startsWith("mailto:") || href.startsWith("tel:")) {
            return null;
          }
          // Resolve relative URLs
          const fullUrl = new URL(href, base).href;
          const urlObj = new URL(fullUrl);
          // Only internal links
          if (urlObj.hostname !== baseHost) return null;
          return {
            url: fullUrl,
            text: (a.textContent || "").trim().toLowerCase(),
            path: urlObj.pathname.toLowerCase(),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }, baseUrl);

  // Deduplicate by URL
  const uniqueLinks = [...new Map(links.map(l => [l.url, l])).values()];
  
  // Score each link based on workflow relevance
  const scoredLinks = uniqueLinks.map((link) => {
    let score = 0;
    const pathAndText = `${link.path} ${link.text}`;
    
    for (const keyword of WORKFLOW_URL_KEYWORDS) {
      if (pathAndText.includes(keyword)) {
        score += 10;
      }
    }
    
    // Bonus for short, clean paths (more likely to be main pages)
    if (link.path.split("/").filter(Boolean).length <= 2) {
      score += 5;
    }
    
    return { ...link, score };
  });

  // Sort by score and take top relevant pages
  return scoredLinks
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12); // Max 12 workflow-relevant pages
}

/**
 * Analyze a single page for all workflow types
 */
async function analyzePageForWorkflows(page, pageUrl, pageTitle) {
  const pageStructure = await extractPageStructure(page);
  pageStructure.url = pageUrl;
  pageStructure.title = pageTitle;
  
  const foundWorkflows = [];
  
  for (const [workflowType, definition] of Object.entries(WORKFLOW_DEFINITIONS)) {
    const validation = validateWorkflowAvailability(workflowType, pageStructure);
    
    if (validation.available && validation.confidence >= 40) {
      foundWorkflows.push({
        type: workflowType,
        name: definition.name,
        description: definition.description,
        confidence: validation.confidence,
        reason: validation.reason,
        pageStructure,
      });
    }
  }

  const hasType = (t) => foundWorkflows.some((wf) => wf.type === t);

  // Heuristic newsletter: email-only, <=2 fields, no textarea/subject/password
  const emailInputs = pageStructure.inputs.filter((i) => (i.type || "").toLowerCase() === "email" || (i.nameLower || "").includes("email"));
  const hasTextarea = pageStructure.inputs.some((i) => (i.type || "").toLowerCase() === "textarea");
  const hasSubjectOrMessage = pageStructure.inputs.some((i) => {
    const n = i.nameLower || "";
    const p = i.placeholderLower || "";
    const l = i.labelLower || "";
    return n.includes("subject") || n.includes("message") || p.includes("subject") || p.includes("message") || l.includes("subject") || l.includes("message");
  });
  const hasPasswordField = pageStructure.inputs.some((i) => (i.type || "").toLowerCase() === "password");
  const totalFields = pageStructure.inputs.length;
  const isEmailOnly = emailInputs.length >= 1 && totalFields <= 2 && !hasTextarea && !hasSubjectOrMessage && !hasPasswordField;
  if (!hasType("newsletter") && isEmailOnly) {
    foundWorkflows.push({
      type: "newsletter",
      name: "Newsletter",
      description: "Subscribe to email updates",
      confidence: 80,
      reason: "Detected email-only subscription form",
      pageStructure,
    });
  }

  // Heuristic checkout: cart/products indicators
  const { indicators } = pageStructure;
  if (!hasType("checkout") && (indicators?.hasCart || indicators?.hasProducts)) {
    foundWorkflows.push({
      type: "checkout",
      name: "Checkout",
      description: "Complete a purchase flow",
      confidence: 70,
      reason: "Detected cart/products indicators",
      pageStructure,
    });
  }

  // Heuristic contact: message/subject/textarea
  if (!hasType("contact") && hasSubjectOrMessage) {
    foundWorkflows.push({
      type: "contact",
      name: "Contact",
      description: "Submit a contact or inquiry form",
      confidence: 70,
      reason: "Detected contact form with message/subject",
      pageStructure,
    });
  }
  
  return foundWorkflows;
}

/**
 * Main function: Discover ALL forms/workflows across the entire website
 * Returns every form found (not just best per type) so user can choose which to test
 */
export async function discoverWorkflows({ url, maxPages = 15 }) {
  if (!url) throw new Error("Missing URL");

  let browser = null;
  const allWorkflows = []; // Collect ALL forms found (before dedup)
  const pagesScanned = [];

  try {
    console.log(`[FlowAI] Starting site-wide workflow discovery for: ${url}`);
    
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    
    // Step 1: Visit the entry URL
    console.log(`[FlowAI] Visiting entry page: ${url}`);
    // Use domcontentloaded for JS-heavy sites; networkidle is best-effort
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {}
    await page.waitForTimeout(1000);
    await dismissBlockingOverlays(page);
    
    const entryTitle = await page.title().catch(() => "");
    pagesScanned.push({ url, title: entryTitle });
    
    // Analyze entry page first
    console.log(`[FlowAI] Analyzing entry page...`);
    const entryWorkflows = await analyzePageForWorkflows(page, url, entryTitle);
    for (const wf of entryWorkflows) {
      allWorkflows.push({
        ...wf,
        pageUrl: url,
        pageTitle: entryTitle,
      });
      console.log(`[FlowAI] Found ${wf.name} on ${url} (${wf.confidence}% confidence)`);
    }
    
    // Step 2: Extract workflow-relevant links
    console.log(`[FlowAI] Discovering linked pages...`);
    const relevantLinks = await extractWorkflowRelevantLinks(page, url);
    console.log(`[FlowAI] Found ${relevantLinks.length} workflow-relevant pages to scan`);
    
    // Step 3: Visit each relevant page and analyze
    for (const link of relevantLinks) {
      if (pagesScanned.length >= maxPages) {
        console.log(`[FlowAI] Reached max pages limit (${maxPages})`);
        break;
      }
      
      // Skip if already scanned
      if (pagesScanned.some(p => p.url === link.url)) continue;
      
      try {
        console.log(`[FlowAI] Scanning: ${link.url}`);
        await page.goto(link.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        try {
          await page.waitForLoadState("networkidle", { timeout: 10000 });
        } catch {}
        await page.waitForTimeout(500);
        await dismissBlockingOverlays(page);
        
        const pageTitle = await page.title().catch(() => "");
        pagesScanned.push({ url: link.url, title: pageTitle });
        
        // Analyze this page - add ALL workflows found
        const pageWorkflows = await analyzePageForWorkflows(page, link.url, pageTitle);
        
        for (const wf of pageWorkflows) {
          allWorkflows.push({
            ...wf,
            pageUrl: link.url,
            pageTitle: pageTitle,
          });
          console.log(`[FlowAI] Found ${wf.name} on ${link.url} (${wf.confidence}% confidence)`);
        }
      } catch (err) {
        console.log(`[FlowAI] Failed to scan ${link.url}: ${err?.message}`);
      }
    }
    
    // Step 4: Deduplicate/filter and build meaningful workflows
    const filteredWorkflows = buildMeaningfulWorkflows(allWorkflows);
    
    // Sort by confidence (highest first)
    filteredWorkflows.sort((a, b) => b.confidence - a.confidence);
    
    console.log(`[FlowAI] Site-wide discovery complete: ${filteredWorkflows.length} workflow(s) found across ${pagesScanned.length} pages`);

    // Step 5: Generate steps for each detected workflow
    const detectedWorkflows = [];
    for (const wf of filteredWorkflows) {
      console.log(`[FlowAI] Generating steps for ${wf.name} workflow on ${wf.pageUrl}...`);
      const steps = await generateWorkflowSteps(wf.type, wf.pageStructure);
      detectedWorkflows.push({
        type: wf.type,
        name: wf.name,
        description: wf.description,
        confidence: wf.confidence,
        reason: wf.reason,
        pageUrl: wf.pageUrl,
        pageTitle: wf.pageTitle,
        steps,
      });
      console.log(`[FlowAI] Generated ${steps.length} steps for ${wf.name}`);
    }

    return {
      url,
      detectedWorkflows,
      pagesScanned: pagesScanned.length,
      scannedPages: pagesScanned,
      summary: `Found ${detectedWorkflows.length} workflow(s) across ${pagesScanned.length} pages scanned`,
    };

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

// Keep existing functions for backward compatibility

function buildSelectorsForElement(el) {
  if (!el) return null;
  if (el.id) return `#${el.id}`;
  if (el.name) return `[name="${el.name}"]`;
  if (el.text && el.text.length < 60) {
    const safeText = el.text.replace(/"/g, '\\"');
    return `text="${safeText}"`;
  }
  if (el.type) return `${el.tag}[type="${el.type}"]`;
  return null;
}

async function summarizePage(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    const take = (list, n = 12) => Array.from(list).slice(0, n);

    const buttons = take(document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']"))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        text: clean(el.textContent || el.value || ""),
        id: el.id || "",
        name: el.getAttribute("name") || "",
      }));

    const inputs = take(document.querySelectorAll("input:not([type='hidden']), select, textarea"))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || (el.tagName.toLowerCase() === "select" ? "select" : "text"),
        placeholder: clean(el.getAttribute("placeholder") || ""),
        label: clean(el.labels?.[0]?.textContent || ""),
        name: el.getAttribute("name") || el.id || "",
        id: el.id || "",
      }));

    const links = take(document.querySelectorAll("a[href]"))
      .map((el) => ({
        text: clean(el.textContent || ""),
        href: el.getAttribute("href") || "",
      }))
      .filter((l) => l.href && !l.href.startsWith("#"));

    return {
      url: window.location.href,
      title: document.title || "",
      buttons,
      inputs,
      links,
      textSample: clean(document.body?.innerText?.slice(0, 800) || ""),
    };
  });
}

async function askNextAction(goal, pageSummary, stepIndex, maxSteps) {
  const prompt = `You plan user workflows for web testing. Goal: ${goal}.
Current page (step ${stepIndex + 1}/${maxSteps}):
- URL: ${pageSummary.url}
- Title: ${pageSummary.title}
- Buttons: ${pageSummary.buttons.map((b) => `${b.text || b.type || b.tag}`).join("; ") || "none"}
- Inputs: ${pageSummary.inputs.map((i) => `${i.label || i.name || i.placeholder || i.type}`).join("; ") || "none"}
- Links: ${pageSummary.links.map((l) => l.text || l.href).join("; ") || "none"}
- Visible text sample: ${pageSummary.textSample}

Return ONE JSON object only (no prose). Supported actions:
- "click" (requires "selector")
- "fill" (requires "selector" and "value")
- "select" (requires "selector" and "value")
- "submit" (for search/form submission - provide "selector" of input field, system auto-finds submit button or presses Enter)
- "navigate" (requires "value" absolute URL)
- "assert" (requires "value" text to verify on page)
- "done" when the goal is achieved or no further meaningful action.

For SEARCH: Use "fill" to enter search query, then "submit" to submit. The system will find the submit button, icon button, or press Enter automatically.

Prefer robust selectors: id, name, or button text. Do not return multiple options.
JSON format:
{
  "action": "click|fill|select|submit|navigate|assert|done",
  "selector": "CSS selector or text selector",
  "value": "optional value",
  "description": "human summary of the step"
}`;

  const response = await callGroq(prompt, null);
  const parsed = parseJsonSafe(response);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI did not return a valid action JSON");
  }
  return parsed;
}

/**
 * Build meaningful workflows (checkout, newsletter, contact, auth) from raw detections
 * - Keep only ONE workflow per type (best confidence)
 * - Drop search as a standalone workflow (it will be used as a step in checkout)
 * - Require password fields for login/registration
 * - Require message/subject/textarea for contact
 */
function buildMeaningfulWorkflows(allWorkflows) {
  const bestByType = {}; // type -> best workflow (highest confidence)
const keptTypes = ["checkout", "newsletter", "contact", "login", "registration", "cart", "search"];

  const hasPassword = (wf) =>
    (wf.pageStructure?.inputs || []).some((i) => (i.type || "").toLowerCase() === "password");

  const hasMessageField = (wf) =>
    (wf.pageStructure?.inputs || []).some((i) => {
      const n = (i.name || "").toLowerCase();
      const p = (i.placeholder || "").toLowerCase();
      const l = (i.label || "").toLowerCase();
      const t = (i.type || "").toLowerCase();
      return (
        t === "textarea" ||
        n.includes("message") ||
        p.includes("message") ||
        l.includes("message") ||
        n.includes("subject") ||
        p.includes("subject") ||
        l.includes("subject")
      );
    });

  for (const wf of allWorkflows) {
    // Drop unknown types
    if (!keptTypes.includes(wf.type)) continue;

    // Drop standalone search workflows (search will be embedded in checkout steps)
    // (Re-enable search as standalone workflow)

    // Contact: require message/subject/textarea
    if (wf.type === "contact" && !hasMessageField(wf)) continue;

    // Auth: require password
    if ((wf.type === "login" || wf.type === "registration") && !hasPassword(wf)) continue;

    // Keep only ONE per type (best confidence)
    // Treat cart and checkout as the same type for dedup purposes
    const normalizedType = wf.type === "cart" ? "checkout" : wf.type;
    const existing = bestByType[normalizedType];
    if (!existing || wf.confidence > existing.confidence) {
      bestByType[normalizedType] = wf;
    }
  }

  return Object.values(bestByType);
}

/**
 * Build a coherent checkout workflow steps based on available page structures
 * Uses site-agnostic sample data and best-effort selectors
 */
function buildCheckoutSteps(pages) {
  const steps = [];

  // Helper pickers
  const findSearchInput = () => {
    for (const p of pages) {
      const input = p.inputs?.find((i) => {
        const n = (i.name || "").toLowerCase();
        const pH = (i.placeholder || "").toLowerCase();
        return n.includes("search") || n === "q" || pH.includes("search");
      });
      if (input) return { page: p, input };
    }
    return null;
  };

  const findProductAddToCart = () => {
    for (const p of pages) {
      const addBtn = p.buttons?.find((b) => {
        const t = (b.text || "").toLowerCase();
        return t.includes("add to cart") || t.includes("add to bag") || t.includes("add to basket");
      });
      if (addBtn) return { page: p, btn: addBtn };
    }
    return null;
  };

  const findCartPage = () => pages.find((p) => (p.url || "").toLowerCase().includes("/cart"));
  const findCheckoutPage = () => pages.find((p) => (p.url || "").toLowerCase().includes("/checkout"));

  // 1) Search/browse
  const search = findSearchInput();
  if (search) {
    const selector = search.input.name
      ? `[name="${search.input.name}"]`
      : search.input.id
      ? `#${search.input.id}`
      : search.input.placeholder
      ? `[placeholder="${search.input.placeholder}"]`
      : "input[type=\"search\"], input[name=\"q\"]";
    steps.push({
      action: "fill",
      selector,
      value: "t-shirt",
      description: "Enter search query",
    });
    steps.push({
      action: "submit",
      selector,
      description: "Submit search",
    });
  }

  // 2) PDP add to cart
  const atc = findProductAddToCart();
  if (atc) {
    const selector = atc.btn.id
      ? `#${atc.btn.id}`
      : atc.btn.name
      ? `[name="${atc.btn.name}"]`
      : `text="${atc.btn.text}"`;
    steps.push({
      action: "click",
      selector,
      description: "Add product to cart",
    });
  }

  // 3) Cart review and proceed
  const cart = findCartPage();
  if (cart) {
    steps.push({
      action: "navigate",
      value: cart.url,
      description: "Open cart",
    });
  }

  // 4) Checkout
  const checkout = findCheckoutPage();
  if (checkout) {
    steps.push({
      action: "navigate",
      value: checkout.url,
      description: "Proceed to checkout",
    });
  }

  // 5) Shipping/Payment sample entries (generic selectors; best-effort)
  steps.push(
    {
      action: "fill",
      selector: '[name="email"], input[type="email"], [name="contact[email]"]',
      value: "sarah@example.com",
      description: "Enter email",
    },
    {
      action: "fill",
      selector: '[name*="first_name"], [name*="firstname"]',
      value: "Sarah",
      description: "Enter first name",
    },
    {
      action: "fill",
      selector: '[name*="last_name"], [name*="lastname"]',
      value: "Johnson",
      description: "Enter last name",
    },
    {
      action: "fill",
      selector: '[name*="address"], [name="shipping_address[address1]"]',
      value: "123 Market Street",
      description: "Enter address",
    },
    {
      action: "fill",
      selector: '[name*="city"], [name="shipping_address[city]"]',
      value: "San Francisco",
      description: "Enter city",
    },
    {
      action: "fill",
      selector: '[name*="zip"], [name*="postal"]',
      value: "94103",
      description: "Enter postal code",
    },
    {
      action: "fill",
      selector: '[name*="phone"]',
      value: "+1 (555) 123-4567",
      description: "Enter phone",
    },
    {
      action: "select",
      selector: 'select[name*="country"], select[name="shipping_address[country]"]',
      value: "US",
      description: "Select country",
    },
    {
      action: "submit",
      selector: "",
      description: "Place order",
    }
  );

  return steps;
}

async function waitForNavigationOrChange(page, actionFn, timeout = 10000, requireNav = true) {
  const startUrl = page.url();
  const startTime = Date.now();
  let actionError = null;
  try {
    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout }).catch(() => null),
      (async () => {
        await actionFn();
      })(),
    ]);
  } catch (err) {
    actionError = err;
  }

  // Quick check: URL change
  const endUrl = page.url();
  if (startUrl !== endUrl) {
    console.log(`[FlowAI] Navigation/URL changed: ${startUrl} -> ${endUrl} (${Date.now() - startTime}ms)`);
    return;
  }

  // Fallback: small wait for DOM change
  try {
    await page.waitForTimeout(800);
  } catch {}

  const finalUrl = page.url();
  if (finalUrl !== startUrl) {
    console.log(`[FlowAI] URL changed after fallback wait: ${startUrl} -> ${finalUrl} (${Date.now() - startTime}ms)`);
    return;
  } else {
    console.log(`[FlowAI] No URL change after action (stay on ${startUrl}, took ${Date.now() - startTime}ms)`);
  }

  if (actionError) {
    throw actionError;
  }

  if (requireNav) {
    const error = new Error("No URL change after action");
    error.code = "NO_NAV";
    throw error;
  }
}

/**
 * Smart submit function for search forms and other forms without traditional submit buttons
 * Tries multiple approaches: submit button, icon button, then Enter key
 */
async function smartSubmit(page, inputSelector) {
  // Strategy 1: Try to find an explicit submit button in the form
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[type="button"][aria-label*="search" i]',
    'button[type="button"][aria-label*="submit" i]',
  ];
  
  for (const sel of submitSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click({ timeout: 5000 });
        console.log(`[FlowAI] Submitted using: ${sel}`);
        return { method: "submit-button", selector: sel };
      }
    } catch {
      // Try next
    }
  }
  
  // Strategy 2: Try to find search icon button (magnifying glass, etc.)
  const iconSelectors = [
    '[aria-label*="search" i]:not(input)',
    '[aria-label*="submit" i]:not(input)',
    '[role="button"][aria-label*="search" i]',
    'button:has(svg[class*="search" i])',
    'button:has(svg[aria-label*="search" i])',
    '.search-button',
    '.search-submit',
    '#search-submit',
    '[class*="search"] button',
    '[class*="search"] [role="button"]',
  ];
  
  for (const sel of iconSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click({ timeout: 5000 });
        console.log(`[FlowAI] Submitted using icon button: ${sel}`);
        return { method: "icon-button", selector: sel };
      }
    } catch {
      // Try next
    }
  }
  
  // Strategy 3: Press Enter on the input field (most search forms support this)
  try {
    if (inputSelector) {
      await page.focus(inputSelector);
    }
    await page.keyboard.press('Enter');
    console.log(`[FlowAI] Submitted using Enter key`);
    return { method: "enter-key" };
  } catch (err) {
    console.log(`[FlowAI] Enter key submission failed: ${err?.message}`);
    throw new Error("Could not find a way to submit the form");
  }
}

function isAddToCartStep(step) {
  const desc = (step.description || "").toLowerCase();
  const sel = (step.selector || "").toLowerCase();
  return (
    desc.includes("add to cart") ||
    desc.includes("add product to cart") ||
    sel.includes("add-to-cart") ||
    sel.includes("add to cart") ||
    sel.includes("add_to_cart") ||
    sel.includes("addtocart")
  );
}

async function selectFirstAvailableVariant(page) {
  let changed = false;

  // Try <select> based variant pickers
  const selectChanged = await page.evaluate(() => {
    let modified = false;
    const selects = Array.from(
      document.querySelectorAll(
        "select[name*='option' i], select[id*='option' i], select[data-option], select[name*='size' i], select[name*='color' i]"
      )
    );
    for (const sel of selects) {
      if (sel.disabled) continue;
      const opt = Array.from(sel.options).find((o) => !o.disabled && o.value);
      if (opt && !opt.selected) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        modified = true;
      }
    }
    return modified;
  });
  changed = changed || selectChanged;

  // Try radio/swatch variant pickers
  const radioSelectors = [
    "input[type='radio'][name*='option' i]",
    "[role='radio'][data-option-value]",
    "[data-option-value]",
    "button[data-option-value]",
    "button[data-value][data-option]",
  ];
  for (const sel of radioSelectors) {
    const radios = await page.$$(sel);
    for (const radio of radios) {
      try {
        const disabled = await radio.evaluate(
          (el) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"
        );
        if (disabled) continue;
        const visible = await radio.isVisible().catch(() => false);
        if (!visible) continue;
        await radio.click({ timeout: 5000 });
        changed = true;
        break;
      } catch {
        // try next
      }
    }
    if (changed) break;
  }

  return changed;
}

async function findAddButtonInfo(page, selectors) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (!el) continue;
      const info = await el.evaluate((node) => {
        const text = (node.innerText || node.textContent || "").toLowerCase();
        const disabled =
          node.disabled ||
          node.getAttribute("aria-disabled") === "true" ||
          node.getAttribute("data-available") === "false" ||
          text.includes("sold out");
        return { disabled, text };
      });
      return { selector, ...info };
    } catch {
      // try next
    }
  }
  return null;
}

async function performAddToCart(page, step) {
  const selectors = (step.selector || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!selectors.length) return { status: "error", error: "Missing selector for add to cart" };

  let btnInfo = await findAddButtonInfo(page, selectors);
  if (!btnInfo) {
    const currentUrl = page.url();
    console.log(`[FlowAI] Add to Cart button not found on page: ${currentUrl}`);
    return { status: "error", error: `Add to Cart button not found on ${currentUrl}` };
  }

  // If disabled, try selecting a variant and re-check
  if (btnInfo.disabled) {
    console.log("[FlowAI] Add to Cart disabled; attempting variant selection");
    const variantChanged = await selectFirstAvailableVariant(page);
    btnInfo = (await findAddButtonInfo(page, selectors)) || btnInfo;
    if (btnInfo.disabled) {
      const reason = variantChanged
        ? "Add to Cart still disabled after selecting variant (likely sold out)"
        : "Add to Cart disabled (variant likely sold out)";
      return { status: "error", error: reason };
    }
  }

  // Click the add-to-cart button using the selector set
  let clicked = false;
  let lastError = null;
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element && (await element.isVisible().catch(() => false))) {
        await waitForNavigationOrChange(page, async () => {
          await element.click({ timeout: 10000 });
        });
        console.log(`[FlowAI] Clicked Add to Cart using: ${selector}`);
        clicked = true;
        break;
      }
    } catch (err) {
      lastError = err;
      // try next
    }
  }

  if (!clicked) {
    return { status: "error", error: lastError?.message || "Failed to click Add to Cart" };
  }

  return { status: "success" };
}

function isSearchStep(step) {
  const desc = (step.description || "").toLowerCase();
  const sel = (step.selector || "").toLowerCase();
  return (
    desc.includes("search") ||
    sel.includes("search") ||
    sel.includes("searchinput") ||
    sel.includes("search-input") ||
    sel.includes("search_input") ||
    sel.includes("q=") ||
    sel.includes("[name=\"q\"") ||
    sel.includes("name=\"q\"")
  );
}

function isNavigationCriticalClick(step) {
  const desc = (step.description || "").toLowerCase();
  // Clicks that should change page: product select, view cart, checkout, navigation links
  const navKeywords = ["product", "cart", "checkout", "view cart", "select first product", "proceed to checkout"];
  return navKeywords.some((kw) => desc.includes(kw));
}

function isOptionalClick(step) {
  const desc = (step.description || "").toLowerCase();
  return desc.includes("billing"); // billing use-same-address is optional
}

async function isVisibleSelector(page, selector) {
  try {
    const el = await page.$(selector);
    return !!(el && (await el.isVisible()));
  } catch {
    return false;
  }
}

async function ensureSearchInputVisible(page, primarySelector) {
  const startUrl = page.url();
  // If already visible, return as-is
  if (primarySelector && (await isVisibleSelector(page, primarySelector))) {
    console.log(`[FlowAI] Search input already visible with selector: ${primarySelector} (page: ${startUrl})`);
    return primarySelector;
  }

  // Try to open search popdowns/toggles
  const triggerSelectors = [
    "[aria-label*='search' i]:not(input)",
    "button[aria-label*='search' i]",
    "summary[aria-label*='search' i]",
    "details summary[aria-label*='search' i]",
    "search-popdown summary",
    ".search-toggle",
    "[class*='search'] summary",
    "[class*='search'] button",
    "#NavStandard summary[aria-label*='search' i]",
    "#NavStandard [class*='search'] summary",
    "#NavStandard button[aria-label*='search' i]",
  ];

  for (const trigger of triggerSelectors) {
    try {
      const el = await page.$(trigger);
      if (el && (await el.isVisible().catch(() => false))) {
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(200);
        if (primarySelector && (await isVisibleSelector(page, primarySelector))) {
          console.log(`[FlowAI] Opened search trigger: ${trigger}, using primary selector: ${primarySelector}`);
          return primarySelector;
        }
        console.log(`[FlowAI] Opened search trigger: ${trigger}, primary not visible yet`);
      }
    } catch {
      // ignore and continue
    }
  }

  // Fallback: find any visible search input
  const fallbackSelectors = [
    primarySelector,
    "input[type='search']",
    "input[name='q']",
    "input[placeholder*='search' i]",
    "input[id*='search' i]",
    "input[name*='search' i]",
  ].filter(Boolean);

  for (const sel of fallbackSelectors) {
    if (sel && (await isVisibleSelector(page, sel))) {
      console.log(`[FlowAI] Using visible search input selector: ${sel} (page: ${page.url()})`);
      return sel;
    }
  }

  // Return primary even if not visible; caller will attempt and log
  console.log(`[FlowAI] No visible search input found; falling back to: ${primarySelector || "input[type='search']"}`);
  return primarySelector || "input[type='search']";
}

async function performAction(page, step) {
  const result = { status: "success", error: null };
  try {
    switch (step.action) {
      case "navigate": {
        if (!step.value) throw new Error("Missing URL to navigate");
        // Convert relative URLs to absolute
        let targetUrl = step.value;
        if (targetUrl.startsWith("/")) {
          const currentUrl = new URL(page.url());
          targetUrl = `${currentUrl.origin}${targetUrl}`;
          console.log(`[FlowAI] Converted relative URL "${step.value}" to absolute: ${targetUrl}`);
        }
        // Use domcontentloaded for reliability; networkidle best-effort
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        try {
          await page.waitForLoadState("networkidle", { timeout: 10000 });
        } catch {}
        break;
      }
      case "click": {
        // Special handling for Add to Cart steps: ensure variant availability and button enabled
        if (isAddToCartStep(step)) {
          const addResult = await performAddToCart(page, step);
          if (addResult.status === "error") {
            result.status = "error";
            result.error = addResult.error;
          }
          break;
        }

        if (!step.selector) throw new Error("Missing selector for click");
        
        // Split comma-separated selectors and try each one
        const selectors = step.selector.split(",").map(s => s.trim()).filter(Boolean);
        let clicked = false;
        let lastError = null;
        
        const expectNavigation = isNavigationCriticalClick(step);
        const optionalClick = isOptionalClick(step);

        for (const selector of selectors) {
          try {
            // Handle text selectors (e.g., button:has-text('Add to Cart'))
            if (selector.includes(":has-text(")) {
              const match = selector.match(/:has-text\(['"](.+)['"]\)/);
              if (match) {
                const baseSelector = selector.split(":has-text(")[0] || "*";
                const textToFind = match[1];
                const element = await page.locator(`${baseSelector}:has-text("${textToFind}")`).first();
                if (await element.isVisible({ timeout: 3000 }).catch(() => false)) {
                  await waitForNavigationOrChange(page, async () => {
                    await element.click({ timeout: 10000 });
                  }, 10000, expectNavigation);
                  clicked = true;
                  console.log(`[FlowAI] Clicked using: ${selector}`);
                  break;
                }
              }
            }
            // Handle text= selectors
            else if (selector.startsWith('text="') || selector.startsWith("text='")) {
              const textContent = selector.match(/text=["'](.+)["']/)?.[1];
              if (textContent) {
                const element = await page.getByText(textContent, { exact: false }).first();
                if (await element.isVisible({ timeout: 3000 }).catch(() => false)) {
                  await waitForNavigationOrChange(page, async () => {
                    await element.click({ timeout: 10000 });
                  }, 10000, expectNavigation);
                  clicked = true;
                  console.log(`[FlowAI] Clicked using text: ${textContent}`);
                  break;
                }
              }
            }
            // Regular CSS selector
            else {
              const element = await page.$(selector);
              if (element && await element.isVisible().catch(() => false)) {
                await waitForNavigationOrChange(page, async () => {
                  await element.click({ timeout: 10000 });
                }, 10000, expectNavigation);
                clicked = true;
                console.log(`[FlowAI] Clicked using: ${selector}`);
                break;
              }
            }
          } catch (err) {
            lastError = err;
            // Try next selector
          }
        }
        
        if (!clicked) {
          if (optionalClick) {
            console.log(`[FlowAI] Optional click not found (skipping): ${step.description || step.selector}`);
            result.status = "success";
          } else {
            throw lastError || new Error(`No matching element found for: ${step.selector}`);
          }
        }
        break;
      }
      case "fill": {
        if (!step.selector) throw new Error("Missing selector for fill");
        
        // Special handling for search: ensure input is visible (open popdown if needed)
        let selectorToUse = step.selector;
        if (isSearchStep(step)) {
          selectorToUse = await ensureSearchInputVisible(page, step.selector);
        }

        // Split comma-separated selectors and try each one
        const selectors = selectorToUse.split(",").map(s => s.trim()).filter(Boolean);
        let filled = false;
        let lastError = null;
        
        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element && await element.isVisible().catch(() => false)) {
              await page.fill(selector, step.value ?? "", { timeout: 10000 });
              filled = true;
              console.log(`[FlowAI] Filled using: ${selector}`);
              break;
            }
          } catch (err) {
            lastError = err;
            // Try next selector
          }
        }
        
        if (!filled) {
          // For checkout steps, missing optional fields should not fail the workflow
          console.log(`[FlowAI] Could not fill field (may be optional): ${step.selector}`);
          // Don't throw - just log and continue
        }
        break;
      }
      case "select": {
        if (!step.selector) throw new Error("Missing selector for select");
        try {
          await page.selectOption(step.selector, step.value ?? "", { timeout: 10000 });
        } catch (selectErr) {
          // If the value doesn't exist, try to find available options and select the first valid one
          console.log(`[FlowAI] Select failed for value "${step.value}", trying fallback...`);
          try {
            const availableOptions = await page.$$eval(`${step.selector} option`, opts => 
              opts.map(o => o.value).filter(v => v && v.trim())
            );
            if (availableOptions.length > 0) {
              console.log(`[FlowAI] Found ${availableOptions.length} options, selecting first: "${availableOptions[0]}"`);
              await page.selectOption(step.selector, availableOptions[0], { timeout: 5000 });
            } else {
              throw selectErr; // Re-throw original error if no options found
            }
          } catch (fallbackErr) {
            throw selectErr; // Re-throw original error
          }
        }
        break;
      }
      case "assert": {
        if (!step.value) throw new Error("Missing text to assert");
        const found = await page.getByText(step.value, { exact: false }).first().isVisible({ timeout: 8000 });
        if (!found) throw new Error(`Text not found: ${step.value}`);
        break;
      }
      case "submit": {
        // Smart submit for search forms and other forms without traditional buttons
        // Uses smartSubmit function which tries: submit button, icon button, then Enter key
        let selectorToUse = step.selector;
        if (isSearchStep(step)) {
          selectorToUse = await ensureSearchInputVisible(page, step.selector);
        }
        try {
          await waitForNavigationOrChange(page, async () => {
            await smartSubmit(page, selectorToUse);
          });
          // Wait for page response after submit
          try {
            await page.waitForLoadState("networkidle", { timeout: 10000 });
          } catch {
            // Continue even if networkidle times out
          }
        } catch (err) {
          // If no navigation occurred, retry submit using Enter key explicitly
          if (err?.code === "NO_NAV") {
            console.log("[FlowAI] No navigation after submit; retrying with Enter key");
            try {
              await page.keyboard.press("Enter");
              await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null);
              await page.waitForTimeout(800);
            } catch (retryErr) {
              result.status = "error";
              result.error = retryErr?.message || "Submit retry failed";
              break;
            }
          } else {
            throw err;
          }
        }
        break;
      }
      case "done": {
        break;
      }
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  } catch (err) {
    result.status = "error";
    result.error = err?.message || String(err);
  }
  return result;
}

// Legacy function - kept for backward compatibility
export async function detectWorkflows({ url, maxSteps = DEFAULT_MAX_STEPS, goal = "checkout" }) {
  if (!url) throw new Error("Missing URL");

  let browser = null;
  const workflows = [];
  const steps = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {}
    await dismissBlockingOverlays(page);

    for (let i = 0; i < maxSteps; i++) {
      const summary = await summarizePage(page);
      const action = await askNextAction(goal, summary, i, maxSteps);

      if (!action || action.action === "done") {
        break;
      }

      // If AI suggested text selector, convert to Playwright text locator
      if (action.selector && action.selector.startsWith(":text(")) {
        const textMatch = action.selector.match(/:text\("(.+)"\)/);
        if (textMatch?.[1]) {
          action.selector = `text="${textMatch[1]}"`;
        }
      }

      const execResult = await performAction(page, action);
      steps.push({
        index: i + 1,
        action: action.action,
        selector: action.selector || "",
        value: action.value || "",
        description: action.description || "",
        url: summary.url,
        title: summary.title,
        status: execResult.status,
        error: execResult.error || null,
      });

      if (execResult.status === "error") {
        break;
      }

      await dismissBlockingOverlays(page);
    }

    workflows.push({
      id: "workflow-1",
      goal,
      steps,
      summary: `Detected ${steps.length} steps for goal "${goal}"`,
    });

    return { workflows, goal };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

/**
 * Analyze workflow result by comparing before/after page state (like Form Testing)
 */
async function analyzeWorkflowResult(beforeState, afterState) {
  const beforeText = (beforeState.pageText || "").trim();
  const afterText = (afterState.pageText || "").trim();
  const urlChanged = beforeState.url !== afterState.url;
  
  // Find NEW text that appeared after the workflow
  const beforeLines = new Set(beforeText.split('\n').map(l => l.trim()).filter(l => l.length > 5));
  const afterLines = afterText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
  const newLines = afterLines.filter(line => !beforeLines.has(line));
  const newTextContent = newLines.join('\n').slice(0, 1000);
  
  const textLengthDiff = afterText.length - beforeText.length;

  const prompt = `You are analyzing the result of a workflow/form submission to determine if it succeeded, failed, or is inconclusive.

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
Analyze the above data and determine if the workflow/form submission was successful.

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
}`;

  try {
    const response = await callGroq(prompt, null);
    const analysis = parseJsonSafe(response);
    
    if (analysis && analysis.status) {
      return analysis;
    }
  } catch (err) {
    console.error("[FlowAI] Workflow result analysis failed:", err?.message);
  }
  return { status: "inconclusive", confidence: 0, reason: "AI analysis failed" };
}

export async function executeWorkflow({ url, pageUrl, steps = [] }) {
  // Use pageUrl if provided (specific workflow page), otherwise fall back to url
  const targetUrl = pageUrl || url;
  if (!targetUrl) throw new Error("Missing URL");
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("No steps provided");
  }

  // Check if there are any actionable steps (fill, click, select - not just navigate)
  const actionableSteps = steps.filter(s => 
    s.action === "fill" || s.action === "click" || s.action === "select"
  );
  
  if (actionableSteps.length === 0) {
    return {
      status: "inconclusive",
      reason: "No actionable steps to execute (only navigation/assert steps present)",
      confidence: 0,
      // detectedMessages removed
      steps: [],
      error: null,
    };
  }

  let browser = null;
  const executed = [];
  let finalStatus = "inconclusive";
  let finalError = null;
  let analysisResult = null;

  console.log(`[FlowAI] Starting workflow execution with ${steps.length} steps (${actionableSteps.length} actionable)`);

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    const page = await context.newPage();
    console.log(`[FlowAI] Executing workflow on: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {}
    await dismissBlockingOverlays(page);

    // Capture BEFORE state (after initial navigation, before form interactions)
    const beforeState = {
      url: page.url(),
      pageText: await page.evaluate(() => document.body?.innerText || ""),
    };
    console.log(`[FlowAI] Captured before state: ${beforeState.url}`);

    let stepFailed = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const pageUrlBefore = page.url();
      console.log(`[FlowAI] Step ${i + 1}/${steps.length}: ${step.action} - ${step.description || step.selector} (current page: ${pageUrlBefore})`);
      
      const exec = await performAction(page, step);
      
      const pageUrlAfter = page.url();
      console.log(`[FlowAI] Step ${i + 1} result: ${exec.status}${exec.error ? ` (${exec.error})` : ""} (after page: ${pageUrlAfter})`);
      
      executed.push({
        ...step,
        index: i + 1,
        status: exec.status,
        error: exec.error || null,
        url: page.url(),
        title: await page.title().catch(() => ""),
      });

      if (exec.status === "error") {
        stepFailed = true;
        finalError = exec.error || "Step failed";
        console.log(`[FlowAI] Workflow step failed at ${i + 1}: ${finalError}`);
        break;
      }

      await dismissBlockingOverlays(page);
    }

    // If a step technically failed (e.g., element not found), mark as failed
    if (stepFailed) {
      finalStatus = "failed";
      analysisResult = {
        status: "failed",
        confidence: 1.0,
        reason: finalError || "A workflow step failed to execute",
        detectedMessages: [finalError],
      };
    } else {
      // All steps executed - now analyze the actual result
      console.log(`[FlowAI] All steps executed. Waiting for page to stabilize...`);
      
      // Wait for page to stabilize after final action (AJAX responses, etc.)
      try {
        await page.waitForLoadState("networkidle", { timeout: 10000 });
      } catch {}
      await page.waitForTimeout(2000);

      // Capture AFTER state
      const afterState = {
        url: page.url(),
        pageText: await page.evaluate(() => document.body?.innerText || ""),
      };
      console.log(`[FlowAI] Captured after state: ${afterState.url}`);

      // Use AI to analyze the result
      console.log(`[FlowAI] Analyzing workflow result...`);
      analysisResult = await analyzeWorkflowResult(beforeState, afterState);
      finalStatus = analysisResult.status;
      
      console.log(`[FlowAI] Analysis result: ${analysisResult.status} - ${analysisResult.reason}`);
    }
    
    console.log(`[FlowAI] Workflow execution complete: ${finalStatus} (${executed.length}/${steps.length} steps)`);
  } catch (err) {
    console.error(`[FlowAI] Workflow execution error:`, err?.message);
    finalStatus = "failed";
    finalError = err?.message || "Workflow execution failed";
    analysisResult = {
      status: "failed",
      confidence: 1.0,
      reason: finalError,
      // detectedMessages removed
      // detectedMessages removed
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  return {
    status: finalStatus,
    reason: analysisResult?.reason || finalError || "Unknown",
    confidence: analysisResult?.confidence || 0,
    // detectedMessages removed
    steps: executed,
    error: finalError,
  };
}
