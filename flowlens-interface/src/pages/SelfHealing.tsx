import { useState } from "react";
import { CheckCircle2, XCircle, TestTube2, AlertCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface HealingEvent {
  id: string;
  workflowId: string;
  stepName: string;
  issueType: string;
  timestamp: string;
  status: "suggested" | "accepted" | "rejected" | "applied";
  oldSelector: string;
  newSelector: string;
  confidence: number;
  beforeScreenshot?: string;
  afterScreenshot?: string;
}

const mockEvents: HealingEvent[] = [
  {
    id: "1",
    workflowId: "WF-001",
    stepName: "Click Login Button",
    issueType: "Selector Changed",
    timestamp: "2024-03-15 14:32",
    status: "suggested",
    oldSelector: "#login-btn",
    newSelector: "[data-testid='login-button']",
    confidence: 0.95,
  },
  {
    id: "2",
    workflowId: "WF-002",
    stepName: "Fill Email Field",
    issueType: "Element Not Found",
    timestamp: "2024-03-15 13:15",
    status: "accepted",
    oldSelector: "input[name='email']",
    newSelector: "input[type='email'][aria-label='Email']",
    confidence: 0.88,
  },
  {
    id: "3",
    workflowId: "WF-001",
    stepName: "Verify Dashboard",
    issueType: "Timeout",
    timestamp: "2024-03-15 12:45",
    status: "applied",
    oldSelector: ".dashboard-container",
    newSelector: "[role='main'].dashboard",
    confidence: 0.92,
  },
];

const SelfHealing = () => {
  const [selectedEvent, setSelectedEvent] = useState<HealingEvent>(mockEvents[0]);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [events, setEvents] = useState(mockEvents);

  const statusConfig = {
    suggested: { color: "bg-info text-info-foreground", icon: AlertCircle },
    accepted: { color: "bg-success text-success-foreground", icon: CheckCircle2 },
    rejected: { color: "bg-destructive text-destructive-foreground", icon: XCircle },
    applied: { color: "bg-primary text-primary-foreground", icon: CheckCircle2 },
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-success";
    if (confidence >= 0.7) return "text-warning";
    return "text-destructive";
  };

  const handleAccept = (eventId: string) => {
    setEvents(events.map((e) => (e.id === eventId ? { ...e, status: "accepted" as const } : e)));
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1000);
  };

  const handleReject = (eventId: string) => {
    setEvents(events.map((e) => (e.id === eventId ? { ...e, status: "rejected" as const } : e)));
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Self-Healing</h1>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-success rounded-full" />
                <span>
                  {events.filter((e) => e.status === "accepted" || e.status === "applied").length}{" "}
                  Accepted
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-info rounded-full" />
                <span>{events.filter((e) => e.status === "suggested").length} Pending</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-180px)]">
            {/* Left Panel - Events List */}
            <div className="w-full lg:w-96 space-y-3 overflow-y-auto">
              {events.map((event, index) => {
                const StatusIcon = statusConfig[event.status].icon;
                return (
                  <Card
                    key={event.id}
                    className={`p-4 cursor-pointer transition-all duration-200 animate-fade-in-up hover:shadow-md hover:-translate-y-1 ${
                      selectedEvent.id === event.id ? "border-primary shadow-lg" : ""
                    }`}
                    style={{ animationDelay: `${index * 100}ms` }}
                    onClick={() => {
                      setSelectedEvent(event);
                      if (window.innerWidth < 1024) setShowMobileDetail(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIcon className="h-4 w-4" />
                          <span className="font-semibold text-sm">{event.workflowId}</span>
                        </div>
                        <p className="font-medium">{event.stepName}</p>
                      </div>
                      <Badge className={statusConfig[event.status].color}>{event.status}</Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Issue: {event.issueType}</p>
                      <p>{event.timestamp}</p>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Right Panel - Detail View */}
            <Card className="hidden lg:flex flex-1 p-6 flex-col overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">Healing Details</h2>

              <div className="space-y-6">
                {/* Overview */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Overview</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Workflow ID</p>
                      <p className="font-medium">{selectedEvent.workflowId}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Step</p>
                      <p className="font-medium">{selectedEvent.stepName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Issue Type</p>
                      <p className="font-medium">{selectedEvent.issueType}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Timestamp</p>
                      <p className="font-medium">{selectedEvent.timestamp}</p>
                    </div>
                  </div>
                </div>

                {/* Screenshots */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Visual Comparison
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Before</p>
                      <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center text-muted-foreground">
                        Screenshot Preview
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">After</p>
                      <div className="aspect-video rounded-lg border bg-muted flex items-center justify-center text-muted-foreground">
                        Screenshot Preview
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selectors */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Selector Changes
                  </h3>
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4 bg-destructive/5">
                      <p className="text-sm font-medium mb-1 flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-destructive" />
                        Old Selector
                      </p>
                      <code className="text-sm font-mono">{selectedEvent.oldSelector}</code>
                    </div>
                    <div className="rounded-lg border p-4 bg-success/5">
                      <p className="text-sm font-medium mb-1 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Suggested Selector
                      </p>
                      <code className="text-sm font-mono">{selectedEvent.newSelector}</code>
                    </div>
                  </div>
                </div>

                {/* Confidence Score */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Confidence Score
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-destructive via-warning to-success transition-all duration-500"
                        style={{ width: `${selectedEvent.confidence * 100}%` }}
                      />
                    </div>
                    <span
                      className={`text-xl font-bold ${getConfidenceColor(selectedEvent.confidence)}`}
                    >
                      {Math.round(selectedEvent.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {selectedEvent.status === "suggested" && (
                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      variant="default"
                      onClick={() => handleAccept(selectedEvent.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Accept
                    </Button>
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => handleReject(selectedEvent.id)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button variant="outline">
                      <TestTube2 className="h-4 w-4 mr-2" />
                      Test Fix
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Confetti Animation */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-primary rounded-full animate-pulse"
                style={{
                  left: `${50 + Math.random() * 10 - 5}%`,
                  top: `${50 + Math.random() * 10 - 5}%`,
                  animation: `fade-in 1s ease-out ${i * 0.05}s forwards`,
                  opacity: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile Detail Modal */}
      <Dialog open={showMobileDetail} onOpenChange={setShowMobileDetail}>
        <DialogContent className="max-w-full h-[80vh] overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Overview</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Workflow ID</p>
                  <p className="font-medium">{selectedEvent.workflowId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Step</p>
                  <p className="font-medium">{selectedEvent.stepName}</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Selectors</h3>
              <div className="space-y-3">
                <div className="rounded-lg border p-3 bg-destructive/5">
                  <p className="text-sm font-medium mb-1">Old</p>
                  <code className="text-xs font-mono">{selectedEvent.oldSelector}</code>
                </div>
                <div className="rounded-lg border p-3 bg-success/5">
                  <p className="text-sm font-medium mb-1">New</p>
                  <code className="text-xs font-mono">{selectedEvent.newSelector}</code>
                </div>
              </div>
            </div>
            {selectedEvent.status === "suggested" && (
              <div className="flex flex-col gap-2">
                <Button onClick={() => handleAccept(selectedEvent.id)}>Accept</Button>
                <Button variant="outline" onClick={() => handleReject(selectedEvent.id)}>
                  Reject
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default SelfHealing;
