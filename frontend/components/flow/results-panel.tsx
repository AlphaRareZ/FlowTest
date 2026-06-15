"use client";

import { X, Clock, Activity, CheckCircle, XCircle, TrendingUp, Zap, BarChart2 } from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceLine, Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a virtual timestamp for the X axis */
function fmtTimestamp(ms: number, isScaled: boolean): string {
  if (!isScaled) return `${(ms / 1000).toFixed(0)}s`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// ─── Shared tooltip style ─────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--foreground)",
    fontSize: "12px",
  },
};

// ─── Metric card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
  badge?: string;
}

function MetricCard({ title, value, subtitle, icon, color = "var(--accent)", badge }: MetricCardProps) {
  return (
    <div className="p-4 rounded-lg bg-card border border-border relative overflow-hidden">
      {badge && (
        <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--chart-2)]/20 text-[var(--chart-2)] font-medium">
          {badge}
        </span>
      )}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="p-2 rounded-md" style={{ backgroundColor: `${color}20` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ResultsPanel() {
  const { simulationResults, isResultsPanelOpen, toggleResultsPanel } = useFlowStore();

  if (!isResultsPanelOpen || !simulationResults) return null;

  const { totalRequests, avgResponseTime, successRate, errorRate, results, timeSeriesData, meta } = simulationResults;
  const isScaled = (meta?.timeScaleFactor ?? 1) > 1;

  // ── NEW: traffic multiplier overlay data ────────────────────────────────────
  const hasMultiplier = timeSeriesData.some((d) => d.trafficMultiplier !== undefined);

  // ── X-axis formatter ────────────────────────────────────────────────────────
  const xFmt = (v: number) => fmtTimestamp(v, isScaled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl max-h-[90vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-[var(--success)]/20">
              <TrendingUp className="w-5 h-5 text-[var(--success)]" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Simulation Results</h2>
              {meta ? (
                <p className="text-xs text-muted-foreground">
                  {isScaled
                    ? `${meta.timeScaleFactor}× time-scale · ${fmtDuration(meta.virtualDurationMs)} simulated in ${fmtDuration(meta.realDurationMs)} real time`
                    : `Real-time simulation · ${fmtDuration(meta.realDurationMs)}`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Performance metrics and analysis</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleResultsPanel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard title="Avg Response Time" value={`${avgResponseTime.toFixed(0)}ms`}
              subtitle="Across all endpoints" icon={<Clock className="w-4 h-4" />} color="var(--chart-1)" />
            <MetricCard title="Total Requests" value={totalRequests.toLocaleString()}
              subtitle="During simulation" icon={<Activity className="w-4 h-4" />} color="var(--chart-2)" />
            <MetricCard title="Success Rate" value={`${(successRate * 100).toFixed(1)}%`}
              subtitle="2XX / 3XX responses" icon={<CheckCircle className="w-4 h-4" />} color="var(--success)" />
            <MetricCard title="Error Rate" value={`${(errorRate * 100).toFixed(1)}%`}
              subtitle="4XX/5XX responses" icon={<XCircle className="w-4 h-4" />} color="var(--destructive)" />
          </div>

          {/* NEW: Time-scale summary row */}
          {isScaled && meta && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard title="Time Scale Factor" value={`${meta.timeScaleFactor}×`}
                subtitle="Compression ratio" icon={<Zap className="w-4 h-4" />}
                color="var(--chart-2)" badge="Scaled" />
              <MetricCard title="Peak Hour" value={`${String(meta.peakHour ?? 0).padStart(2, "0")}:00`}
                subtitle={`${meta.peakRps?.toFixed(1) ?? 0} req/s at peak`}
                icon={<TrendingUp className="w-4 h-4" />} color="var(--chart-3)" />
              <MetricCard title="Virtual Duration" value={fmtDuration(meta.virtualDurationMs)}
                subtitle={`${fmtDuration(meta.realDurationMs)} real time`}
                icon={<BarChart2 className="w-4 h-4" />} color="var(--chart-4)" />
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Response Time */}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <h3 className="text-sm font-medium text-foreground mb-4">
                Response Time{isScaled ? " (Simulated Time)" : " Over Time"}
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="timestamp" tickFormatter={xFmt} stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis tickFormatter={(v) => `${v}ms`} stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip {...tooltipStyle}
                      formatter={(v: number) => [`${v.toFixed(0)}ms`, "Response Time"]}
                      labelFormatter={(l) => isScaled ? `Time: ${xFmt(l)}` : `${(l / 1000).toFixed(0)}s`} />
                    <Area type="monotone" dataKey="responseTime" stroke="var(--chart-1)" strokeWidth={2} fill="url(#rtGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Requests per Second / with traffic multiplier overlay */}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <h3 className="text-sm font-medium text-foreground mb-4">
                Requests Per Second{isScaled && hasMultiplier ? " + Traffic Pattern" : ""}
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="timestamp" tickFormatter={xFmt} stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis yAxisId="rps" tickFormatter={(v) => `${v}/s`} stroke="var(--muted-foreground)" fontSize={11} />
                    {isScaled && hasMultiplier && (
                      <YAxis yAxisId="mult" orientation="right" tickFormatter={(v) => `${v}×`}
                        stroke="var(--muted-foreground)" fontSize={11} domain={[0, 2]} />
                    )}
                    <Tooltip {...tooltipStyle}
                      formatter={(v: number, name: string) =>
                        name === "trafficMultiplier" ? [`${v.toFixed(2)}×`, "Traffic Mult."] : [`${v.toFixed(1)}/s`, "RPS"]}
                      labelFormatter={(l) => isScaled ? `Time: ${xFmt(l)}` : `${(l / 1000).toFixed(0)}s`} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Line yAxisId="rps" type="monotone" dataKey="requestsPerSecond" name="Req/s"
                      stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                    {isScaled && hasMultiplier && (
                      <Line yAxisId="mult" type="monotone" dataKey="trafficMultiplier" name="Traffic Mult."
                        stroke="var(--chart-3)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" opacity={0.7} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* NEW: Diurnal bar chart — only shown when time-scaled */}
          {isScaled && hasMultiplier && (
            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
              <h3 className="text-sm font-medium text-foreground mb-1">
                Hourly Request Distribution (Simulated 24-Hour Pattern)
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Aggregated request volume by simulated hour of day — reflects diurnal traffic pattern
              </p>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={
                    // Aggregate per-hour from timeSeries
                    Array.from({ length: 24 }, (_, h) => {
                      const pts = timeSeriesData.filter((d) => d.hourOfDay === h);
                      const totalReqs = pts.reduce((s, d) => s + d.requestsPerSecond, 0);
                      const avgMult = pts.length > 0 ? pts.reduce((s, d) => s + (d.trafficMultiplier ?? 1), 0) / pts.length : 0;
                      return { hour: `${String(h).padStart(2, "0")}:00`, requests: Math.round(totalReqs), multiplier: Math.round(avgMult * 100) / 100 };
                    })
                  }>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={10}
                      interval={1} tick={{ fontSize: 9 }} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip {...tooltipStyle}
                      formatter={(v: number, name: string) =>
                        name === "multiplier" ? [`${v}×`, "Avg Multiplier"] : [v, "Requests"]} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="requests" name="Requests" fill="var(--chart-2)" opacity={0.8} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-page table */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <h3 className="text-sm font-medium text-foreground mb-4">Page Performance Breakdown</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Page</TableHead>
                    <TableHead className="text-muted-foreground">Endpoint</TableHead>
                    <TableHead className="text-muted-foreground text-right">Avg</TableHead>
                    <TableHead className="text-muted-foreground text-right">p95</TableHead>
                    <TableHead className="text-muted-foreground text-right">Requests</TableHead>
                    <TableHead className="text-muted-foreground text-right">✓</TableHead>
                    <TableHead className="text-muted-foreground text-right">✗</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => {
                    const errorPct = r.totalRequests > 0 ? (r.errorCount / r.totalRequests) * 100 : 0;
                    return (
                      <TableRow key={r.pageId} className="border-border">
                        <TableCell className="font-medium text-foreground">{r.pageName}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate">{r.endpoint}</TableCell>
                        <TableCell className="text-right text-foreground">{(r.avgResponseTime ?? 0).toFixed(0)}ms</TableCell>
                        <TableCell className="text-right text-foreground">
                          {r.p95ResponseTime != null ? `${r.p95ResponseTime.toFixed(0)}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-foreground">{r.totalRequests.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-[var(--success)]">{r.successCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className={errorPct > 5 ? "text-destructive font-medium" : "text-muted-foreground"}>
                            {r.errorCount.toLocaleString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end shrink-0">
          <Button onClick={toggleResultsPanel}>Close Results</Button>
        </div>
      </div>
    </div>
  );
}
