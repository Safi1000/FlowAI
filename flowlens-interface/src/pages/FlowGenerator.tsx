import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PlayCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

type CrawlPage = {
  url: string;
  mode?: string;
  elements?: { intent?: string }[];
  summary?: { links?: string[]; buttons?: string[]; forms?: number; inputs?: number; totalText?: number };
  buttonsCount?: number;
  linksCount?: number;
  textLength?: number;
  totalTextLength?: number;
  error?: string;
  diagnostic?: { rule?: string };
  initialMode?: string;
  aiVerifiedMode?: string | null;
  finalMode?: string;
  confidenceScore?: number;
  aiConfidenceScore?: number;
  reason?: string;
  aiStatus?: "ok" | "error" | "skipped";
  fallback?: boolean;
};
type CrawlResult = {
  startUrl: string;
  totalPages: number;
  staticCount: number;
  hybridCount?: number;
  dynamicCount: number;
  results: CrawlPage[];
  error?: string;
};

export default function FlowGenerator() {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // removed single-page and classic crawl handlers

  const handleIntelligentCrawl = async () => {
    if (!url) return;
    setIntelLoading(true);
    setProgress(0);
    setError(null);
    setCrawlResult(null);
    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // show progress feedback for intelligent crawl
      for (let i = 0; i <= 70; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (ctrl.signal.aborted) break;
        setProgress(i);
      }
      const resp = await fetch("/api/intelligent-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxDepth: 3, maxPages: 50 }),
        signal: ctrl.signal,
      });
      const data = await resp.json();
      setProgress(100);
      if (!resp.ok || data?.error) {
        setError(data?.error || `Request failed with status ${resp.status}`);
      } else {
        setCrawlResult(data);
        try { localStorage.setItem("flowai:lastCrawl", JSON.stringify(data)); } catch {}
      }
    } catch (e: any) {
      if (e?.name === "AbortError") setError("Operation cancelled.");
      else setError(e?.message || "Intelligent crawl failed");
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
            Automatically generate workflows by crawling your application
          </p>
        </div>

        {/* Input Section */}
        <Card className="shadow-elegant border-border">
          <CardHeader>
            <CardTitle>Crawl Website</CardTitle>
            <CardDescription>
              Enter a URL to analyze and generate test workflows
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
                    Intelligent Crawl...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Generate Workflows
                  </>
                )}
              </Button>
              {(intelLoading) && (
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

            {(intelLoading) && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Intelligent crawl in progress...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>• Discovering pages</span>
                  <span>• Mapping interactions</span>
                  <span>• Generating workflows</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        {/* Crawl Summary */}
        {crawlResult && (
          <Card className="shadow-elegant border-border animate-fade-in-up">
            <CardHeader>
              <CardTitle>Site Crawl Summary</CardTitle>
              <CardDescription>Parsed the entire site using the intelligent parser</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <p>Website: <span className="font-medium break-all">{crawlResult.startUrl}</span></p>
                <p>Total Pages Parsed: <span className="font-medium">{crawlResult.totalPages}</span></p>
                <p>Static: <span className="font-medium">{crawlResult.staticCount}</span> | Hybrid: <span className="font-medium">{crawlResult.hybridCount ?? 0}</span> | Dynamic: <span className="font-medium">{crawlResult.dynamicCount}</span></p>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Sample Pages</p>
                <div className="grid gap-3">
                  {crawlResult.results.slice(0, 10).map((p, i) => {
                    const linkCount = typeof p.linksCount === "number" ? p.linksCount : (p.summary?.links?.length || 0);
                    const buttonCount = typeof p.buttonsCount === "number" ? p.buttonsCount : (p.summary?.buttons?.length || 0);
                    const textLen = typeof p.totalTextLength === "number" ? p.totalTextLength : (typeof p.textLength === "number" ? p.textLength : (p.summary?.totalText || 0));
                    const intents = (p.elements || [])
                      .map((e) => e.intent)
                      .filter(Boolean) as string[];
                    const intentMap = new Map<string, number>();
                    for (const it of intents) intentMap.set(it, (intentMap.get(it) || 0) + 1);
                    const topIntents = [...intentMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
                    return (
                      <div key={p.url + i} className="text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant={(p.mode || p.finalMode) === "dynamic" ? "default" : "secondary"}>{p.mode || p.finalMode || "unknown"}</Badge>
                          <span className="truncate max-w-[40ch] md:max-w-[60ch]">{new URL(p.url).pathname || "/"}</span>
                        </div>
                        {p.error ? (
                          <div className="flex items-center gap-3 text-red-500">
                            <span className="font-medium">Error:</span>
                            <span className="truncate max-w-[50ch]" title={p.error}>{p.error}</span>
                            {(p.mode || p.finalMode) && <span className="text-muted-foreground">(mode: {p.mode || p.finalMode})</span>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>Links: <span className="font-medium text-foreground">{linkCount}</span></span>
                            <span>Buttons: <span className="font-medium text-foreground">{buttonCount}</span></span>
                            <span>Text: <span className="font-medium text-foreground">{textLen}</span></span>
                            {/* confidence and rule intentionally hidden in UI */}
                            {/* hide AI status labels and intent badges */}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="pt-2">
                  <a
                    href="/workflows"
                    className="text-sm text-primary hover:underline"
                    onClick={() => {
                      try { localStorage.setItem("flowai:lastCrawl", JSON.stringify(crawlResult)); } catch {}
                    }}
                  >
                    View Workflows →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Placeholder results section removed */}

        {/* Empty State */}
        {!intelLoading && !crawlResult && (
          <Card className="shadow-elegant border-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <PlayCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">No workflows generated yet</h3>
                <p className="text-muted-foreground max-w-md">
                  Enter a URL above and click "Generate Workflows" to crawl your site and build workflows.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
