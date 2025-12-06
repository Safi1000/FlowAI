/**
 * Form Detection - Extract pages with forms from crawl results
 */

export function detectFormsFromCrawl(crawlData) {
  const results = crawlData?.results || [];
  const formPages = [];

  for (const page of results) {
    if (!page.hasForm) continue;
    
    formPages.push({
      url: page.url,
      title: page.title,
      forms: page.forms,
      inputs: page.inputs,
      buttons: page.buttons,
    });
  }

  console.log(`[FlowAI] Form detection: ${formPages.length} pages with forms out of ${results.length} total`);

  return {
    totalPages: results.length,
    pagesWithForms: formPages.length,
    formPages,
  };
}
