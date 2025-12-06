import { useEffect, useState } from "react";
import {
  Play,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Zap,
  Globe,
  Clock,
  HardDrive,
  FileCode,
  Image,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Gauge,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Metrics = {
  LCP: number;
  CLS: number;
  FCP: number;
  TTFB: number;
  DOMContentLoaded: number;
  LoadComplete: number;
  DOMInteractive: number;
  DOMElements: number;
  DOMDepth: number;
  PageSize: number;
  RequestCount: number;
  ImageSize: number;
  JSSize: number;
  CSSSize: number;
};

type ResourceInfo = {
  total: { count: number; size: number };
  byType: Record<string, { count: number; size: number }>;
};

type Issue = {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  suggestion: string;
};

type PageResult = {
  url: string;
  status: "good" | "needs-improvement" | "poor" | "error";
  metrics: Metrics;
  resources: ResourceInfo;
  scores: Record<string, string>;
  issues: Issue[];
  overallScore: number;
  error?: string;
};

type PerformanceResults = {
  results: PageResult[];
  summary: {
    total: number;
    good: number;
    needsImprovement: number;
    poor: number;
    errors: number;
    averageScore: number;
    averageMetrics: {
      LCP: number;
      FCP: number;
      CLS: number;
      TTFB: number;
      PageSize: number;
    };
  };
};

type CrawlData = {
  startUrl: string;
  totalPages: number;
  results: { url: string; title?: string }[];
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Format milliseconds
function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const PerformanceTesting = () => {
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null);
  const [testResults, setTestResults] = useState<PerformanceResults | null>(null);
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

  // Run performance test
  const handleTestPerformance = async () => {
    if (selectedUrls.size === 0) return;

    setLoading(true);
    setError(null);
    setTestResults(null);
    setProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 2, 90));
      }, 1000);

      const resp = await fetch(`${API_BASE}/test-performance`, {
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
      setError(err?.message || "Performance testing failed");
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
      case "good":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "needs-improvement":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "poor":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <XCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getMetricBadge = (score: string) => {
    switch (score) {
      case "good":
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Good</Badge>;
      case "needs-improvement":
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Needs Work</Badge>;
      case "poor":
        return <Badge variant="destructive">Poor</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "border-red-500/30 bg-red-500/10";
      case "medium":
        return "border-yellow-500/30 bg-yellow-500/10";
      case "low":
        return "border-blue-500/30 bg-blue-500/10";
      default:
        return "border-gray-500/30 bg-gray-500/10";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Zap className="h-8 w-8 text-primary" />
              Performance Testing
            </h1>
            <p className="text-muted-foreground">
              Measure Core Web Vitals, load times, and resource sizes
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
            <CardDescription>Crawl a website to select pages for performance testing</CardDescription>
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
                  onClick={handleTestPerformance}
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
                      Run Performance Test
                    </>
                  )}
                </Button>
              </div>

              {loading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Measuring performance...</span>
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
                <Zap className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">No website crawled yet</h3>
                <p className="text-muted-foreground max-w-md">
                  Enter a URL above to crawl and test performance.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Results */}
        {testResults && (
          <>
            {/* Overall Score */}
            <Card className="shadow-elegant">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center ${getScoreBgColor(testResults.summary.averageScore)}`}>
                        <div className="w-20 h-20 rounded-full bg-background flex items-center justify-center">
                          <span className={`text-3xl font-bold ${getScoreColor(testResults.summary.averageScore)}`}>
                            {testResults.summary.averageScore}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Performance Score</h2>
                      <p className="text-muted-foreground">Average across {testResults.summary.total} pages</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-6 text-center">
                    <div>
                      <p className="text-2xl font-bold text-green-500">{testResults.summary.good}</p>
                      <p className="text-sm text-muted-foreground">Good</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-yellow-500">{testResults.summary.needsImprovement}</p>
                      <p className="text-sm text-muted-foreground">Needs Work</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-500">{testResults.summary.poor}</p>
                      <p className="text-sm text-muted-foreground">Poor</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-500">{testResults.summary.errors}</p>
                      <p className="text-sm text-muted-foreground">Errors</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Average Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{formatMs(testResults.summary.averageMetrics.LCP)}</p>
                  <p className="text-sm text-muted-foreground">Avg LCP</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <TrendingUp className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{formatMs(testResults.summary.averageMetrics.FCP)}</p>
                  <p className="text-sm text-muted-foreground">Avg FCP</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Gauge className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{testResults.summary.averageMetrics.CLS}</p>
                  <p className="text-sm text-muted-foreground">Avg CLS</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Zap className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{formatMs(testResults.summary.averageMetrics.TTFB)}</p>
                  <p className="text-sm text-muted-foreground">Avg TTFB</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <HardDrive className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{formatBytes(testResults.summary.averageMetrics.PageSize)}</p>
                  <p className="text-sm text-muted-foreground">Avg Size</p>
                </CardContent>
              </Card>
            </div>

            {/* Results List */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Page Results</h3>
              
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
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getScoreBgColor(result.overallScore)}`}>
                              <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                                <span className={`text-lg font-bold ${getScoreColor(result.overallScore)}`}>
                                  {result.overallScore}
                                </span>
                              </div>
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
                        {/* Core Web Vitals */}
                        <div>
                          <h4 className="font-medium mb-3">Core Web Vitals</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">LCP</span>
                                {getMetricBadge(result.scores.LCP)}
                              </div>
                              <p className="text-2xl font-bold">{formatMs(result.metrics.LCP)}</p>
                              <p className="text-xs text-muted-foreground">Largest Contentful Paint</p>
                            </div>
                            <div className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">FCP</span>
                                {getMetricBadge(result.scores.FCP)}
                              </div>
                              <p className="text-2xl font-bold">{formatMs(result.metrics.FCP)}</p>
                              <p className="text-xs text-muted-foreground">First Contentful Paint</p>
                            </div>
                            <div className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">CLS</span>
                                {getMetricBadge(result.scores.CLS)}
                              </div>
                              <p className="text-2xl font-bold">{result.metrics.CLS}</p>
                              <p className="text-xs text-muted-foreground">Cumulative Layout Shift</p>
                            </div>
                            <div className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">TTFB</span>
                                {getMetricBadge(result.scores.TTFB)}
                              </div>
                              <p className="text-2xl font-bold">{formatMs(result.metrics.TTFB)}</p>
                              <p className="text-xs text-muted-foreground">Time to First Byte</p>
                            </div>
                          </div>
                        </div>

                        {/* Resource Breakdown */}
                        <div>
                          <h4 className="font-medium mb-3">Resources</h4>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="border rounded-lg p-3 text-center">
                              <HardDrive className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                              <p className="font-bold">{formatBytes(result.metrics.PageSize)}</p>
                              <p className="text-xs text-muted-foreground">Total Size</p>
                            </div>
                            <div className="border rounded-lg p-3 text-center">
                              <Globe className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                              <p className="font-bold">{result.metrics.RequestCount}</p>
                              <p className="text-xs text-muted-foreground">Requests</p>
                            </div>
                            <div className="border rounded-lg p-3 text-center">
                              <Image className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                              <p className="font-bold">{formatBytes(result.metrics.ImageSize)}</p>
                              <p className="text-xs text-muted-foreground">Images</p>
                            </div>
                            <div className="border rounded-lg p-3 text-center">
                              <FileCode className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                              <p className="font-bold">{formatBytes(result.metrics.JSSize)}</p>
                              <p className="text-xs text-muted-foreground">JavaScript</p>
                            </div>
                            <div className="border rounded-lg p-3 text-center">
                              <FileCode className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                              <p className="font-bold">{formatBytes(result.metrics.CSSSize)}</p>
                              <p className="text-xs text-muted-foreground">CSS</p>
                            </div>
                          </div>
                        </div>

                        {/* Issues */}
                        {result.issues.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Issues & Suggestions ({result.issues.length})
                            </h4>
                            <div className="space-y-2">
                              {result.issues.map((issue, idx) => (
                                <div
                                  key={idx}
                                  className={`p-4 rounded-lg border ${getSeverityColor(issue.severity)}`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <Badge variant="outline">{issue.type}</Badge>
                                    <Badge
                                      variant={issue.severity === "high" ? "destructive" : "outline"}
                                    >
                                      {issue.severity}
                                    </Badge>
                                  </div>
                                  <p className="text-sm font-medium mb-1">{issue.message}</p>
                                  <p className="text-sm text-muted-foreground">💡 {issue.suggestion}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {result.issues.length === 0 && (
                          <div className="text-center py-4 text-green-500">
                            <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                            <p className="font-medium">No performance issues detected!</p>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>

            {/* Test Again Button */}
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setTestResults(null);
                  setProgress(0);
                }}
                className="gap-2"
              >
                Clear Results & Test Again
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PerformanceTesting;

