import { useEffect, useState } from "react";
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Smartphone,
  Tablet,
  Monitor,
  Globe,
  Image,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type ViewportResult = {
  width: number;
  height: number;
  name: string;
  device: string;
  screenshot?: string;
  status: "pass" | "warning" | "fail" | "error";
  issues?: { type: string; severity: string; message: string }[];
  metrics?: { pageWidth: number; pageHeight: number; elementCount: number; imageCount: number };
  error?: string;
};

type PageResult = {
  url: string;
  status: "pass" | "warning" | "fail" | "error";
  viewports: Record<string, ViewportResult>;
  issues: { type: string; severity: string; message: string; viewport: string }[];
  screenshots: Record<string, string>;
  error?: string;
};

type ResponsiveTestResults = {
  results: PageResult[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    errors: number;
  };
  viewportsTested: string[];
};

type CrawlData = {
  startUrl: string;
  totalPages: number;
  results: { url: string; title?: string }[];
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

const ResponsiveTesting = () => {
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null);
  const [testResults, setTestResults] = useState<ResponsiveTestResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState("");
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  // Load crawl data from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("flowai:lastCrawl");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.results) {
          setCrawlData(parsed);
          // Select first 5 pages by default
          const defaultSelected = new Set(parsed.results.slice(0, 5).map((p: { url: string }) => p.url));
          setSelectedUrls(defaultSelected);
        }
      }
    } catch {}
  }, []);

  // Crawl a URL directly
  const handleCrawlUrl = async () => {
    if (!directUrl) return;

    setCrawling(true);
    setError(null);
    setCrawlData(null);
    setTestResults(null);
    setProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 80));
      }, 500);

      const resp = await fetch(`${API_BASE}/intelligent-crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: directUrl, maxPages: 20 }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await resp.json();

      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Crawl failed (${resp.status})`);
      }

      setCrawlData(data);
      const defaultSelected = new Set(data.results.slice(0, 5).map((p: { url: string }) => p.url));
      setSelectedUrls(defaultSelected);
      try {
        localStorage.setItem("flowai:lastCrawl", JSON.stringify(data));
      } catch {}
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Crawl failed");
    } finally {
      setCrawling(false);
      setProgress(0);
    }
  };

  // Run responsive test
  const handleTestResponsive = async () => {
    if (selectedUrls.size === 0) return;

    setLoading(true);
    setError(null);
    setTestResults(null);
    setProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 2, 90));
      }, 1000);

      const resp = await fetch(`${API_BASE}/test-responsive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: Array.from(selectedUrls) }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await resp.json();

      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Test failed (${resp.status})`);
      }

      setTestResults(data);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Responsive testing failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleUrlSelection = (url: string) => {
    setSelectedUrls((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(url)) {
        newSet.delete(url);
      } else {
        newSet.add(url);
      }
      return newSet;
    });
  };

  const selectAllUrls = () => {
    if (crawlData) {
      setSelectedUrls(new Set(crawlData.results.map((p) => p.url)));
    }
  };

  const deselectAllUrls = () => {
    setSelectedUrls(new Set());
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <XCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getViewportIcon = (viewport: string) => {
    switch (viewport) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />;
      case "tablet":
        return <Tablet className="h-4 w-4" />;
      case "desktop":
        return <Monitor className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "text-red-500 bg-red-500/10 border-red-500/30";
      case "medium":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/30";
      case "low":
        return "text-blue-500 bg-blue-500/10 border-blue-500/30";
      default:
        return "text-gray-500 bg-gray-500/10 border-gray-500/30";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Monitor className="h-8 w-8 text-primary" />
              Responsive Testing
            </h1>
            <p className="text-muted-foreground">
              Test your website across Mobile, Tablet, and Desktop viewports
            </p>
          </div>
        </div>

        {/* URL Input */}
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Enter Website URL
            </CardTitle>
            <CardDescription>Crawl a website to select pages for responsive testing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="https://example.com"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                disabled={crawling || loading}
                className="flex-1"
              />
              <Button
                onClick={handleCrawlUrl}
                disabled={crawling || loading || !directUrl}
                className="min-w-[140px] gap-2"
              >
                {crawling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crawling...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4" />
                    Crawl Site
                  </>
                )}
              </Button>
            </div>

            {crawling && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Crawling website...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Page Selection */}
        {crawlData && !testResults && (
          <Card className="shadow-elegant">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Select Pages to Test</CardTitle>
                  <CardDescription>
                    Found {crawlData.totalPages} pages on {crawlData.startUrl}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllUrls}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllUrls}>
                    Deselect All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-3">
                {crawlData.results.map((page) => (
                  <div
                    key={page.url}
                    className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer"
                    onClick={() => toggleUrlSelection(page.url)}
                  >
                    <Checkbox
                      checked={selectedUrls.has(page.url)}
                      onCheckedChange={() => toggleUrlSelection(page.url)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{page.title || new URL(page.url).pathname}</p>
                      <p className="text-xs text-muted-foreground truncate">{page.url}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedUrls.size}</span> pages selected
                </p>
                <Button
                  onClick={handleTestResponsive}
                  disabled={loading || selectedUrls.size === 0}
                  className="gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Responsive Test
                    </>
                  )}
                </Button>
              </div>

              {loading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Testing viewports...</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{error}</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* No Crawl Data */}
        {!crawlData && !crawling && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Monitor className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">No website crawled yet</h3>
                <p className="text-muted-foreground max-w-md">
                  Enter a URL above to crawl and test responsive design.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Results */}
        {testResults && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="text-center">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold">{testResults.summary.total}</p>
                  <p className="text-sm text-muted-foreground">Pages Tested</p>
                </CardContent>
              </Card>
              <Card className="text-center border-green-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-green-500">{testResults.summary.passed}</p>
                  <p className="text-sm text-muted-foreground">Passed</p>
                </CardContent>
              </Card>
              <Card className="text-center border-yellow-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-yellow-500">{testResults.summary.warnings}</p>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                </CardContent>
              </Card>
              <Card className="text-center border-red-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-red-500">{testResults.summary.failed}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </CardContent>
              </Card>
              <Card className="text-center border-gray-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-gray-500">{testResults.summary.errors}</p>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </CardContent>
              </Card>
            </div>

            {/* Viewport Legend */}
            <div className="flex items-center gap-6 text-sm">
              <span className="text-muted-foreground">Viewports tested:</span>
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <span>Mobile (375px)</span>
              </div>
              <div className="flex items-center gap-2">
                <Tablet className="h-4 w-4" />
                <span>Tablet (768px)</span>
              </div>
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                <span>Desktop (1440px)</span>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-4">
              {testResults.results.map((result) => (
                <Collapsible
                  key={result.url}
                  open={expandedPage === result.url}
                  onOpenChange={(open) => setExpandedPage(open ? result.url : null)}
                >
                  <Card className="shadow-elegant">
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {getStatusIcon(result.status)}
                            <div className="text-left">
                              <p className="font-medium">{new URL(result.url).pathname || "/"}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-md">{result.url}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {/* Viewport status badges */}
                            <div className="flex gap-2">
                              {Object.entries(result.viewports).map(([key, vp]) => (
                                <div
                                  key={key}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                                    vp.status === "pass"
                                      ? "bg-green-500/10 text-green-500"
                                      : vp.status === "warning"
                                      ? "bg-yellow-500/10 text-yellow-500"
                                      : "bg-red-500/10 text-red-500"
                                  }`}
                                >
                                  {getViewportIcon(key)}
                                  {vp.status === "pass" ? "✓" : vp.status === "warning" ? "!" : "✗"}
                                </div>
                              ))}
                            </div>
                            {expandedPage === result.url ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-6">
                        {/* Screenshots */}
                        <div>
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <Image className="h-4 w-4" />
                            Screenshots
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {Object.entries(result.viewports).map(([key, vp]) => (
                              <div key={key} className="border rounded-lg overflow-hidden">
                                <div className="p-2 bg-muted flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {getViewportIcon(key)}
                                    <span className="text-sm font-medium">{vp.name}</span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={
                                      vp.status === "pass"
                                        ? "border-green-500 text-green-500"
                                        : vp.status === "warning"
                                        ? "border-yellow-500 text-yellow-500"
                                        : "border-red-500 text-red-500"
                                    }
                                  >
                                    {vp.status}
                                  </Badge>
                                </div>
                                {vp.screenshot && (
                                  <a
                                    href={`${API_BASE.replace("/api", "")}${vp.screenshot}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                  >
                                    <img
                                      src={`${API_BASE.replace("/api", "")}${vp.screenshot}`}
                                      alt={`${vp.name} screenshot`}
                                      className="w-full h-48 object-cover object-top hover:opacity-80 transition-opacity"
                                    />
                                  </a>
                                )}
                                <div className="p-2 text-xs text-muted-foreground">
                                  {vp.width}x{vp.height}px • {vp.device}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Issues */}
                        {result.issues.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Issues Found ({result.issues.length})
                            </h4>
                            <div className="space-y-2">
                              {result.issues.map((issue, idx) => (
                                <div
                                  key={idx}
                                  className={`p-3 rounded-lg border ${getSeverityColor(issue.severity)}`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <Badge variant="outline" className="text-xs">
                                      {issue.viewport}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={getSeverityColor(issue.severity)}
                                    >
                                      {issue.severity}
                                    </Badge>
                                  </div>
                                  <p className="text-sm">{issue.message}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Link to page */}
                        <div className="pt-4 border-t">
                          <Button variant="outline" size="sm" asChild>
                            <a href={result.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                              <ExternalLink className="h-4 w-4" />
                              Open Page
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>

            {/* Run Again Button */}
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setTestResults(null);
                  setProgress(0);
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear Results & Test Again
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ResponsiveTesting;

