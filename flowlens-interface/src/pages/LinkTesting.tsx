import { useEffect, useState } from "react";
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Link2,
  ArrowRight,
  RefreshCw,
  Globe,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type LinkResult = {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  redirected?: boolean;
  finalUrl?: string;
  isInternal?: boolean;
  isExternal?: boolean;
  error?: string;
};

type LinkTestResults = {
  total: number;
  tested: number;
  working: LinkResult[];
  broken: LinkResult[];
  redirected: LinkResult[];
  errors: LinkResult[];
  summary: {
    working: number;
    broken: number;
    redirected: number;
    errors: number;
  };
};

type CrawlData = {
  startUrl: string;
  totalPages: number;
  results: { url: string; links?: string[] }[];
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

const LinkTesting = () => {
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null);
  const [testResults, setTestResults] = useState<LinkTestResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [testExternal, setTestExternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [directUrl, setDirectUrl] = useState("");

  // Load crawl data from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("flowai:lastCrawl");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.results) {
          setCrawlData(parsed);
        }
      }
    } catch {}
  }, []);

  const totalLinks = crawlData?.results?.reduce((acc, page) => {
    return acc + (page.links?.length || 0);
  }, 0) || 0;

  // Crawl a URL directly from this page
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
        body: JSON.stringify({ url: directUrl, maxPages: 30 }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await resp.json();

      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Crawl failed (${resp.status})`);
      }

      setCrawlData(data);
      try { localStorage.setItem("flowai:lastCrawl", JSON.stringify(data)); } catch {}
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Crawl failed");
    } finally {
      setCrawling(false);
      setProgress(0);
    }
  };

  const handleTestLinks = async () => {
    if (!crawlData) return;
    
    setLoading(true);
    setError(null);
    setTestResults(null);
    setProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      const resp = await fetch(`${API_BASE}/test-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crawlData,
          testExternal,
          maxLinks: 100,
        }),
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
      setError(err?.message || "Link testing failed");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (result: LinkResult) => {
    if (result.error) {
      return <Badge variant="destructive">Error</Badge>;
    }
    if (result.status >= 400) {
      return <Badge variant="destructive">{result.status}</Badge>;
    }
    if (result.redirected) {
      return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">{result.status} → Redirect</Badge>;
    }
    return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">{result.status}</Badge>;
  };

  const getFilteredResults = () => {
    if (!testResults) return [];
    
    switch (activeTab) {
      case "working":
        return testResults.working;
      case "broken":
        return testResults.broken;
      case "redirected":
        return testResults.redirected;
      case "errors":
        return testResults.errors;
      default:
        return [
          ...testResults.broken,
          ...testResults.errors,
          ...testResults.redirected,
          ...testResults.working,
        ];
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
              <Link2 className="h-8 w-8 text-primary" />
              Link Testing
            </h1>
            <p className="text-muted-foreground">
              Find broken links and 404 errors across your website
            </p>
          </div>
          {testResults && (
            <Button
              onClick={handleTestLinks}
              disabled={loading}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Re-run Test
            </Button>
          )}
        </div>

        {/* URL Input - Always show */}
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Enter Website URL
            </CardTitle>
            <CardDescription>
              Crawl a website to find and test all its links
            </CardDescription>
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

        {/* No Crawl Data */}
        {!crawlData && !crawling && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Link2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">No website crawled yet</h3>
                <p className="text-muted-foreground max-w-md">
                  Enter a URL above to crawl and test all links on the website.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Has Crawl Data - Show Test Options */}
        {crawlData && !testResults && (
          <Card className="shadow-elegant border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Ready to Test
              </CardTitle>
              <CardDescription>
                Crawled <span className="font-medium text-foreground">{crawlData.startUrl}</span> — Found {totalLinks} links from {crawlData.totalPages} pages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="test-external" className="font-medium">Test External Links</Label>
                  <p className="text-sm text-muted-foreground">
                    Also check links pointing to other websites
                  </p>
                </div>
                <Switch
                  id="test-external"
                  checked={testExternal}
                  onCheckedChange={setTestExternal}
                />
              </div>

              {loading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Testing links...</span>
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

              <Button
                onClick={handleTestLinks}
                disabled={loading}
                className="w-full gap-2"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Testing Links...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    Start Link Test
                  </>
                )}
              </Button>
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
                  <p className="text-3xl font-bold">{testResults.tested}</p>
                  <p className="text-sm text-muted-foreground">Links Tested</p>
                </CardContent>
              </Card>
              <Card className="text-center border-green-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-green-500">{testResults.summary.working}</p>
                  <p className="text-sm text-muted-foreground">Working</p>
                </CardContent>
              </Card>
              <Card className="text-center border-red-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-red-500">{testResults.summary.broken}</p>
                  <p className="text-sm text-muted-foreground">Broken</p>
                </CardContent>
              </Card>
              <Card className="text-center border-yellow-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-yellow-500">{testResults.summary.redirected}</p>
                  <p className="text-sm text-muted-foreground">Redirected</p>
                </CardContent>
              </Card>
              <Card className="text-center border-orange-500/30">
                <CardContent className="pt-6">
                  <p className="text-3xl font-bold text-orange-500">{testResults.summary.errors}</p>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </CardContent>
              </Card>
            </div>

            {/* Results Table */}
            <Card className="shadow-elegant">
              <CardHeader>
                <CardTitle>Link Results</CardTitle>
                <CardDescription>
                  Detailed status for each tested link
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="all" className="gap-2">
                      All
                      <Badge variant="secondary">{testResults.tested}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="broken" className="gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Broken
                      <Badge variant="destructive">{testResults.summary.broken}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="errors" className="gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Errors
                      <Badge variant="secondary">{testResults.summary.errors}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="redirected" className="gap-2">
                      <ArrowRight className="h-4 w-4 text-yellow-500" />
                      Redirected
                      <Badge variant="secondary">{testResults.summary.redirected}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="working" className="gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Working
                      <Badge variant="secondary">{testResults.summary.working}</Badge>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value={activeTab} className="mt-0">
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50%]">URL</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getFilteredResults().length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                No links in this category
                              </TableCell>
                            </TableRow>
                          ) : (
                            getFilteredResults().slice(0, 50).map((result, idx) => (
                              <TableRow key={result.url + idx}>
                                <TableCell className="font-mono text-sm">
                                  <div className="truncate max-w-md" title={result.url}>
                                    {new URL(result.url).pathname || "/"}
                                  </div>
                                  {result.redirected && result.finalUrl && (
                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                      <ArrowRight className="h-3 w-3" />
                                      <span className="truncate">{new URL(result.finalUrl).pathname}</span>
                                    </div>
                                  )}
                                  {result.error && (
                                    <div className="text-xs text-destructive mt-1">
                                      {result.error}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {result.isInternal ? "Internal" : "External"}
                                  </Badge>
                                </TableCell>
                                <TableCell>{getStatusBadge(result)}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    asChild
                                  >
                                    <a href={result.url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {getFilteredResults().length > 50 && (
                      <p className="text-sm text-muted-foreground text-center mt-4">
                        Showing first 50 of {getFilteredResults().length} results
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LinkTesting;

