import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PlayCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

type CrawlPage = { url: string; mode?: string; elements?: any };
type CrawlResult = {
  startUrl: string;
  totalPages: number;
  staticCount: number;
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
                <p>Static: <span className="font-medium">{crawlResult.staticCount}</span> | Dynamic: <span className="font-medium">{crawlResult.dynamicCount}</span></p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Sample Pages</p>
                <div className="grid gap-2">
                  {crawlResult.results.slice(0, 8).map((p, i) => (
                    <div key={p.url + i} className="text-sm flex items-center justify-between">
                      <span className="truncate max-w-[70%]">{new URL(p.url).pathname || "/"}</span>
                      <span className="text-muted-foreground">{p.mode}</span>
                    </div>
                  ))}
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
