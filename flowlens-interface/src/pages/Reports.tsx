import { useState } from "react";
import { Plus, Settings, Eye, Download, Calendar, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Widget {
  id: string;
  type: "line-chart" | "bar-chart" | "pie-chart" | "kpi-card" | "data-table";
  title: string;
  col: number;
  row: number;
  width: number;
  height: number;
}

const Reports = () => {
  const [widgets, setWidgets] = useState<Widget[]>([
    { id: "1", type: "kpi-card", title: "Total Tests", col: 0, row: 0, width: 1, height: 1 },
    { id: "2", type: "kpi-card", title: "Pass Rate", col: 1, row: 0, width: 1, height: 1 },
    { id: "3", type: "line-chart", title: "Test Trends", col: 0, row: 1, width: 2, height: 2 },
    { id: "4", type: "bar-chart", title: "Top Failures", col: 2, row: 0, width: 1, height: 2 },
  ]);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showShimmer, setShowShimmer] = useState(false);

  const widgetTypes = [
    { value: "line-chart", label: "Line Chart" },
    { value: "bar-chart", label: "Bar Chart" },
    { value: "pie-chart", label: "Pie Chart" },
    { value: "kpi-card", label: "KPI Card" },
    { value: "data-table", label: "Data Table" },
  ];

  const handleAddWidget = (type: string) => {
    const newWidget: Widget = {
      id: Date.now().toString(),
      type: type as Widget["type"],
      title: `New ${type.replace("-", " ")}`,
      col: 0,
      row: Math.max(...widgets.map((w) => w.row + w.height), 0),
      width: 1,
      height: 1,
    };
    setWidgets([...widgets, newWidget]);
    setShowAddWidget(false);
  };

  const handleRemoveWidget = (id: string) => {
    setWidgets(widgets.filter((w) => w.id !== id));
  };

  const handleExport = () => {
    setExportProgress(0);
    const interval = setInterval(() => {
      setExportProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setShowShimmer(true);
          setTimeout(() => {
            setShowShimmer(false);
            setShowExportModal(false);
          }, 1000);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const renderWidgetContent = (widget: Widget) => {
    switch (widget.type) {
      case "kpi-card":
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-4xl font-bold">1,247</p>
            <p className="text-sm text-muted-foreground mt-2">+12% from last week</p>
          </div>
        );
      case "line-chart":
        return (
          <div className="h-full flex items-end justify-around gap-2 p-4">
            {[40, 65, 55, 80, 70, 90, 85].map((height, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/20 rounded-t transition-all duration-300"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        );
      case "bar-chart":
        return (
          <div className="h-full flex flex-col justify-around gap-2 p-4">
            {[70, 85, 60, 90, 75].map((width, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">Item {i + 1}</span>
                <div
                  className="h-6 bg-accent rounded transition-all duration-300"
                  style={{ width: `${width}%` }}
                />
              </div>
            ))}
          </div>
        );
      case "pie-chart":
        return (
          <div className="h-full flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary via-accent to-success" />
          </div>
        );
      case "data-table":
        return (
          <div className="p-4 space-y-2 text-sm">
            {["Row 1", "Row 2", "Row 3"].map((row, i) => (
              <div key={i} className="flex justify-between py-2 border-b">
                <span>{row}</span>
                <span className="text-muted-foreground">Value {i + 1}</span>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Reports & Dashboards</h1>
            <div className="flex gap-2">
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button variant="outline" onClick={() => setShowExportModal(true)}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={() => setShowAddWidget(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Widget
              </Button>
            </div>
          </div>

          {/* Widget Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
            {widgets.map((widget, index) => (
              <Card
                key={widget.id}
                className={`p-6 relative group animate-scale-in ${
                  widget.type === "line-chart" ? "md:col-span-2" : ""
                } ${widget.type === "bar-chart" ? "lg:row-span-2" : ""}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{widget.title}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemoveWidget(widget.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {renderWidgetContent(widget)}
              </Card>
            ))}
          </div>

          {/* Mobile Add Widget Button */}
          <Button
            className="fixed bottom-6 right-6 rounded-full h-14 w-14 shadow-lg md:hidden"
            onClick={() => setShowAddWidget(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Add Widget Modal */}
      <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Widget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Widget Type</label>
              <Select onValueChange={handleAddWidget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select widget type" />
                </SelectTrigger>
                <SelectContent>
                  {widgetTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">File Format</label>
              <Select defaultValue="pdf">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <Select defaultValue="last-7">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last-7">Last 7 days</SelectItem>
                  <SelectItem value="last-30">Last 30 days</SelectItem>
                  <SelectItem value="last-90">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {exportProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Exporting...</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowExportModal(false)}
              disabled={exportProgress > 0 && exportProgress < 100}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={exportProgress > 0 && exportProgress < 100}
              className={showShimmer ? "animate-pulse-subtle" : ""}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Reports;
