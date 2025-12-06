import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PlayCircle, Loader2, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

type CrawlPage = {
  url: string;
  title?: string;
  forms?: number;
  inputs?: number;
  buttons?: number;
  hasForm?: boolean;
  links?: string[];
  error?: string | null;
};

type CrawlResult = {
  startUrl: string;
  totalPages: number;
  pagesWithForms: number;
  results: CrawlPage[];
  error?: string;
};

type FormPage = {
  url: string;
  title: string;
  forms: number;
  inputs: number;
  buttons: number;
};

type FormDetectionResult = {
  totalPages: number;
  pagesWithForms: number;
  formPages: FormPage[];
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

export default function FlowGenerator() {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [formDetection, setFormDetection] = useState<FormDetectionResult | null>(null);
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleIntelligentCrawl = async () => {
    if (!url) return;
    setIntelLoading(true);
    setProgress(0);
    setError(null);
    setCrawlResult(null);
    setFormDetection(null);
    setPipelineStep("crawl");
    
    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      
      // Progress animation
      for (let i = 0; i <= 50; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (ctrl.signal.aborted) break;
        setProgress(i);
      }
      
      // Step 1: Crawl the website
      const crawlResp = await fetch(`${API_BASE}/intelligent-crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxDepth: 3, maxPages: 50 }),
        signal: ctrl.signal,
      });
      const crawlData = await crawlResp.json();
      setProgress(70);
      
      if (!crawlResp.ok || crawlData?.error) {
        setError(crawlData?.error || `Crawl failed with status ${crawlResp.status}`);
        return;
      }
      
      setCrawlResult(crawlData);
      try { localStorage.setItem("flowai:lastCrawl", JSON.stringify(crawlData)); } catch {}
      
      // Step 2: Detect forms only
      setPipelineStep("detect");
      setProgress(85);
      
      const detectResp = await fetch(`${API_BASE}/detect-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawlData }),
        signal: ctrl.signal,
      });
      const detectData = await detectResp.json();
      
      if (!detectResp.ok || detectData?.error) {
        throw new Error(detectData?.error || `Form detection failed (${detectResp.status})`);
      }
      
      setFormDetection(detectData);
      setProgress(100);
      
      // Save form pages for Workflows page
      try { 
        localStorage.setItem("flowai:formPages", JSON.stringify(detectData.formPages)); 
      } catch {}
      
      setPipelineStep(null);
      
    } catch (e: unknown) {
      const err = e as Error & { name?: string };
      if (err?.name === "AbortError") {
        setError("Operation cancelled.");
      } else {
        setError(err?.message || "Crawl failed");
      }
    } finally {
      setIntelLoading(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    try {
      abortRef.current?.abort();
    } catch {}
    setIntelLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Flow Generator</h1>
          <p className="text-muted-foreground">
            Crawl websites and detect pages with forms for automated testing
          </p>
        </div>

        {/* Input Section */}
        <Card className="shadow-elegant border-border">
          <CardHeader>
            <CardTitle>Crawl Website</CardTitle>
            <CardDescription>
              Enter a URL to find all pages with forms
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={intelLoading}
                className="flex-1 focus-ring"
              />
              <Button
                onClick={handleIntelligentCrawl}
                disabled={intelLoading || !url}
                variant="outline"
                className="border-border min-w-[170px]"
                size="lg"
              >
                {intelLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crawling...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Find Forms
                  </>
                )}
              </Button>
              {intelLoading && (
                <Button
                  onClick={handleStop}
                  variant="outline"
                  className="border-destructive text-destructive min-w-[120px]"
                  size="lg"
                >
                  Stop
                </Button>
              )}
            </div>

            {intelLoading && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {pipelineStep === "crawl" && "Crawling website..."}
                    {pipelineStep === "detect" && "Detecting forms..."}
                  </span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Crawl Summary */}
        {crawlResult && (
          <Card className="shadow-elegant border-border animate-fade-in-up">
            <CardHeader>
              <CardTitle>Crawl Summary</CardTitle>
              <CardDescription>Pages discovered on {crawlResult.startUrl}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{crawlResult.totalPages}</p>
                  <p className="text-muted-foreground">Total Pages</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{crawlResult.pagesWithForms}</p>
                  <p className="text-muted-foreground">Pages with Forms</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{crawlResult.results.reduce((acc, p) => acc + (p.links?.length || 0), 0)}</p>
                  <p className="text-muted-foreground">Total Links</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form Detection Results */}
        {formDetection && (
          <Card className="shadow-elegant border-border animate-fade-in-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Pages with Forms
              </CardTitle>
              <CardDescription>
                Found {formDetection.pagesWithForms} pages with forms out of {formDetection.totalPages} total pages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formDetection.formPages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No forms found on this website.
                </div>
              ) : (
                <div className="space-y-3">
                  {formDetection.formPages.map((page, i) => (
                    <div
                      key={page.url + i}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{page.title || new URL(page.url).pathname}</p>
                          <p className="text-sm text-muted-foreground truncate">{page.url}</p>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Forms: <span className="font-medium text-foreground">{page.forms}</span></span>
                        <span>Inputs: <span className="font-medium text-foreground">{page.inputs}</span></span>
                        <span>Buttons: <span className="font-medium text-foreground">{page.buttons}</span></span>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-4 border-t">
                    <a
                      href="/workflows"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                    >
                      Test Forms →
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!intelLoading && !crawlResult && (
          <Card className="shadow-elegant border-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <PlayCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">No forms detected yet</h3>
                <p className="text-muted-foreground max-w-md">
                  Enter a URL above and click "Find Forms" to crawl the website and discover pages with forms.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
