import { Plus, TrendingUp, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const projects = [
    {
      id: 1,
      name: "E-commerce Checkout",
      status: "active",
      tests: 24,
      success: 96,
      lastRun: "2 hours ago",
    },
    {
      id: 2,
      name: "User Authentication",
      status: "active",
      tests: 18,
      success: 100,
      lastRun: "1 hour ago",
    },
    {
      id: 3,
      name: "Payment Gateway",
      status: "warning",
      tests: 32,
      success: 87,
      lastRun: "30 minutes ago",
    },
    {
      id: 4,
      name: "Admin Dashboard",
      status: "active",
      tests: 15,
      success: 93,
      lastRun: "3 hours ago",
    },
  ];

  const stats = [
    {
      label: "Total Workflows",
      value: "89",
      change: "+12%",
      trend: "up",
      icon: TrendingUp,
    },
    {
      label: "Tests Passed",
      value: "94%",
      change: "+2.1%",
      trend: "up",
      icon: CheckCircle2,
    },
    {
      label: "Active Issues",
      value: "7",
      change: "-5",
      trend: "down",
      icon: AlertCircle,
    },
    {
      label: "Avg. Runtime",
      value: "3.2m",
      change: "-0.4m",
      trend: "down",
      icon: Clock,
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back! Here's what's happening with your workflows.
            </p>
          </div>
          <Button className="bg-gradient-brand hover:opacity-90 gap-2 animate-pulse-subtle">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <Card 
              key={stat.label}
              className="hover-lift shadow-elegant border-border transition-smooth"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription className="text-sm font-medium">
                  {stat.label}
                </CardDescription>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-1">{stat.value}</div>
                <div className="flex items-center gap-1 text-sm">
                  <span
                    className={
                      stat.trend === "up"
                        ? "text-success"
                        : "text-accent"
                    }
                  >
                    {stat.change}
                  </span>
                  <span className="text-muted-foreground">from last month</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Projects Grid */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Recent Projects</h2>
            <Button variant="outline" className="border-border">
              View All
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project, index) => (
              <Card 
                key={project.id}
                className="hover-lift shadow-elegant border-border cursor-pointer group transition-smooth"
                style={{ animationDelay: `${(index + 4) * 100}ms` }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="group-hover:text-primary transition-fast">
                        {project.name}
                      </CardTitle>
                      <CardDescription>{project.tests} tests</CardDescription>
                    </div>
                    <Badge
                      variant={
                        project.status === "active"
                          ? "default"
                          : "secondary"
                      }
                      className={
                        project.status === "active"
                          ? "bg-success text-success-foreground"
                          : "bg-warning text-warning-foreground"
                      }
                    >
                      {project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Success Rate</span>
                        <span className="font-medium">{project.success}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-brand transition-all duration-500"
                          style={{ width: `${project.success}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last run</span>
                      <span className="font-medium">{project.lastRun}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <Card className="border-border shadow-elegant">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks to get you started quickly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button variant="outline" className="h-auto flex-col items-start p-4 border-border hover:border-primary transition-smooth">
                <span className="font-semibold mb-1">Generate Workflow</span>
                <span className="text-sm text-muted-foreground">
                  Crawl a URL to auto-create tests
                </span>
              </Button>
              <Button variant="outline" className="h-auto flex-col items-start p-4 border-border hover:border-accent transition-smooth">
                <span className="font-semibold mb-1">Run All Tests</span>
                <span className="text-sm text-muted-foreground">
                  Execute all active workflows
                </span>
              </Button>
              <Button variant="outline" className="h-auto flex-col items-start p-4 border-border hover:border-info transition-smooth">
                <span className="font-semibold mb-1">View Reports</span>
                <span className="text-sm text-muted-foreground">
                  Analyze performance metrics
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
