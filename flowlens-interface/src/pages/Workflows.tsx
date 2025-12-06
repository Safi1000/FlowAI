import { useEffect, useState } from "react";
import { Search, Play, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type FormPage = {
  url: string;
  title: string;
  forms: number;
  inputs: number;
  buttons: number;
};

type FormTestResult = {
  url: string;
  title: string;
  status: "passed" | "failed" | "inconclusive" | "error" | "pending";
  filledFields?: { selector: string; value: string; description?: string }[];
  submitClicked?: boolean;
  aiPlan?: {
    fillActions: { selector: string; value: string; description: string }[];
    submitSelector: string;
  };
  aiAnalysis?: {
    status: string;
    confidence: number;
    reason: string;
    detectedMessages: string[];
  };
  error?: string;
};

type TestResults = {
  total: number;
  passed: FormTestResult[];
  failed: FormTestResult[];
  inconclusive: FormTestResult[];
  errors: FormTestResult[];
  passRate: number;
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

const Workflows = () => {
  const [formPages, setFormPages] = useState<FormPage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPage, setSelectedPage] = useState<FormPage | null>(null);
  const [testResults, setTestResults] = useState<Map<string, FormTestResult>>(new Map());
  const [testingUrl, setTestingUrl] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailResult, setDetailResult] = useState<FormTestResult | null>(null);

  // Load form pages from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("flowai:formPages");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFormPages(parsed);
          if (parsed.length > 0) {
            setSelectedPage(parsed[0]);
          }
        }
      }
    } catch {}
  }, []);

  const filteredPages = formPages.filter((page) =>
    page.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTestForm = async (page: FormPage) => {
    setTestingUrl(page.url);
    
    try {
      const resp = await fetch(`${API_BASE}/test-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formPages: [page] }),
      });
      
      const data: TestResults = await resp.json();
      
      if (!resp.ok || data?.error) {
        throw new Error((data as unknown as { error: string })?.error || `Test failed (${resp.status})`);
      }
      
      // Get the result for this page
      const result = [...data.passed, ...data.failed, ...data.inconclusive, ...data.errors][0];
      if (result) {
        setTestResults((prev) => new Map(prev).set(page.url, result));
      }
    } catch (e: unknown) {
      const err = e as Error;
      setTestResults((prev) => new Map(prev).set(page.url, {
        url: page.url,
        title: page.title,
        status: "error",
        error: err?.message || "Test failed",
      }));
    } finally {
      setTestingUrl(null);
    }
  };

  const handleTestAll = async () => {
    if (formPages.length === 0) return;
    setTestingAll(true);
    
    try {
      const resp = await fetch(`${API_BASE}/test-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formPages }),
      });
      
      const data: TestResults = await resp.json();
      
      if (!resp.ok) {
        throw new Error("Test failed");
      }
      
      // Update all results
      const newResults = new Map<string, FormTestResult>();
      [...data.passed, ...data.failed, ...data.inconclusive, ...data.errors].forEach((r) => {
        newResults.set(r.url, r);
      });
      setTestResults(newResults);
    } catch (e: unknown) {
      console.error("Test all failed:", e);
    } finally {
      setTestingAll(false);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "inconclusive":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "passed":
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Passed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "inconclusive":
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Inconclusive</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Not Tested</Badge>;
    }
  };

  const stats = {
    total: formPages.length,
    tested: testResults.size,
    passed: [...testResults.values()].filter((r) => r.status === "passed").length,
    failed: [...testResults.values()].filter((r) => r.status === "failed").length,
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Form Tests</h1>
              <p className="text-muted-foreground">
                AI-powered form testing with automatic fill and submit
              </p>
            </div>
            {formPages.length > 0 && (
              <Button
                onClick={handleTestAll}
                disabled={testingAll || testingUrl !== null}
                className="gap-2"
              >
                {testingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing All...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Test All Forms
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Stats */}
          {formPages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Forms</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.tested}</p>
                <p className="text-sm text-muted-foreground">Tested</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-green-500">{stats.passed}</p>
                <p className="text-sm text-muted-foreground">Passed</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </Card>
            </div>
          )}

          <div className="flex gap-6 h-[calc(100vh-280px)]">
            {/* Left Panel - Form List */}
            <div className="w-full lg:w-96 flex flex-col space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search forms..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Form List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {formPages.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No forms detected yet. Run a crawl from Flow Generator first.
                  </div>
                )}

                {filteredPages.map((page, idx) => {
                  const result = testResults.get(page.url);
                  const isSelected = selectedPage?.url === page.url;
                  const isTesting = testingUrl === page.url;

                  return (
                    <Card
                      key={page.url + idx}
                      className={`p-4 cursor-pointer transition-all duration-200 ${
                        isSelected ? "border-primary shadow-lg" : "hover:shadow-md hover:-translate-y-0.5"
                      }`}
                      onClick={() => setSelectedPage(page)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-foreground truncate">{page.title}</h3>
                          <p className="text-xs text-muted-foreground truncate">{new URL(page.url).pathname}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result?.status)}
                          {getStatusBadge(result?.status)}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>Inputs: {page.inputs}</span>
                          <span>Buttons: {page.buttons}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isTesting || testingAll}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestForm(page);
                          }}
                        >
                          {isTesting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Details */}
            <Card className="hidden lg:flex flex-1 p-6 flex-col">
              {!selectedPage ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Select a form to view details
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedPage.title}</h2>
                      <p className="text-sm text-muted-foreground break-all">{selectedPage.url}</p>
                    </div>
                    {testResults.get(selectedPage.url) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDetailResult(testResults.get(selectedPage.url) || null);
                          setShowDetails(true);
                        }}
                      >
                        View Details
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{selectedPage.forms}</p>
                      <p className="text-xs text-muted-foreground">Forms</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{selectedPage.inputs}</p>
                      <p className="text-xs text-muted-foreground">Inputs</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold">{selectedPage.buttons}</p>
                      <p className="text-xs text-muted-foreground">Buttons</p>
                    </div>
                  </div>

                  {/* Test Result */}
                  {testResults.get(selectedPage.url) && (
                    <div className="flex-1 overflow-auto">
                      <h3 className="font-medium mb-3">Test Result</h3>
                      {(() => {
                        const result = testResults.get(selectedPage.url)!;
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(result.status)}
                              <span className="font-medium capitalize">{result.status}</span>
                            </div>

                            {result.aiAnalysis && (
                              <div className="border rounded-lg p-4 space-y-2">
                                <p className="text-sm font-medium">AI Analysis</p>
                                <p className="text-sm text-muted-foreground">{result.aiAnalysis.reason}</p>
                                <p className="text-xs text-muted-foreground">
                                  Confidence: {Math.round(result.aiAnalysis.confidence * 100)}%
                                </p>
                                {result.aiAnalysis.detectedMessages.length > 0 && (
                                  <div className="text-xs">
                                    <p className="font-medium">Detected Messages:</p>
                                    {result.aiAnalysis.detectedMessages.map((msg, i) => (
                                      <p key={i} className="text-muted-foreground">• {msg}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {result.filledFields && result.filledFields.length > 0 && (
                              <div className="border rounded-lg p-4 space-y-2">
                                <p className="text-sm font-medium">Filled Fields ({result.filledFields.length})</p>
                                <div className="space-y-1 text-xs">
                                  {result.filledFields.map((field, i) => (
                                    <div key={i} className="flex justify-between">
                                      <span className="text-muted-foreground">{field.description || field.selector}</span>
                                      <span className="font-mono">{field.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {result.error && (
                              <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/10">
                                <p className="text-sm font-medium text-destructive">Error</p>
                                <p className="text-sm text-muted-foreground">{result.error}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {!testResults.get(selectedPage.url) && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center space-y-4">
                        <p className="text-muted-foreground">Form not tested yet</p>
                        <Button
                          onClick={() => handleTestForm(selectedPage)}
                          disabled={testingUrl !== null || testingAll}
                        >
                          {testingUrl === selectedPage.url ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Run Test
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Test Details</DialogTitle>
          </DialogHeader>
          {detailResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {getStatusIcon(detailResult.status)}
                <span className="font-medium capitalize">{detailResult.status}</span>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">URL</p>
                <p className="text-sm text-muted-foreground break-all">{detailResult.url}</p>
              </div>

              {detailResult.aiPlan && (
                <div>
                  <p className="text-sm font-medium mb-2">AI Fill Plan</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48">
                    {JSON.stringify(detailResult.aiPlan, null, 2)}
                  </pre>
                </div>
              )}

              {detailResult.aiAnalysis && (
                <div>
                  <p className="text-sm font-medium mb-2">AI Analysis</p>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-48">
                    {JSON.stringify(detailResult.aiAnalysis, null, 2)}
                  </pre>
                </div>
              )}

              {detailResult.error && (
                <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/10">
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="text-sm">{detailResult.error}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Workflows;
