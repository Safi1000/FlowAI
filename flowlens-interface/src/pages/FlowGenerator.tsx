import { useEffect, useMemo, useRef, useState } from "react";
import {
  PlayCircle,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Monitor,
  Zap,
  Link2,
  Smartphone,
  Tablet,
  ChevronDown,
  Image as ImageIcon,
  Eye,
  Settings2,
  Sparkles,
  ListChecks,
  Play,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// Shared crawl types
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

// Performance types
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

 type PerformanceIssue = {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  suggestion: string;
};

 type PerformancePageResult = {
  url: string;
  status: "good" | "needs-improvement" | "poor" | "error";
  metrics: Metrics;
  resources: { total: { count: number; size: number }; byType: Record<string, { count: number; size: number }> };
  scores: Record<string, string>;
  issues: PerformanceIssue[];
  overallScore: number;
  error?: string;
};

 type PerformanceResults = {
  results: PerformancePageResult[];
  summary: {
    total: number;
    good: number;
    needsImprovement: number;
    poor: number;
    errors: number;
    averageScore: number;
    averageMetrics: { LCP: number; FCP: number; CLS: number; TTFB: number; PageSize: number };
  };
};

// Responsive types
 type ViewportResult = {
  width: number;
  height: number;
  name: string;
  device: string;
  status: "pass" | "warning" | "fail" | "error";
  screenshot?: string;
  issues?: { type: string; severity: string; message: string }[];
  error?: string;
};

 type ResponsivePageResult = {
  url: string;
  status: "pass" | "warning" | "fail" | "error";
  viewports: Record<string, ViewportResult>;
  issues: { type: string; severity: string; message: string; viewport: string }[];
  screenshots: Record<string, string>;
  error?: string;
};

 type ResponsiveTestResults = {
  results: ResponsivePageResult[];
  summary: { total: number; passed: number; warnings: number; failed: number; errors: number };
  viewportsTested: string[];
};

// Link types
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
  summary: { working: number; broken: number; redirected: number; errors: number };
};

// Form test types
type FormTestResult = {
  url: string;
  title: string;
  status: "passed" | "failed" | "inconclusive" | "error" | "pending";
  filledFields?: { selector: string; value: string; description?: string }[];
  submitClicked?: boolean;
  aiPlan?: { fillActions: { selector: string; value: string; description: string }[]; submitSelector: string };
  aiAnalysis?: { status: string; confidence: number; reason: string };
  error?: string;
};

 type FormTestSuite = {
  total: number;
  passed: FormTestResult[];
  failed: FormTestResult[];
  inconclusive: FormTestResult[];
  errors: FormTestResult[];
  passRate: number;
};

// Form plan preview types
type FormPlanResponse = {
  url: string;
  title: string;
  formData: {
    inputs: { selector: string; type: string; label?: string; name?: string; placeholder?: string }[];
    buttons: { selector: string; text: string; type?: string }[];
  };
  aiPlan: {
    fillActions: { selector: string; value: string; description: string }[];
    submitSelector: string;
    submitDescription?: string;
  };
};

type EditableFillAction = {
  selector: string;
  value: string;
  description: string;
  skip: boolean;
  inputType: string;
};

type WorkflowStep = {
  index?: number;
  action: string;
  selector?: string;
  value?: string;
  description?: string;
  url?: string;
  title?: string;
  status?: string;
  error?: string | null;
};

// New intelligent workflow detection types
type DetectedWorkflow = {
  id: string;
  type: string;
  name: string;
  description: string;
  available: boolean;
  confidence: number;
  reason: string;
  pageUrl: string | null;
  pageTitle: string | null;
  fields?: string[]; // Field names for display
  steps: WorkflowStep[];
};

type WorkflowDiscoveryResponse = {
  url: string;
  detectedWorkflows: DetectedWorkflow[];
  pagesScanned: number;
  summary: string;
  error?: string;
};

type WorkflowExecutionResult = {
  status: "passed" | "failed" | "inconclusive";
  reason?: string;
  confidence?: number;
  error?: string | null;
  steps: WorkflowStep[];
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function FlowGenerator() {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);
  const [formDetection, setFormDetection] = useState<FormDetectionResult | null>(null);
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  const [perfLoading, setPerfLoading] = useState(false);
  const [perfProgress, setPerfProgress] = useState(0);
  const [perfResults, setPerfResults] = useState<PerformanceResults | null>(null);

  const [respLoading, setRespLoading] = useState(false);
  const [respProgress, setRespProgress] = useState(0);
  const [respResults, setRespResults] = useState<ResponsiveTestResults | null>(null);

  const [linkLoading, setLinkLoading] = useState(false);
  const [linkProgress, setLinkProgress] = useState(0);
  const [linkResults, setLinkResults] = useState<LinkTestResults | null>(null);
  const [testExternal, setTestExternal] = useState(false);
  const [linkTab, setLinkTab] = useState("all");

  const [formTesting, setFormTesting] = useState(false);
  const [formTestingUrl, setFormTestingUrl] = useState<string | null>(null);
  const [formTestResults, setFormTestResults] = useState<Map<string, FormTestResult>>(new Map());

  // Plan preview state
  const [showPlanPreview, setShowPlanPreview] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<FormPlanResponse | null>(null);
  const [editablePlan, setEditablePlan] = useState<EditableFillAction[]>([]);
  const [skipSubmit, setSkipSubmit] = useState(false);
  const [previewFormPage, setPreviewFormPage] = useState<FormPage | null>(null);

  // Workflow detection/execution (new intelligent system)
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [detectedWorkflows, setDetectedWorkflows] = useState<DetectedWorkflow[]>([]);
  const [pagesScanned, setPagesScanned] = useState(0);
  const [selectedWorkflow, setSelectedWorkflow] = useState<DetectedWorkflow | null>(null);
  const [showWorkflowPreview, setShowWorkflowPreview] = useState(false);
  const [editableSteps, setEditableSteps] = useState<(WorkflowStep & { skip?: boolean })[]>([]);
  const [workflowRunResult, setWorkflowRunResult] = useState<WorkflowExecutionResult | null>(null);
  const [workflowRunLoading, setWorkflowRunLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Load previous crawl + detection from storage
  useEffect(() => {
    try {
      const rawCrawl = localStorage.getItem("flowai:lastCrawl");
      if (rawCrawl) {
        const parsed = JSON.parse(rawCrawl) as CrawlResult;
        if (parsed?.results) {
          setCrawlResult(parsed);
          const defaults = new Set(parsed.results.slice(0, 5).map((p) => p.url));
          setSelectedUrls(defaults);
        }
      }

      const rawForms = localStorage.getItem("flowai:formPages");
      if (rawForms) {
        const pages = JSON.parse(rawForms) as FormPage[];
        setFormDetection((prev) => ({
          totalPages: prev?.totalPages || crawlResult?.totalPages || pages.length,
          pagesWithForms: pages.length,
          formPages: pages,
        }));
      }
    } catch {}
  }, []);

  // Reset workflow preview when detected workflows change
  useEffect(() => {
    if (detectedWorkflows.length === 0) {
      setSelectedWorkflow(null);
      setShowWorkflowPreview(false);
    }
  }, [detectedWorkflows]);

  const handleIntelligentCrawl = async () => {
    if (!url) return;
    setIntelLoading(true);
    setProgress(0);
    setError(null);
    setCrawlResult(null);
    setFormDetection(null);
    setSelectedUrls(new Set());
    setPerfResults(null);
    setRespResults(null);
    setLinkResults(null);
    setFormTestResults(new Map());
    setPipelineStep("crawl");

    try {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      for (let i = 0; i <= 50; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (ctrl.signal.aborted) break;
        setProgress(i);
      }

      const crawlResp = await fetch(`${API_BASE}/intelligent-crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxDepth: 3, maxPages: 50 }),
        signal: ctrl.signal,
      });
      const crawlData = (await crawlResp.json()) as CrawlResult;
      setProgress(70);

      if (!crawlResp.ok || crawlData?.error) {
        setError(crawlData?.error || `Crawl failed with status ${crawlResp.status}`);
        return;
      }

      setCrawlResult(crawlData);
      const defaults = new Set(crawlData.results.slice(0, 5).map((p) => p.url));
      setSelectedUrls(defaults);
      try {
        localStorage.setItem("flowai:lastCrawl", JSON.stringify(crawlData));
      } catch {}

      setPipelineStep("detect");
      setProgress(85);

      const detectResp = await fetch(`${API_BASE}/detect-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawlData }),
        signal: ctrl.signal,
      });
      const detectData = (await detectResp.json()) as FormDetectionResult & { error?: string };

      if (!detectResp.ok || detectData?.error) {
        throw new Error(detectData?.error || `Form detection failed (${detectResp.status})`);
      }

      setFormDetection(detectData);
      try {
        localStorage.setItem("flowai:formPages", JSON.stringify(detectData.formPages));
      } catch {}

      setProgress(100);
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

  // New intelligent workflow discovery (site-wide)
  const handleDiscoverWorkflows = async () => {
    if (!url) return;
    setWorkflowLoading(true);
    setWorkflowError(null);
    setDetectedWorkflows([]);
    setPagesScanned(0);
    setSelectedWorkflow(null);
    setWorkflowRunResult(null);
    setShowWorkflowPreview(false);
    
    try {
      const resp = await fetch(`${API_BASE}/discover-workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await resp.json()) as WorkflowDiscoveryResponse;
      if (!resp.ok || data.error) {
        throw new Error(data.error || `Discovery failed (${resp.status})`);
      }
      setDetectedWorkflows(data.detectedWorkflows || []);
      setPagesScanned(data.pagesScanned || 0);
    } catch (err) {
      const e = err as Error;
      setWorkflowError(e.message || "Workflow discovery failed");
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handlePreviewWorkflow = (workflow: DetectedWorkflow) => {
    setSelectedWorkflow(workflow);
    // Initialize editable steps with skip property
    setEditableSteps(workflow.steps.map(step => ({ ...step, skip: false })));
    setShowWorkflowPreview(true);
    setWorkflowRunResult(null);
  };

  const updateEditableStep = (idx: number, field: string, value: string | boolean) => {
    setEditableSteps(prev => prev.map((step, i) => 
      i === idx ? { ...step, [field]: value } : step
    ));
  };

  const handleExecuteWorkflow = async (workflow: DetectedWorkflow) => {
    if (!url || !workflow.steps || workflow.steps.length === 0) return;
    setWorkflowRunLoading(true);
    setWorkflowError(null);
    setWorkflowRunResult(null);
    setSelectedWorkflow(workflow);
    
    try {
      const resp = await fetch(`${API_BASE}/execute-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Pass pageUrl so workflow executes on the correct page
        body: JSON.stringify({ url, pageUrl: workflow.pageUrl, steps: workflow.steps }),
      });
      const data = (await resp.json()) as WorkflowExecutionResult & { error?: string };
      if (!resp.ok || data.error) {
        throw new Error(data.error || `Execution failed (${resp.status})`);
      }
      setWorkflowRunResult(data);
    } catch (err) {
      const e = err as Error;
      setWorkflowError(e.message || "Workflow execution failed");
    } finally {
      setWorkflowRunLoading(false);
    }
  };

  // Execute workflow with edited steps
  const handleExecuteEditedWorkflow = async () => {
    if (!url || !selectedWorkflow || editableSteps.length === 0) return;
    
    // Filter out skipped steps
    const stepsToRun = editableSteps.filter(step => !step.skip);
    if (stepsToRun.length === 0) {
      setWorkflowError("No steps to execute (all steps skipped)");
      return;
    }

    setShowWorkflowPreview(false);
    setWorkflowRunLoading(true);
    setWorkflowError(null);
    setWorkflowRunResult(null);
    
    try {
      const resp = await fetch(`${API_BASE}/execute-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url, 
          pageUrl: selectedWorkflow.pageUrl, 
          steps: stepsToRun 
        }),
      });
      const data = (await resp.json()) as WorkflowExecutionResult & { error?: string };
      if (!resp.ok || data.error) {
        throw new Error(data.error || `Execution failed (${resp.status})`);
      }
      setWorkflowRunResult(data);
    } catch (err) {
      const e = err as Error;
      setWorkflowError(e.message || "Workflow execution failed");
    } finally {
      setWorkflowRunLoading(false);
    }
  };

  const getWorkflowIcon = (type: string) => {
    switch (type) {
      case "checkout": return "🛒";
      case "login": return "🔐";
      case "registration": return "📝";
      case "contact": return "✉️";
      case "search": return "🔍";
      case "newsletter": return "📧";
      case "booking": return "📅";
      default: return "⚡";
    }
  };

  const getConfidenceBadge = (confidence: number, available: boolean) => {
    if (!available) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Not Available</Badge>;
    }
    if (confidence >= 80) {
      return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">{confidence}% Confidence</Badge>;
    }
    if (confidence >= 50) {
      return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">{confidence}% Confidence</Badge>;
    }
    return <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30">{confidence}% Confidence</Badge>;
  };

  const toggleUrlSelection = (pageUrl: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(pageUrl)) next.delete(pageUrl);
      else next.add(pageUrl);
      return next;
    });
  };

  const selectAllUrls = () => {
    if (crawlResult) {
      setSelectedUrls(new Set(crawlResult.results.map((p) => p.url)));
    }
  };

  const deselectAllUrls = () => setSelectedUrls(new Set());

  const runPerformanceTest = async () => {
    if (selectedUrls.size === 0) return;
    setPerfLoading(true);
    setPerfProgress(10);
    setPerfResults(null);
    setError(null);

    try {
      const progressInterval = setInterval(() => {
        setPerfProgress((prev) => Math.min(prev + 2, 90));
      }, 900);

      const resp = await fetch(`${API_BASE}/test-performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: Array.from(selectedUrls) }),
      });

      clearInterval(progressInterval);
      setPerfProgress(100);

      const data = (await resp.json()) as PerformanceResults & { error?: string };
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Test failed (${resp.status})`);
      }

      setPerfResults(data);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Performance testing failed");
    } finally {
      setPerfLoading(false);
    }
  };

  const runResponsiveTest = async () => {
    if (selectedUrls.size === 0) return;
    setRespLoading(true);
    setRespProgress(10);
    setRespResults(null);
    setError(null);

    try {
      const progressInterval = setInterval(() => {
        setRespProgress((prev) => Math.min(prev + 2, 90));
      }, 900);

      const resp = await fetch(`${API_BASE}/test-responsive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: Array.from(selectedUrls) }),
      });

      clearInterval(progressInterval);
      setRespProgress(100);

      const data = (await resp.json()) as ResponsiveTestResults & { error?: string };
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Test failed (${resp.status})`);
      }

      setRespResults(data);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Responsive testing failed");
    } finally {
      setRespLoading(false);
    }
  };

  const runLinkTest = async () => {
    if (!crawlResult) return;
    setLinkLoading(true);
    setLinkProgress(10);
    setLinkResults(null);
    setError(null);

    try {
      const progressInterval = setInterval(() => {
        setLinkProgress((prev) => Math.min(prev + 5, 90));
      }, 700);

      const resp = await fetch(`${API_BASE}/test-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawlData: crawlResult, testExternal, maxLinks: 100 }),
      });

      clearInterval(progressInterval);
      setLinkProgress(100);

      const data = (await resp.json()) as LinkTestResults & { error?: string };
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Test failed (${resp.status})`);
      }

      setLinkResults(data);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Link testing failed");
    } finally {
      setLinkLoading(false);
    }
  };

  const testForms = async (pages?: FormPage[]) => {
    const targets = pages || formDetection?.formPages;
    if (!targets || targets.length === 0) return;

    setFormTesting(true);
    setFormTestingUrl(pages && pages.length === 1 ? pages[0].url : null);

    try {
      const resp = await fetch(`${API_BASE}/test-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formPages: targets }),
      });

      const data = (await resp.json()) as FormTestSuite & { error?: string };
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Test failed (${resp.status})`);
      }

      const merged = new Map(formTestResults);
      [...data.passed, ...data.failed, ...data.inconclusive, ...data.errors].forEach((r) => {
        merged.set(r.url, r);
      });
      setFormTestResults(merged);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Form testing failed");
    } finally {
      setFormTesting(false);
      setFormTestingUrl(null);
    }
  };

  // Get form plan for preview/customization
  const getFormPlan = async (page: FormPage) => {
    setPlanLoading(true);
    setPreviewFormPage(page);
    setError(null);

    try {
      const resp = await fetch(`${API_BASE}/get-form-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: page.url }),
      });

      const data = (await resp.json()) as FormPlanResponse & { error?: string };
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Failed to get form plan (${resp.status})`);
      }

      setPreviewPlan(data);
      
      // Convert AI plan to editable format
      const editable: EditableFillAction[] = data.aiPlan.fillActions.map((action) => {
        // Find the input type from formData
        const inputInfo = data.formData.inputs.find((inp) => inp.selector === action.selector);
        return {
          selector: action.selector,
          value: action.value,
          description: action.description,
          skip: false,
          inputType: inputInfo?.type || "text",
        };
      });
      setEditablePlan(editable);
      setSkipSubmit(false);
      setShowPlanPreview(true);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Failed to get form plan");
    } finally {
      setPlanLoading(false);
    }
  };

  // Execute form test with customized plan
  const executeCustomPlan = async () => {
    if (!previewFormPage || !previewPlan) return;

    setShowPlanPreview(false);
    setFormTesting(true);
    setFormTestingUrl(previewFormPage.url);

    try {
      // Build custom plan from editable state
      const customPlan = {
        fillActions: editablePlan
          .filter((action) => !action.skip)
          .map((action) => ({
            selector: action.selector,
            value: action.value,
            description: action.description,
          })),
        submitSelector: previewPlan.aiPlan.submitSelector,
        skipSubmit,
      };

      const resp = await fetch(`${API_BASE}/test-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          formPages: [previewFormPage],
          customPlan,
        }),
      });

      const data = (await resp.json()) as FormTestSuite & { error?: string };
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Test failed (${resp.status})`);
      }

      const merged = new Map(formTestResults);
      [...data.passed, ...data.failed, ...data.inconclusive, ...data.errors].forEach((r) => {
        merged.set(r.url, r);
      });
      setFormTestResults(merged);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err?.message || "Form testing failed");
    } finally {
      setFormTesting(false);
      setFormTestingUrl(null);
      setPreviewPlan(null);
      setPreviewFormPage(null);
    }
  };

  // Update a single field in the editable plan
  const updatePlanField = (index: number, field: keyof EditableFillAction, value: string | boolean) => {
    setEditablePlan((prev) =>
      prev.map((action, i) =>
        i === index ? { ...action, [field]: value } : action
      )
    );
  };

  const totalLinks = useMemo(() => {
    return crawlResult?.results?.reduce((acc, page) => acc + (page.links?.length || 0), 0) || 0;
  }, [crawlResult]);

  const getPerfStatusIcon = (status: string) => {
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

  const getPerfScoreColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getPerfScoreBg = (score: number) => {
    if (score >= 90) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getLinkBadge = (result: LinkResult) => {
    if (result.error) return <Badge variant="destructive">Error</Badge>;
    if (result.status >= 400) return <Badge variant="destructive">{result.status}</Badge>;
    if (result.redirected) return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">{result.status} → Redirect</Badge>;
    return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">{result.status}</Badge>;
  };

  const filteredLinkResults = useMemo(() => {
    if (!linkResults) return [] as LinkResult[];
    switch (linkTab) {
      case "working":
        return linkResults.working;
      case "broken":
        return linkResults.broken;
      case "redirected":
        return linkResults.redirected;
      case "errors":
        return linkResults.errors;
      default:
        return [...linkResults.broken, ...linkResults.errors, ...linkResults.redirected, ...linkResults.working];
    }
  }, [linkResults, linkTab]);

  const getFormStatusBadge = (status?: string) => {
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

  const apiBaseHost = useMemo(() => API_BASE.replace(/\/api$/, ""), []);

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <PlayCircle className="h-8 w-8 text-primary" />
            Crawl & Detect
          </h1>
          <p className="text-muted-foreground">
            Crawl your site once, detect forms, and run performance, responsive, link, and form tests from a single page.
          </p>
        </div>

        {/* Input Section */}
        <Card className="shadow-elegant border-border">
          <CardHeader>
            <CardTitle>Crawl Website</CardTitle>
            <CardDescription>Enter a URL to discover pages and forms</CardDescription>
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
                    Crawl & Detect
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{crawlResult.totalPages}</p>
                  <p className="text-muted-foreground">Total Pages</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{totalLinks}</p>
                  <p className="text-muted-foreground">Total Links</p>
                </div>
                <div className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{selectedUrls.size}</p>
                  <p className="text-muted-foreground">Selected for Testing</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Page Selection */}
        {crawlResult && (
          <Card className="shadow-elegant">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Select Pages to Test</CardTitle>
                  <CardDescription>Choose which crawled pages to include in performance & responsive tests</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllUrls}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={deselectAllUrls}>Deselect All</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-3">
                {crawlResult.results.map((page) => (
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
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedUrls.size}</span> pages selected
              </p>
            </CardContent>
          </Card>
        )}

        {/* Testing Center */}
        {crawlResult ? (
          <Card className="shadow-elegant border-border">
            <CardHeader>
              <CardTitle>Testing Center</CardTitle>
              <CardDescription>Run all tests from one place</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="performance">
                <TabsList className="flex flex-wrap gap-2 w-full">
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="responsive">Responsive</TabsTrigger>
                  <TabsTrigger value="links">Links</TabsTrigger>
                <TabsTrigger value="workflows">Workflows</TabsTrigger>
                  <TabsTrigger value="forms">Form Testing</TabsTrigger>
                </TabsList>

                {/* Performance */}
                <TabsContent value="performance" className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Test Core Web Vitals and resource sizes on selected pages.
                    </div>
                    <Button onClick={runPerformanceTest} disabled={perfLoading || selectedUrls.size === 0} className="gap-2">
                      {perfLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />Testing...</>) : (<><Zap className="h-4 w-4" />Run Performance Test</>)}
                    </Button>
                  </div>

                  {perfLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Measuring performance...</span>
                        <span className="font-medium">{perfProgress}%</span>
                      </div>
                      <Progress value={perfProgress} className="h-2" />
                    </div>
                  )}

                  {perfResults && (
                    <div className="space-y-4">
                      <Card>
                        <CardContent className="pt-6 flex flex-wrap gap-6 items-center justify-between">
                          <div className="flex items-center gap-6">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${getPerfScoreBg(perfResults.summary.averageScore)}`}>
                              <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center">
                                <span className={`text-2xl font-bold ${getPerfScoreColor(perfResults.summary.averageScore)}`}>
                                  {perfResults.summary.averageScore}
                                </span>
                              </div>
                            </div>
                            <div>
                              <h3 className="text-xl font-semibold">Performance Score</h3>
                              <p className="text-muted-foreground">Average across {perfResults.summary.total} pages</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div>
                              <p className="text-2xl font-bold text-green-500">{perfResults.summary.good}</p>
                              <p className="text-sm text-muted-foreground">Good</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-yellow-500">{perfResults.summary.needsImprovement}</p>
                              <p className="text-sm text-muted-foreground">Needs work</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-red-500">{perfResults.summary.poor}</p>
                              <p className="text-sm text-muted-foreground">Poor</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-gray-500">{perfResults.summary.errors}</p>
                              <p className="text-sm text-muted-foreground">Errors</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{formatMs(perfResults.summary.averageMetrics.LCP)}</p><p className="text-sm text-muted-foreground">Avg LCP</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{formatMs(perfResults.summary.averageMetrics.FCP)}</p><p className="text-sm text-muted-foreground">Avg FCP</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{perfResults.summary.averageMetrics.CLS}</p><p className="text-sm text-muted-foreground">Avg CLS</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{formatMs(perfResults.summary.averageMetrics.TTFB)}</p><p className="text-sm text-muted-foreground">Avg TTFB</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{formatBytes(perfResults.summary.averageMetrics.PageSize)}</p><p className="text-sm text-muted-foreground">Avg Size</p></CardContent></Card>
                      </div>

                      <div className="space-y-3">
                        {perfResults.results.map((result) => (
                          <Collapsible key={result.url}>
                            <Card className="shadow-elegant">
                              <CollapsibleTrigger className="w-full">
                                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      {getPerfStatusIcon(result.status)}
                                      <div className="text-left">
                                        <p className="font-medium">{new URL(result.url).pathname || "/"}</p>
                                        <p className="text-sm text-muted-foreground truncate max-w-md">{result.url}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getPerfScoreBg(result.overallScore)}`}>
                                        <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                                          <span className={`text-lg font-bold ${getPerfScoreColor(result.overallScore)}`}>
                                            {result.overallScore}
                                          </span>
                                        </div>
                                      </div>
                                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="pt-0 space-y-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">LCP</div><p className="text-xl font-bold">{formatMs(result.metrics.LCP)}</p></div>
                                    <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">FCP</div><p className="text-xl font-bold">{formatMs(result.metrics.FCP)}</p></div>
                                    <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">CLS</div><p className="text-xl font-bold">{result.metrics.CLS}</p></div>
                                    <div className="border rounded-lg p-3"><div className="text-xs text-muted-foreground">TTFB</div><p className="text-xl font-bold">{formatMs(result.metrics.TTFB)}</p></div>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    <div className="border rounded-lg p-3 text-center"><p className="font-bold">{formatBytes(result.metrics.PageSize)}</p><p className="text-xs text-muted-foreground">Total Size</p></div>
                                    <div className="border rounded-lg p-3 text-center"><p className="font-bold">{result.metrics.RequestCount}</p><p className="text-xs text-muted-foreground">Requests</p></div>
                                    <div className="border rounded-lg p-3 text-center"><p className="font-bold">{formatBytes(result.metrics.ImageSize)}</p><p className="text-xs text-muted-foreground">Images</p></div>
                                    <div className="border rounded-lg p-3 text-center"><p className="font-bold">{formatBytes(result.metrics.JSSize)}</p><p className="text-xs text-muted-foreground">JavaScript</p></div>
                                    <div className="border rounded-lg p-3 text-center"><p className="font-bold">{formatBytes(result.metrics.CSSSize)}</p><p className="text-xs text-muted-foreground">CSS</p></div>
                                  </div>
                                  {result.issues.length > 0 ? (
                                    <div className="space-y-2">
                                      <h4 className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Issues & Suggestions ({result.issues.length})</h4>
                                      {result.issues.map((issue, idx) => (
                                        <div key={idx} className="p-3 rounded-lg border bg-muted/50">
                                          <div className="flex items-center justify-between mb-1">
                                            <Badge variant="outline">{issue.type}</Badge>
                                            <Badge variant={issue.severity === "high" ? "destructive" : "outline"}>{issue.severity}</Badge>
                                          </div>
                                          <p className="text-sm font-medium">{issue.message}</p>
                                          <p className="text-xs text-muted-foreground">💡 {issue.suggestion}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-4 text-green-500">
                                      <CheckCircle className="h-6 w-6 mx-auto mb-1" />
                                      <p className="font-medium">No performance issues detected</p>
                                    </div>
                                  )}
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <Button variant="outline" onClick={() => { setPerfResults(null); setPerfProgress(0); }} className="gap-2">
                          Clear results
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Responsive */}
                <TabsContent value="responsive" className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="text-sm text-muted-foreground">Test pages across Mobile, Tablet, and Desktop viewports.</div>
                    <Button onClick={runResponsiveTest} disabled={respLoading || selectedUrls.size === 0} className="gap-2">
                      {respLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />Testing...</>) : (<><Monitor className="h-4 w-4" />Run Responsive Test</>)}
                    </Button>
                  </div>

                  {respLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Testing viewports...</span>
                        <span className="font-medium">{respProgress}%</span>
                      </div>
                      <Progress value={respProgress} className="h-2" />
                    </div>
                  )}

                  {respResults && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-green-500">{respResults.summary.passed}</p><p className="text-sm text-muted-foreground">Passed</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-yellow-500">{respResults.summary.warnings}</p><p className="text-sm text-muted-foreground">Warnings</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-red-500">{respResults.summary.failed}</p><p className="text-sm text-muted-foreground">Failed</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-gray-500">{respResults.summary.errors}</p><p className="text-sm text-muted-foreground">Errors</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{respResults.summary.total}</p><p className="text-sm text-muted-foreground">Pages Tested</p></CardContent></Card>
                      </div>

                      <div className="space-y-3">
                        {respResults.results.map((page) => (
                          <Collapsible key={page.url}>
                            <Card className="shadow-elegant">
                              <CollapsibleTrigger className="w-full">
                                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      {page.status === "pass" && <CheckCircle className="h-5 w-5 text-green-500" />}
                                      {page.status === "warning" && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                                      {page.status === "fail" && <XCircle className="h-5 w-5 text-red-500" />}
                                      <div>
                                        <p className="font-medium">{new URL(page.url).pathname || "/"}</p>
                                        <p className="text-sm text-muted-foreground truncate max-w-md">{page.url}</p>
                                      </div>
                                    </div>
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="pt-0 space-y-3">
                                  {/* Screenshots */}
                                  <div>
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                      <ImageIcon className="h-4 w-4" />
                                      Screenshots
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      {Object.entries(page.viewports).map(([key, vp]) => {
                                        const screenshotSrc = vp.screenshot
                                          ? `${apiBaseHost}/screenshots/${vp.screenshot.replace(/^\/?screenshots\/?/, "")}`
                                          : null;

                                        return (
                                          <div key={key} className="border rounded-lg overflow-hidden">
                                            <div className="p-2 bg-muted flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                {getViewportIcon(vp.device || key)}
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
                                            {screenshotSrc ? (
                                              <a href={screenshotSrc} target="_blank" rel="noopener noreferrer" className="block">
                                                <img
                                                  src={screenshotSrc}
                                                  alt={`${vp.name} screenshot`}
                                                  className="w-full h-48 object-cover object-top hover:opacity-80 transition-opacity"
                                                  onError={(e) => {
                                                    e.currentTarget.style.display = "none";
                                                  }}
                                                />
                                              </a>
                                            ) : (
                                              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground bg-muted/40">
                                                Screenshot not available
                                              </div>
                                            )}
                                            <div className="p-2 text-xs text-muted-foreground">
                                              {vp.width}x{vp.height}px • {vp.device}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {Object.entries(page.viewports).map(([key, vp]) => (
                                      <div key={key} className="border rounded-lg p-3 space-y-2">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                          {vp.device === "mobile" && <Smartphone className="h-4 w-4" />} 
                                          {vp.device === "tablet" && <Tablet className="h-4 w-4" />} 
                                          {vp.device === "desktop" && <Monitor className="h-4 w-4" />}
                                          {vp.name}
                                        </div>
                                        <Badge variant={vp.status === "pass" ? "outline" : vp.status === "warning" ? "secondary" : "destructive"}>{vp.status}</Badge>
                                        {vp.issues?.length ? (
                                          <div className="space-y-1 text-xs text-muted-foreground">
                                            {vp.issues.map((issue, idx) => (
                                              <div key={idx} className="p-2 rounded bg-muted/50">
                                                <p className="font-medium text-foreground">{issue.type}</p>
                                                <p>{issue.message}</p>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-xs text-green-600">No viewport issues</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {page.issues.length > 0 && (
                                    <div className="space-y-2">
                                      <h4 className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Issues</h4>
                                      {page.issues.map((issue, idx) => (
                                        <div key={idx} className="p-3 rounded-lg border bg-muted/50">
                                          <div className="flex items-center justify-between mb-1">
                                            <Badge variant="outline">{issue.type}</Badge>
                                            <Badge variant={issue.severity === "high" ? "destructive" : "outline"}>{issue.severity}</Badge>
                                          </div>
                                          <p className="text-sm">{issue.message}</p>
                                          <p className="text-xs text-muted-foreground">Viewport: {issue.viewport}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Links */}
                <TabsContent value="links" className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="text-sm text-muted-foreground">Find broken, redirected, and external links.</div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                        <Label htmlFor="test-external" className="text-sm">Test external links</Label>
                        <Switch id="test-external" checked={testExternal} onCheckedChange={setTestExternal} />
                      </div>
                      <Button onClick={runLinkTest} disabled={linkLoading} className="gap-2">
                        {linkLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />Testing...</>) : (<><Link2 className="h-4 w-4" />Run Link Test</>)}
                      </Button>
                    </div>
                  </div>

                  {linkLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Testing links...</span>
                        <span className="font-medium">{linkProgress}%</span>
                      </div>
                      <Progress value={linkProgress} className="h-2" />
                    </div>
                  )}

                  {linkResults && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-green-500">{linkResults.summary.working}</p><p className="text-sm text-muted-foreground">Working</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-red-500">{linkResults.summary.broken}</p><p className="text-sm text-muted-foreground">Broken</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-yellow-500">{linkResults.summary.redirected}</p><p className="text-sm text-muted-foreground">Redirected</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold text-gray-500">{linkResults.summary.errors}</p><p className="text-sm text-muted-foreground">Errors</p></CardContent></Card>
                        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-bold">{linkResults.tested}</p><p className="text-sm text-muted-foreground">Links Tested</p></CardContent></Card>
                      </div>

                      <Tabs value={linkTab} onValueChange={setLinkTab}>
                        <TabsList>
                          <TabsTrigger value="all">All</TabsTrigger>
                          <TabsTrigger value="broken">Broken</TabsTrigger>
                          <TabsTrigger value="redirected">Redirected</TabsTrigger>
                          <TabsTrigger value="errors">Errors</TabsTrigger>
                          <TabsTrigger value="working">Working</TabsTrigger>
                        </TabsList>
                      </Tabs>

                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>URL</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Final URL</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredLinkResults.map((link, idx) => (
                              <TableRow key={link.url + idx}>
                                <TableCell className="whitespace-nowrap">{getLinkBadge(link)}</TableCell>
                                <TableCell className="max-w-md truncate text-sm">{link.url}</TableCell>
                                <TableCell>{link.isExternal ? "External" : "Internal"}</TableCell>
                                <TableCell className="max-w-md truncate text-sm">{link.finalUrl || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Workflows - Intelligent Auto-Detection */}
                <TabsContent value="workflows" className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Automatically detect all available workflows on your website (checkout, login, registration, etc.)
                      </p>
                    </div>
                    <Button 
                      onClick={handleDiscoverWorkflows} 
                      disabled={workflowLoading || !url} 
                      className="gap-2"
                      size="lg"
                    >
                      {workflowLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Detect All Workflows
                        </>
                      )}
                    </Button>
                  </div>

                  {workflowError && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 p-3 rounded-lg">
                      {workflowError}
                    </div>
                  )}

                  {workflowLoading && (
                    <Card className="border-dashed">
                      <CardContent className="py-8">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <div>
                            <p className="font-medium">Scanning website for workflows...</p>
                            <p className="text-sm text-muted-foreground">Crawling pages and detecting available workflows using AI</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Detected Workflows Grid */}
                  {!workflowLoading && detectedWorkflows.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Detected Forms ({detectedWorkflows.length})</h3>
                          <p className="text-xs text-muted-foreground">
                            Found across {pagesScanned} page{pagesScanned !== 1 ? "s" : ""} • Select one to preview and execute
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {detectedWorkflows.map((workflow) => (
                          <Card 
                            key={workflow.id} 
                            className="shadow-elegant transition-all hover:border-primary/50"
                          >
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">{getWorkflowIcon(workflow.type)}</span>
                                  <div>
                                    <CardTitle className="text-lg">{workflow.name}</CardTitle>
                                    {workflow.pageUrl && (
                                      <CardDescription className="text-xs truncate max-w-[180px]" title={workflow.pageUrl}>
                                        {workflow.pageTitle || new URL(workflow.pageUrl).pathname}
                                      </CardDescription>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge variant="secondary" className="text-[11px]">
                                    {workflow.type.toUpperCase()}
                                  </Badge>
                                  {getConfidenceBadge(workflow.confidence, workflow.available)}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {/* Show field names */}
                              {workflow.fields && workflow.fields.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {workflow.fields.slice(0, 4).map((field, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {field}
                                    </Badge>
                                  ))}
                                  {workflow.fields.length > 4 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{workflow.fields.length - 4} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                              
                              {/* Show step count */}
                              {workflow.steps.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {workflow.steps.length} auto-generated steps
                                </p>
                              )}

                              {workflow.steps.length > 0 ? (
                                <div className="flex gap-2 pt-2">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="flex-1 gap-1"
                                    onClick={() => handlePreviewWorkflow(workflow)}
                                  >
                                    <Eye className="h-3 w-3" />
                                    Edit
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    className="flex-1 gap-1"
                                    onClick={() => handleExecuteWorkflow(workflow)}
                                    disabled={workflowRunLoading}
                                  >
                                    {workflowRunLoading && selectedWorkflow?.id === workflow.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Play className="h-3 w-3" />
                                    )}
                                    Execute
                                  </Button>
                                </div>
                              ) : (
                                <div className="pt-2">
                                  <Badge variant="outline" className="w-full justify-center py-2 text-muted-foreground">
                                    No steps generated
                                  </Badge>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Workflow Executing Indicator */}
                  {workflowRunLoading && selectedWorkflow && (
                    <Card className="border-primary/50 shadow-elegant animate-pulse">
                      <CardContent className="py-6">
                        <div className="flex items-center gap-4">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <div>
                            <p className="font-medium">Executing {selectedWorkflow.name} Workflow...</p>
                            <p className="text-sm text-muted-foreground">
                              Running {selectedWorkflow.steps.length} steps on {selectedWorkflow.pageTitle || selectedWorkflow.pageUrl}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Execution Results */}
                  {workflowRunResult && selectedWorkflow && !workflowRunLoading && (
                    <Card className="shadow-elegant">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{getWorkflowIcon(selectedWorkflow.type)}</span>
                            <div>
                              <CardTitle className="flex items-center gap-2">
                                {selectedWorkflow.name} Results
                                {workflowRunResult.status === "passed" ? (
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : workflowRunResult.status === "inconclusive" ? (
                                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-red-500" />
                                )}
                              </CardTitle>
                              <CardDescription>
                                {workflowRunResult.status === "passed" 
                                  ? "Workflow completed successfully" 
                                  : workflowRunResult.status === "inconclusive"
                                  ? "Could not determine outcome"
                                  : "Workflow encountered errors"}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge 
                            variant={workflowRunResult.status === "passed" ? "outline" : workflowRunResult.status === "inconclusive" ? "secondary" : "destructive"}
                            className={
                              workflowRunResult.status === "passed" 
                                ? "bg-green-500/10 text-green-600 border-green-500/30" 
                                : workflowRunResult.status === "inconclusive"
                                ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                : ""
                            }
                          >
                            {workflowRunResult.status.toUpperCase()}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* AI Analysis Result */}
                        {workflowRunResult.reason && (
                          <div className={`p-3 rounded-lg ${
                            workflowRunResult.status === "passed" 
                              ? "bg-green-500/10 border border-green-500/20" 
                              : workflowRunResult.status === "inconclusive"
                              ? "bg-yellow-500/10 border border-yellow-500/20"
                              : "bg-red-500/10 border border-red-500/20"
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">Analysis:</span>
                              {workflowRunResult.confidence !== undefined && (
                                <Badge variant="outline" className="text-xs">
                                  {Math.round((workflowRunResult.confidence || 0) * 100)}% confident
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{workflowRunResult.reason}</p>
                          </div>
                        )}

                        

                        {/* Steps Executed */}
                        {workflowRunResult.steps && workflowRunResult.steps.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Steps Executed:</p>
                            {workflowRunResult.steps.map((step, idx) => (
                              <div 
                                key={`result-${idx}`} 
                                className={`border rounded-lg p-3 flex items-center justify-between ${
                                  step.status === "success" ? "bg-green-500/5 border-green-500/20" : 
                                  step.status === "error" ? "bg-red-500/5 border-red-500/20" : ""
                                }`}
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="shrink-0">Step {idx + 1}</Badge>
                                    <span className="font-medium truncate">{step.description || step.action}</span>
                                  </div>
                                  {step.error && (
                                    <p className="text-xs text-destructive">{step.error}</p>
                                  )}
                                </div>
                                {step.status === "success" ? (
                                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 ml-2" />
                                ) : step.status === "error" ? (
                                  <XCircle className="h-4 w-4 text-red-500 shrink-0 ml-2" />
                                ) : (
                                  <Badge variant="outline" className="shrink-0 ml-2">Pending</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {workflowRunResult.error && (
                          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                            <strong>Error:</strong> {workflowRunResult.error}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!workflowLoading && detectedWorkflows.length === 0 && (
                    <Card className="border-dashed">
                      <CardContent className="py-12">
                        <div className="flex flex-col items-center gap-4 text-center">
                          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                            <Sparkles className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">Intelligent Workflow Detection</h3>
                            <p className="text-muted-foreground max-w-md mt-1">
                              Click "Detect All Workflows" to automatically discover available user flows on your website 
                              (checkout, login, registration, contact forms, and more).
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Forms */}
                <TabsContent value="forms" className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div className="text-sm text-muted-foreground">Use detected form pages for AI-powered form fills.</div>
                    <Button
                      onClick={() => testForms()}
                      disabled={formTesting || !formDetection || formDetection.formPages.length === 0}
                      className="gap-2"
                    >
                      {formTesting && !formTestingUrl ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />Testing all...
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-4 w-4" />Test All Forms
                        </>
                      )}
                    </Button>
                  </div>

                  {formDetection ? (
                    <div className="space-y-3">
                      {formDetection.formPages.length === 0 && (
                        <div className="text-muted-foreground text-sm">No form pages detected yet.</div>
                      )}
                      {formDetection.formPages.map((page) => {
                        const result = formTestResults.get(page.url);
                        return (
                          <Card key={page.url} className="shadow-elegant">
                            <CardContent className="py-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{page.title || new URL(page.url).pathname}</p>
                                  <p className="text-sm text-muted-foreground truncate">{page.url}</p>
                                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                                    <span>Forms: <span className="font-medium text-foreground">{page.forms}</span></span>
                                    <span>Inputs: <span className="font-medium text-foreground">{page.inputs}</span></span>
                                    <span>Buttons: <span className="font-medium text-foreground">{page.buttons}</span></span>
                                  </div>
                                  {result?.dedupCount && result.dedupCount > 1 && (
                                    <div className="mt-2">
                                      <Badge variant="outline" className="text-[11px]">
                                        Found on {result.dedupCount} pages (deduped)
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  {getFormStatusBadge(result?.status)}
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-2"
                                      disabled={formTesting || planLoading}
                                      onClick={() => getFormPlan(page)}
                                    >
                                      {planLoading && previewFormPage?.url === page.url ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />Loading...
                                        </>
                                      ) : (
                                        <>
                                          <Eye className="h-4 w-4" />Preview
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="gap-2"
                                      disabled={formTesting || planLoading}
                                      onClick={() => testForms([page])}
                                    >
                                      {formTesting && formTestingUrl === page.url ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />Testing...
                                        </>
                                      ) : (
                                        <>
                                          <PlayCircle className="h-4 w-4" />Run Test
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              {result?.aiAnalysis && (
                                <div className="mt-3 border-t pt-3 text-sm space-y-1">
                                  <div className="flex items-center gap-2 text-foreground font-medium">
                                    AI Verdict: {result.aiAnalysis.status}
                                  </div>
                                  <p className="text-muted-foreground">{result.aiAnalysis.reason}</p>
                                  
                                </div>
                              )}
                              {result?.error && (
                                <div className="mt-3 text-sm text-destructive bg-destructive/10 p-2 rounded">
                                  {result.error}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Run a crawl to detect forms first.</div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          !intelLoading && (
            <Card className="shadow-elegant border-border border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <PlayCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-semibold text-lg">No crawl yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    Enter a URL above and start a crawl to unlock combined testing.
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Form Plan Preview Dialog */}
      <Dialog open={showPlanPreview} onOpenChange={setShowPlanPreview}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Form Test Plan Preview
            </DialogTitle>
            <DialogDescription>
              {previewPlan?.url && (
                <span className="text-xs break-all">{previewPlan.url}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {previewPlan && (
            <div className="space-y-4">
              {/* Steps */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">
                  Fill Steps ({editablePlan.filter(a => !a.skip).length} of {editablePlan.length} active)
                </h4>
                {editablePlan.map((action, index) => (
                  <div
                    key={action.selector}
                    className={`border rounded-lg p-3 space-y-2 ${action.skip ? "opacity-50 bg-muted/30" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Step {index + 1}
                        </Badge>
                        <span className="font-medium text-sm">{action.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`skip-${index}`} className="text-xs text-muted-foreground">
                          Skip
                        </Label>
                        <Checkbox
                          id={`skip-${index}`}
                          checked={action.skip}
                          onCheckedChange={(checked) => updatePlanField(index, "skip", !!checked)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {action.inputType}
                      </Badge>
                      {action.inputType === "checkbox" || action.inputType === "radio" ? (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={action.value === "true"}
                            disabled={action.skip}
                            onCheckedChange={(checked) => updatePlanField(index, "value", checked ? "true" : "false")}
                          />
                          <Label className="text-sm">Check this field</Label>
                        </div>
                      ) : action.inputType === "textarea" ? (
                        <Textarea
                          value={action.value}
                          disabled={action.skip}
                          onChange={(e) => updatePlanField(index, "value", e.target.value)}
                          className="text-sm"
                          rows={2}
                        />
                      ) : (
                        <Input
                          value={action.value}
                          disabled={action.skip}
                          onChange={(e) => updatePlanField(index, "value", e.target.value)}
                          className="text-sm"
                        />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {action.selector}
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Toggle */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-medium">Click Submit Button</Label>
                    <p className="text-xs text-muted-foreground">
                      {previewPlan.aiPlan.submitDescription || previewPlan.aiPlan.submitSelector}
                    </p>
                  </div>
                  <Switch
                    checked={!skipSubmit}
                    onCheckedChange={(checked) => setSkipSubmit(!checked)}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPlanPreview(false)}>
              Cancel
            </Button>
            <Button onClick={executeCustomPlan} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Execute Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Edit/Preview Dialog */}
      <Dialog open={showWorkflowPreview} onOpenChange={setShowWorkflowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{selectedWorkflow && getWorkflowIcon(selectedWorkflow.type)}</span>
              Edit {selectedWorkflow?.name} Workflow
            </DialogTitle>
            <DialogDescription>
              Review and customize the workflow steps before execution
            </DialogDescription>
          </DialogHeader>

          {selectedWorkflow && (
            <div className="space-y-4">
              {/* Workflow Info */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  {getConfidenceBadge(selectedWorkflow.confidence, selectedWorkflow.available)}
                  <span className="text-sm text-muted-foreground">{selectedWorkflow.reason}</span>
                </div>
                {selectedWorkflow.pageUrl && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Page: </span>
                    <a 
                      href={selectedWorkflow.pageUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      {selectedWorkflow.pageTitle || selectedWorkflow.pageUrl}
                    </a>
                  </div>
                )}
              </div>

              {/* Editable Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    Workflow Steps ({editableSteps.filter(s => !s.skip).length} of {editableSteps.length} active)
                  </h4>
                </div>
                
                {editableSteps.length > 0 ? (
                  <div className="space-y-3">
                    {editableSteps.map((step, idx) => (
                      <div
                        key={`edit-step-${idx}`}
                        className={`border rounded-lg p-4 space-y-3 transition-opacity ${step.skip ? "opacity-50 bg-muted/30" : ""}`}
                      >
                        {/* Step Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              Step {idx + 1}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {step.action}
                            </Badge>
                            <span className="text-sm font-medium">{step.description}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`skip-step-${idx}`} className="text-xs text-muted-foreground">
                              Skip
                            </Label>
                            <Checkbox
                              id={`skip-step-${idx}`}
                              checked={step.skip || false}
                              onCheckedChange={(checked) => updateEditableStep(idx, "skip", !!checked)}
                            />
                          </div>
                        </div>

                        {/* Click/Navigate: Just show target (read-only) */}
                        {(step.action === "click" || step.action === "navigate") && step.selector && (
                          <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                            Target: {step.selector}
                          </div>
                        )}

                        {/* Fill/Select: Show editable value field */}
                        {(step.action === "fill" || step.action === "select") && (
                          <div className="space-y-2">
                            {step.selector && (
                              <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                                Field: {step.selector}
                              </div>
                            )}
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Value to Enter</Label>
                              {step.selector?.includes("message") || step.selector?.includes("textarea") ? (
                                <Textarea
                                  value={step.value || ""}
                                  onChange={(e) => updateEditableStep(idx, "value", e.target.value)}
                                  disabled={step.skip}
                                  className="text-sm"
                                  rows={3}
                                  placeholder="Enter value..."
                                />
                              ) : (
                                <Input
                                  value={step.value || ""}
                                  onChange={(e) => updateEditableStep(idx, "value", e.target.value)}
                                  disabled={step.skip}
                                  className="text-sm"
                                  placeholder="Enter value..."
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {/* Assert: Show text to verify (read-only) */}
                        {step.action === "assert" && step.value && (
                          <div className="text-xs text-muted-foreground">
                            Verify text: <span className="font-medium">"{step.value}"</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No steps generated for this workflow.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowWorkflowPreview(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleExecuteEditedWorkflow}
              className="gap-2"
              disabled={!selectedWorkflow || editableSteps.filter(s => !s.skip).length === 0 || workflowRunLoading}
            >
              {workflowRunLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Execute Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
