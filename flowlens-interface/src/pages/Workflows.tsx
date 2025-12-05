import { useEffect, useMemo, useState } from "react";
import { Search, Maximize2, Play } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type GeneratedWorkflows = {
  total: number;
  workflows: { id: string; goal: string; steps: { page: string; action: string }[] }[];
};

type ExecutionResult = {
  stats: { total: number; passed: number; failed: number };
  results: { id: string; goal: string; success: boolean; failedStep?: string; steps: { page: string; action: string; status: string; error?: string }[] }[];
};

const Workflows = () => {
  const [generated, setGenerated] = useState<GeneratedWorkflows | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [execLoadingId, setExecLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGraphMobile, setShowGraphMobile] = useState(false);

  // Load generated workflows (from Flow Generator)
  useEffect(() => {
    try {
      const rawGen = localStorage.getItem("flowai:lastGeneratedWorkflows");
      if (rawGen) {
        const parsed = JSON.parse(rawGen);
        setGenerated(parsed);
        if (parsed?.workflows?.length) {
          setSelectedWorkflowId(parsed.workflows[0].id || "0");
        }
      }
    } catch {}
  }, []);

  const selectedWorkflow = useMemo(() => {
    if (!generated || !selectedWorkflowId) return null;
    return generated.workflows.find((w) => w.id === selectedWorkflowId) || null;
  }, [generated, selectedWorkflowId]);

  const executionStatus = useMemo(() => {
    if (!execution) return new Map<string, any>();
    const map = new Map<string, any>();
    for (const r of execution.results || []) {
      map.set(r.id, r);
    }
    return map;
  }, [execution]);

  const handleExecute = async (wfId: string) => {
    const wf = generated?.workflows.find((w) => (w.id || "") === wfId);
    if (!wf) return;
    setExecLoadingId(wfId);
    setError(null);
    setExecution((prev) => prev || { stats: { total: 0, passed: 0, failed: 0 }, results: [] });
    try {
      const resp = await fetch("/api/execute-workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflows: [wf] }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Execution failed (${resp.status})`);
      }
      setExecution((prev) => {
        const prevResults = prev?.results || [];
        const filtered = prevResults.filter((r) => r.id !== data.results?.[0]?.id);
        const mergedResults = [...filtered, ...(data.results || [])];
        const stats = {
          total: mergedResults.length,
          passed: mergedResults.filter((r) => r.success).length,
          failed: mergedResults.filter((r) => !r.success).length,
        };
        return { results: mergedResults, stats };
      });
    } catch (e: any) {
      setError(e?.message || "Execution failed");
    } finally {
      setExecLoadingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Workflows</h1>
          </div>

          <div className="flex gap-6 h-[calc(100vh-180px)]">
            {/* Left Panel - Workflow List */}
            <div className="w-full lg:w-96 flex flex-col space-y-4">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search workflows..." className="pl-9" />
                </div>
                {execution && (
                  <div className="text-xs text-muted-foreground">
                    Execution: Passed {execution.stats.passed} / {execution.stats.total} • Failed {execution.stats.failed}
                  </div>
                )}
              </div>

              {/* Workflow List */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {!generated?.workflows?.length && (
                  <div className="text-sm text-muted-foreground">
                    No workflows yet. Run a crawl from Flow Generator to populate this view.
                  </div>
                )}

                {generated?.workflows?.length ? (
                  <div className="space-y-2">
                    {generated.workflows.map((wf, idx) => {
                      const status = executionStatus.get(wf.id);
                      const isRunning = execLoadingId === (wf.id || String(idx));
                      return (
                        <Card
                          key={wf.id || idx}
                          className={`p-4 cursor-pointer transition-all duration-200 ${
                            selectedWorkflowId === (wf.id || String(idx)) ? "border-primary shadow-lg" : "hover:shadow-md hover:-translate-y-1"
                          }`}
                          onClick={() => setSelectedWorkflowId(wf.id || String(idx))}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-foreground truncate max-w-[36ch]">{wf.goal || wf.id}</h3>
                              <p className="text-xs text-muted-foreground">Steps: {wf.steps.length}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {status ? (
                                <Badge variant={status.success ? "default" : "destructive"}>
                                  {status.success ? "pass" : "fail"}
                                </Badge>
                              ) : (
                                <Badge variant="outline">generated</Badge>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={isRunning}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExecute(wf.id || String(idx));
                                }}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {wf.steps.slice(0, 4).map((s, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-foreground">{i + 1}.</span>
                                <span className="truncate max-w-[32ch]">{s.page}</span>
                                <span className="text-foreground">—</span>
                                <span className="font-medium">{s.action}</span>
                              </div>
                            ))}
                            {wf.steps.length > 4 && <div className="text-[10px] text-muted-foreground">+{wf.steps.length - 4} more steps</div>}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Mobile View Graph Button */}
              <Button className="lg:hidden" onClick={() => setShowGraphMobile(true)} disabled={!selectedWorkflowId}>
                View Graph
              </Button>
            </div>

            {/* Right Panel - Vertical Flow */}
            <Card className="hidden lg:flex flex-1 p-6 flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{selectedWorkflow?.goal || selectedWorkflow?.id || "Select a workflow"}</h2>
                <Button size="icon" variant="ghost" onClick={() => setShowGraphMobile(true)} disabled={!selectedWorkflow}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                {!selectedWorkflow && (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Choose a workflow to view steps.
                  </div>
                )}
                {selectedWorkflow && (
                  <div className="relative pl-6">
                    <div className="absolute left-3 top-0 bottom-0 border-l border-border" />
                    <div className="space-y-4">
                      {selectedWorkflow.steps.map((step, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute -left-3 top-2 w-2 h-2 rounded-full bg-primary" />
                          <div className="rounded-lg border p-3 shadow-sm bg-card">
                            <div className="text-xs text-muted-foreground mb-1">Step {idx + 1}</div>
                            <div className="font-medium break-all">{step.page}</div>
                            <div className="text-xs text-muted-foreground">{step.action}</div>
                            {step.note && (
                              <div className="text-xs text-muted-foreground mt-1 break-all">{step.note}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile vertical view */}
      <Dialog open={showGraphMobile} onOpenChange={setShowGraphMobile}>
        <DialogContent className="max-w-full h-[80vh]">
          {selectedWorkflow ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedWorkflow.goal || selectedWorkflow.id}</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[60vh]">
                <div className="relative pl-6">
                  <div className="absolute left-3 top-0 bottom-0 border-l border-border" />
                  <div className="space-y-3">
                    {selectedWorkflow.steps.map((step, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-3 top-2 w-2 h-2 rounded-full bg-primary" />
                        <div className="rounded-lg border p-3 shadow-sm bg-card">
                          <div className="text-xs text-muted-foreground mb-1">Step {idx + 1}</div>
                          <div className="font-medium break-all">{step.page}</div>
                          <div className="text-xs text-muted-foreground">{step.action}</div>
                          {step.note && (
                            <div className="text-xs text-muted-foreground mt-1 break-all">{step.note}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No workflow to display.</div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Workflows;
