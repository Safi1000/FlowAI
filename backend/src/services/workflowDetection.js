/**
 * Form Detection - Extract pages with forms from crawl results
 * Uses AI to filter out search bars and filter forms
 */

import { classifyFormIntent } from "./aiClient.js";

/**
 * Detect forms from crawl results and filter out search/filter forms using AI.
 * @param {object} crawlData - Crawl results with pages and formsMeta
 * @returns {Promise<object>} - { totalPages, pagesWithForms, formPages, filteredForms }
 */
export async function detectFormsFromCrawl(crawlData) {
  const results = crawlData?.results || [];
  const formPages = [];
  let filteredFormsCount = 0;

  // Global dedup to keep only ONE instance of common site-wide forms (newsletter/search)
  let newsletterKept = false;  // ensure exactly one newsletter is kept
  let searchKept = false;      // ensure exactly one search is kept
  const seenFormSignatures = new Set(); // dedup identical forms (same fields/selectors)

  const isSearchForm = (formMeta) => {
    const inputs = formMeta?.inputs || [];
    // Allow 1-3 inputs (some search forms have hidden fields or additional elements)
    if (inputs.length < 1 || inputs.length > 3) return false;
    return inputs.some((inp) => {
      const name = (inp.name || inp.placeholder || "").toLowerCase();
      return name.includes("search") || name === "q" || name === "query";
    });
  };

  const isNewsletterForm = (formMeta) => {
    const inputs = formMeta?.inputs || [];
    const fieldNames = inputs
      .map((i) => (i.name || i.placeholder || i.type || "").toLowerCase())
      .filter(Boolean);
    const hasTextarea = inputs.some((i) => (i.type || "").toLowerCase() === "textarea");
    const hasSubjectOrMessage = fieldNames.some((f) => f.includes("subject") || f.includes("message"));
    const hasEmailLike = fieldNames.some((f) => f.includes("email") || f.includes("mail"));
    return !hasTextarea && !hasSubjectOrMessage && hasEmailLike && fieldNames.length <= 2;
  };

  for (const page of results) {
    if (!page.hasForm) continue;

    const formsMeta = page.formsMeta || [];

    // If no formsMeta, fall back to old behavior (keep the page)
    if (formsMeta.length === 0 && page.hasForm) {
      formPages.push({
        url: page.url,
        title: page.title,
        forms: page.forms,
        inputs: page.inputs,
        buttons: page.buttons,
      });
      continue;
    }

    // Classify each form on the page
    let transactionalCount = 0;
    let transactionalInputs = 0;
    let transactionalButtons = 0;
    let pageHasSearch = false;
    let pageHasNewsletter = false;

    for (const formMeta of formsMeta) {
      try {
        // Dedup & filter newsletter/search (keep first occurrence only)
        const isSearch = isSearchForm(formMeta);
        const isNewsletter = isNewsletterForm(formMeta);
        // Build signatures with stronger normalization (ids/placeholders/names), and loosen action for newsletter/search
        const inputSignatureParts =
          (formMeta.inputs || [])
            .map((i) => {
              const base = (i.name || i.id || i.placeholder || i.type || "").toLowerCase().trim();
              const sel = (i.selector || "").toLowerCase().trim();
              return sel ? `${base}|${sel}` : base;
            })
            .filter(Boolean)
            .sort();
        const baseSig = inputSignatureParts.join("|");
        const sig =
          isSearch || isNewsletter
            ? `${isSearch ? "search" : "newsletter"}|${baseSig}`
            : `${formMeta.action || ""}|${baseSig}`;

        if (seenFormSignatures.has(sig)) {
          filteredFormsCount++;
          continue;
        }

        if (isSearch) {
          // Keep the first search form; skip the rest
          if (searchKept) {
            filteredFormsCount++;
            continue; // skip duplicate search forms
          }
          searchKept = true;
          pageHasSearch = true;
          // Force-include search forms (they may be classified as filter otherwise)
          transactionalCount++;
          transactionalInputs += (formMeta.inputs || []).length;
          transactionalButtons += (formMeta.buttons || []).length;
          seenFormSignatures.add(sig);
          continue;
        }
        if (isNewsletter) {
          // Keep the first newsletter form; skip the rest
          if (newsletterKept) {
            filteredFormsCount++;
            continue; // skip duplicate newsletter forms
          }
          newsletterKept = true;
          pageHasNewsletter = true;
          seenFormSignatures.add(sig);
        }

        const intent = await classifyFormIntent(formMeta);
        console.log(`[FlowAI] Form on ${page.url} classified as: ${intent}`);

        if (intent === "transactional" || intent === "unknown") {
          transactionalCount++;
          transactionalInputs += (formMeta.inputs || []).length;
          transactionalButtons += (formMeta.buttons || []).length;
          seenFormSignatures.add(sig);
        } else {
          filteredFormsCount++;
        }
      } catch (err) {
        // On error, keep the form (don't filter it out)
        console.log(`[FlowAI] Form classification error on ${page.url}: ${err?.message}`);
        transactionalCount++;
        transactionalInputs += (formMeta.inputs || []).length;
        transactionalButtons += (formMeta.buttons || []).length;
      }
    }

    // Only include page if it has at least one transactional form
    if (transactionalCount > 0) {
      formPages.push({
        url: page.url,
        title: page.title,
        forms: transactionalCount,
        inputs: transactionalInputs,
        buttons: transactionalButtons,
        hasSearch: pageHasSearch,
        hasNewsletter: pageHasNewsletter,
      });
    }
  }

  console.log(
    `[FlowAI] Form detection: ${formPages.length} pages with transactional forms, ${filteredFormsCount} search/filter forms excluded`
  );

  return {
    totalPages: results.length,
    pagesWithForms: formPages.length,
    formPages,
    filteredForms: filteredFormsCount,
  };
}
