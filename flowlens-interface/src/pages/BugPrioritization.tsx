import { useState } from "react";
import { Search, Filter, ArrowUpDown } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Bug {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  frequency: number;
  impact: number;
  status: "open" | "in-progress" | "resolved";
  assignedTo: string;
}

const mockBugs: Bug[] = [
  {
    id: "BUG-001",
    title: "Login form validation fails on special characters",
    severity: "critical",
    frequency: 45,
    impact: 95,
    status: "open",
    assignedTo: "John Doe",
  },
  {
    id: "BUG-002",
    title: "Dashboard charts not loading on Safari",
    severity: "high",
    frequency: 32,
    impact: 78,
    status: "in-progress",
    assignedTo: "Jane Smith",
  },
  {
    id: "BUG-003",
    title: "Export button disabled after timeout",
    severity: "medium",
    frequency: 18,
    impact: 45,
    status: "open",
    assignedTo: "Mike Johnson",
  },
  {
    id: "BUG-004",
    title: "Tooltip positioning incorrect on mobile",
    severity: "low",
    frequency: 12,
    impact: 22,
    status: "resolved",
    assignedTo: "Sarah Lee",
  },
  {
    id: "BUG-005",
    title: "Search results pagination broken",
    severity: "high",
    frequency: 28,
    impact: 82,
    status: "open",
    assignedTo: "John Doe",
  },
];

const BugPrioritization = () => {
  const [bugs] = useState(mockBugs);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [hoveredBug, setHoveredBug] = useState<string | null>(null);

  const severityConfig = {
    critical: { color: "bg-destructive text-destructive-foreground", chartColor: "#EF4444" },
    high: { color: "bg-warning text-warning-foreground", chartColor: "#F59E0B" },
    medium: { color: "bg-info text-info-foreground", chartColor: "#F59E0B" },
    low: { color: "bg-success text-success-foreground", chartColor: "#22C55E" },
  };

  const statusConfig = {
    open: "bg-destructive/10 text-destructive",
    "in-progress": "bg-warning/10 text-warning",
    resolved: "bg-success/10 text-success",
  };

  const totalBugs = bugs.length;
  const criticalBugs = bugs.filter((b) => b.severity === "critical").length;
  const highBugs = bugs.filter((b) => b.severity === "high").length;
  const avgFixTime = "2.3 days";

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Bug Prioritization</h1>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6 animate-fade-in">
              <p className="text-sm text-muted-foreground mb-1">Total Bugs</p>
              <p className="text-3xl font-bold">{totalBugs}</p>
            </Card>
            <Card className="p-6 animate-fade-in" style={{ animationDelay: "100ms" }}>
              <p className="text-sm text-muted-foreground mb-1">Critical</p>
              <p className="text-3xl font-bold text-destructive">{criticalBugs}</p>
            </Card>
            <Card className="p-6 animate-fade-in" style={{ animationDelay: "200ms" }}>
              <p className="text-sm text-muted-foreground mb-1">High Priority</p>
              <p className="text-3xl font-bold text-warning">{highBugs}</p>
            </Card>
            <Card className="p-6 animate-fade-in" style={{ animationDelay: "300ms" }}>
              <p className="text-sm text-muted-foreground mb-1">Avg Fix Time</p>
              <p className="text-3xl font-bold">{avgFixTime}</p>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search bugs..." className="pl-9" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bug Table */}
            <Card className="lg:col-span-2 p-6">
              <h2 className="text-xl font-semibold mb-4">Bug List</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          ID
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                      </TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          Severity
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          Frequency
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                          Impact
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bugs.map((bug, index) => (
                      <TableRow
                        key={bug.id}
                        className="animate-fade-in cursor-pointer"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onMouseEnter={() => setHoveredBug(bug.id)}
                        onMouseLeave={() => setHoveredBug(null)}
                      >
                        <TableCell className="font-mono text-sm">{bug.id}</TableCell>
                        <TableCell className="font-medium max-w-xs truncate">
                          {bug.title}
                        </TableCell>
                        <TableCell>
                          <Badge className={severityConfig[bug.severity].color}>
                            {bug.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>{bug.frequency}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-success via-warning to-destructive"
                                style={{ width: `${bug.impact}%` }}
                              />
                            </div>
                            <span className="text-sm">{bug.impact}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusConfig[bug.status]}>
                            {bug.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{bug.assignedTo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Impact Bubble Chart */}
            <Card className="p-6 hidden lg:block">
              <h2 className="text-xl font-semibold mb-4">Impact Visualization</h2>
              <div className="relative h-96 bg-surface/50 rounded-lg border">
                {bugs.map((bug, index) => {
                  const size = Math.max(30, bug.impact * 0.8);
                  const x = (bug.frequency / 50) * 80 + 10;
                  const y = 90 - (bug.impact / 100) * 80;
                  return (
                    <div
                      key={bug.id}
                      className="absolute rounded-full transition-all duration-300 cursor-pointer group animate-pulse-subtle"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        left: `${x}%`,
                        top: `${y}%`,
                        backgroundColor: severityConfig[bug.severity].chartColor,
                        opacity: hoveredBug === bug.id ? 1 : 0.7,
                        transform:
                          hoveredBug === bug.id
                            ? "scale(1.1) translateY(-2px)"
                            : `translateY(${Math.sin(index) * 2}px)`,
                        animationDelay: `${index * 200}ms`,
                      }}
                      onMouseEnter={() => setHoveredBug(bug.id)}
                      onMouseLeave={() => setHoveredBug(null)}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                        {bug.id}: {bug.title.substring(0, 30)}...
                      </div>
                    </div>
                  );
                })}
                {/* Axis Labels */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                  Frequency →
                </div>
                <div className="absolute top-1/2 left-2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground">
                  Impact →
                </div>
              </div>
            </Card>
          </div>

          {/* Mobile Bubble Chart */}
          <Card className="p-6 lg:hidden">
            <h2 className="text-xl font-semibold mb-4">Impact Visualization</h2>
            <div className="flex gap-2 overflow-x-auto pb-4">
              {bugs.map((bug) => (
                <div
                  key={bug.id}
                  className="flex-shrink-0 rounded-full flex items-center justify-center text-white font-bold text-xs"
                  style={{
                    width: `${Math.max(50, bug.impact * 0.6)}px`,
                    height: `${Math.max(50, bug.impact * 0.6)}px`,
                    backgroundColor: severityConfig[bug.severity].chartColor,
                  }}
                >
                  {bug.id}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BugPrioritization;
