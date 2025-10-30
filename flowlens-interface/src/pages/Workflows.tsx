import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Play, Edit2, Trash2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Workflow {
  id: string;
  name: string;
  createdAt: string;
  creator: string;
  type: "auto" | "manual";
  version: string;
  status: "active" | "draft" | "archived";
  steps: { id: string; name: string; x: number; y: number }[];
  connections: { from: string; to: string }[];
}

const mockWorkflows: Workflow[] = [
  {
    id: "1",
    name: "Login Flow Test",
    createdAt: "2024-03-15",
    creator: "John Doe",
    type: "auto",
    version: "1.2.0",
    status: "active",
    steps: [
      { id: "1", name: "Navigate", x: 50, y: 50 },
      { id: "2", name: "Fill Form", x: 200, y: 50 },
      { id: "3", name: "Submit", x: 350, y: 50 },
      { id: "4", name: "Verify", x: 500, y: 50 },
    ],
    connections: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
    ],
  },
  {
    id: "2",
    name: "Checkout Process",
    createdAt: "2024-03-14",
    creator: "Jane Smith",
    type: "manual",
    version: "2.0.1",
    status: "active",
    steps: [
      { id: "1", name: "Add to Cart", x: 50, y: 100 },
      { id: "2", name: "Enter Details", x: 200, y: 100 },
      { id: "3", name: "Payment", x: 350, y: 100 },
      { id: "4", name: "Confirm", x: 500, y: 100 },
    ],
    connections: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
    ],
  },
];

type BackendGraph = {
  totalWorkflows: number;
  nodes: { id: string; title: string; type: string; buttons: number; forms: number; inputs: number; mode: string }[];
  edges: { from: string; to: string; action: string; via?: string; weight?: number; intent?: string; reason?: string }[];
};

const Workflows = () => {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow>(mockWorkflows[0]);
  const [hoveredWorkflow, setHoveredWorkflow] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGraphMobile, setShowGraphMobile] = useState(false);
  const [graph, setGraph] = useState<BackendGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiWf, setAiWf] = useState<{ workflows: { goal: string; steps: { page: string; action: string }[] }[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load last crawl and request workflows graph from backend
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = localStorage.getItem("flowai:lastCrawl");
        if (!raw) {
          setLoading(false);
          return;
        }
        const crawlData = JSON.parse(raw);
        const endpoint = "/api/adaptive-workflows";
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crawlData }),
        });
        const data: BackendGraph | { error: string } = await resp.json();
        if (!resp.ok || (data as any)?.error) {
          setError((data as any)?.error || `Request failed with status ${resp.status}`);
        } else {
          setGraph(data as BackendGraph);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load workflows");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const handleRegenerateAI = async () => {
    try {
      setAiLoading(true);
      setError(null);
      const raw = localStorage.getItem("flowai:lastCrawl");
      if (!raw) return;
      const crawlData = JSON.parse(raw);
      const resp = await fetch("/api/ai-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(crawlData),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error) {
        setError(data?.error || `AI workflows failed with status ${resp.status}`);
      } else {
        setAiWf(data);
      }
    } catch (e: any) {
      setError(e?.message || "AI workflows failed");
    } finally {
      setAiLoading(false);
    }
  };

  // Build a simple layout for nodes into steps/connections the existing canvas can render
  const autoWorkflow: Workflow | null = useMemo(() => {
    if (!graph) return null;
    const steps = graph.nodes.slice(0, 24).map((n, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      return { id: n.id, name: n.title || n.id, x: 80 + col * 200, y: 40 + row * 120 };
    });
    const stepIds = new Set(steps.map((s) => s.id));
    const connections = graph.edges
      .filter((e) => stepIds.has(e.from) && stepIds.has(e.to))
      .slice(0, 40)
      .map((e) => ({ from: e.from, to: e.to }));
    return {
      id: "auto",
      name: "Auto-generated Site Graph",
      createdAt: new Date().toISOString().slice(0, 10),
      creator: "FlowAI",
      type: "auto",
      version: "0.1.0",
      status: "active",
      steps,
      connections,
    };
  }, [graph]);

  const statusColors = {
    active: "bg-success text-success-foreground",
    draft: "bg-warning text-warning-foreground",
    archived: "bg-muted text-muted-foreground",
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Workflows</h1>
            <div className="flex gap-2">
            <Button onClick={() => {
              // prefer auto graph if available
              if (autoWorkflow) setSelectedWorkflow(autoWorkflow);
            }}>
              {autoWorkflow ? "Load Auto Graph" : "Create Workflow"}
            </Button>
            <Button variant="outline" onClick={handleRegenerateAI} disabled={aiLoading}>
              {aiLoading ? "Regenerating with AI..." : "Regenerate with AI"}
            </Button>
            </div>
          </div>

          <div className="flex gap-6 h-[calc(100vh-180px)]">
            {/* Left Panel - Workflow List */}
            <div className="w-full lg:w-96 flex flex-col space-y-4">
              {/* Search and Filters */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search workflows..." className="pl-9" />
                </div>
                <div className="flex gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      <SelectItem value="project1">Project 1</SelectItem>
                      <SelectItem value="project2">Project 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="all">
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Workflow List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {loading && <div className="text-sm text-muted-foreground">Generating workflows from crawl...</div>}
                {error && <div className="text-sm text-destructive">{error}</div>}
                {autoWorkflow && (
                  <Card
                    className={`p-4 cursor-pointer transition-all duration-200 animate-fade-in-up ${
                      selectedWorkflow.id === autoWorkflow.id ? "border-primary shadow-lg" : "hover:shadow-md hover:-translate-y-1"
                    }`}
                    onClick={() => setSelectedWorkflow(autoWorkflow)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-foreground">Auto-generated Site Graph</h3>
                      <Badge className="bg-success text-success-foreground">auto</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Nodes: {graph?.nodes.length ?? 0} • Edges: {graph?.edges.length ?? 0}
                    </div>
                  </Card>
                )}
                {mockWorkflows.map((workflow, index) => (
                  <Card
                    key={workflow.id}
                    className={`p-4 cursor-pointer transition-all duration-200 animate-fade-in-up ${
                      selectedWorkflow.id === workflow.id
                        ? "border-primary shadow-lg"
                        : "hover:shadow-md hover:-translate-y-1"
                    }`}
                    style={{ animationDelay: `${index * 100}ms` }}
                    onClick={() => setSelectedWorkflow(workflow)}
                    onMouseEnter={() => setHoveredWorkflow(workflow.id)}
                    onMouseLeave={() => setHoveredWorkflow(null)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-foreground">{workflow.name}</h3>
                      <Badge className={statusColors[workflow.status]}>{workflow.status}</Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Created: {workflow.createdAt}</p>
                      <p>By: {workflow.creator}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{workflow.type}</Badge>
                        <span>v{workflow.version}</span>
                      </div>
                    </div>
                    {hoveredWorkflow === workflow.id && (
                      <div className="flex gap-2 mt-3 animate-fade-in">
                        <Button size="sm" variant="ghost" className="h-8">
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {/* Mobile View Graph Button */}
              <Button className="lg:hidden" onClick={() => setShowGraphMobile(true)}>
                View Graph
              </Button>
            </div>

            {/* Right Panel - Graph View (Desktop) */}
            <Card className="hidden lg:flex flex-1 p-6 flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{selectedWorkflow.name}</h2>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setZoom(1)}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Graph Canvas */}
              <div className="flex-1 relative overflow-hidden rounded-lg border bg-surface/50">
                <svg
                  className="absolute inset-0 w-full h-full transition-transform duration-300"
                  style={{ transform: `scale(${zoom})` }}
                >
                  {/* Draw connections */}
                  {selectedWorkflow.connections.map((conn, index) => {
                    const fromStep = selectedWorkflow.steps.find((s) => s.id === conn.from);
                    const toStep = selectedWorkflow.steps.find((s) => s.id === conn.to);
                    if (!fromStep || !toStep) return null;
                    const edge = graph?.edges.find((e) => e.from === conn.from && e.to === conn.to);
                    const color = edge?.intent === "auth_login" || edge?.intent === "auth_signup" ? "#16a34a" :
                                  edge?.intent === "purchase_action" ? "#ef4444" :
                                  edge?.intent === "search_input" ? "#06b6d4" :
                                  edge?.intent === "contact_action" ? "#a855f7" : "#64748b";
                    return (
                      <line
                        key={index}
                        x1={fromStep.x + 60}
                        y1={fromStep.y + 25}
                        x2={toStep.x}
                        y2={toStep.y + 25}
                        className="animate-fade-in"
                        stroke={color}
                        strokeWidth="2"
                        style={{ animationDelay: `${index * 200}ms` }}
                      />
                    );
                  })}
                </svg>

                {/* Draw nodes */}
                {selectedWorkflow.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`absolute rounded-lg px-6 py-3 font-medium shadow-lg transition-all duration-200 animate-fade-in ${
                      hoveredNode === step.id
                        ? "bg-primary text-primary-foreground scale-105 shadow-xl"
                        : "bg-card text-card-foreground"
                    }`}
                    style={{
                      left: `${step.x}px`,
                      top: `${step.y}px`,
                      animationDelay: `${index * 150}ms`,
                    }}
                    onMouseEnter={() => setHoveredNode(step.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {step.name}
                  </div>
                ))}

                {/* Minimap */}
                <div className="absolute bottom-4 right-4 w-32 h-24 bg-background/80 backdrop-blur-sm border rounded-lg p-2">
                  <div className="w-full h-full relative">
                    {selectedWorkflow.steps.map((step) => (
                      <div
                        key={step.id}
                        className="absolute w-2 h-2 bg-primary rounded-full"
                        style={{
                          left: `${(step.x / 600) * 100}%`,
                          top: `${(step.y / 200) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {aiWf && (
        <div className="px-6 pb-6">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-2">AI Workflows</h3>
            <div className="space-y-3 text-sm">
              {aiWf.workflows.slice(0, 6).map((wf, idx) => (
                <div key={idx} className="border border-border rounded p-3">
                  <div className="font-medium mb-1">Goal: {wf.goal}</div>
                  <ol className="list-decimal ml-5 space-y-1">
                    {wf.steps.slice(0, 8).map((s, i) => (
                      <li key={i}>
                        <span className="text-muted-foreground">{s.page}</span> — <span className="font-medium">{s.action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Mobile Graph Modal */}
      <Dialog open={showGraphMobile} onOpenChange={setShowGraphMobile}>
        <DialogContent className="max-w-full h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedWorkflow.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 relative overflow-hidden rounded-lg border bg-surface/50">
            <svg className="absolute inset-0 w-full h-full">
              {selectedWorkflow.connections.map((conn, index) => {
                const fromStep = selectedWorkflow.steps.find((s) => s.id === conn.from);
                const toStep = selectedWorkflow.steps.find((s) => s.id === conn.to);
                if (!fromStep || !toStep) return null;
                return (
                  <line
                    key={index}
                    x1={fromStep.x + 60}
                    y1={fromStep.y + 25}
                    x2={toStep.x}
                    y2={toStep.y + 25}
                    className="stroke-primary/40"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>
            {selectedWorkflow.steps.map((step) => (
              <div
                key={step.id}
                className="absolute bg-card text-card-foreground rounded-lg px-6 py-3 font-medium shadow-lg"
                style={{
                  left: `${step.x}px`,
                  top: `${step.y}px`,
                }}
              >
                {step.name}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Workflows;
