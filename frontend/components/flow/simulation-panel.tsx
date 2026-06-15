"use client";

import { useState } from "react";
import {
  X, Users, Clock, Timer, ArrowRightLeft, Percent,
  Zap, Activity, BarChart2, Plus, Trash2, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { TrafficBurst } from "@/lib/types";

// ─── Preset diurnal patterns ──────────────────────────────────────────────────

const DIURNAL_PRESETS = {
  standard: {
    label: "Standard Workday",
    anchors: [
      { hour: 0, multiplier: 0.05 }, { hour: 6, multiplier: 0.15 },
      { hour: 8, multiplier: 0.70 }, { hour: 10, multiplier: 1.00 },
      { hour: 12, multiplier: 0.85 }, { hour: 14, multiplier: 0.90 },
      { hour: 17, multiplier: 0.95 }, { hour: 19, multiplier: 0.60 },
      { hour: 22, multiplier: 0.20 }, { hour: 23, multiplier: 0.08 },
    ],
  },
  ecommerce: {
    label: "E-Commerce",
    anchors: [
      { hour: 0, multiplier: 0.10 }, { hour: 3, multiplier: 0.05 },
      { hour: 7, multiplier: 0.30 }, { hour: 10, multiplier: 0.75 },
      { hour: 12, multiplier: 1.00 }, { hour: 14, multiplier: 0.80 },
      { hour: 18, multiplier: 0.85 }, { hour: 20, multiplier: 0.95 },
      { hour: 22, multiplier: 0.70 }, { hour: 23, multiplier: 0.40 },
    ],
  },
  socialMedia: {
    label: "Social / Media",
    anchors: [
      { hour: 0, multiplier: 0.30 }, { hour: 3, multiplier: 0.15 },
      { hour: 7, multiplier: 0.60 }, { hour: 9, multiplier: 0.80 },
      { hour: 12, multiplier: 0.90 }, { hour: 15, multiplier: 0.85 },
      { hour: 18, multiplier: 0.95 }, { hour: 20, multiplier: 1.00 },
      { hour: 22, multiplier: 0.85 }, { hour: 23, multiplier: 0.60 },
    ],
  },
  uniform: {
    label: "Flat / Uniform",
    anchors: [
      { hour: 0, multiplier: 1.0 }, { hour: 23, multiplier: 1.0 },
    ],
  },
} as const;

// ─── Small section heading ────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Mini bar chart for diurnal preview ───────────────────────────────────────

function DiurnalPreview({ anchors }: { anchors: { hour: number; multiplier: number }[] }) {
  const sorted = [...anchors].sort((a, b) => a.hour - b.hour);

  // Interpolate to 24 hourly points
  const points: number[] = [];
  for (let h = 0; h < 24; h++) {
    let lo = sorted[0], hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].hour <= h && sorted[i + 1].hour >= h) { lo = sorted[i]; hi = sorted[i + 1]; break; }
    }
    const t = hi.hour === lo.hour ? 0 : (h - lo.hour) / (hi.hour - lo.hour);
    points.push(lo.multiplier + t * (hi.multiplier - lo.multiplier));
  }

  const max = Math.max(...points, 0.01);

  return (
    <div className="flex items-end gap-px h-12 w-full bg-secondary/20 rounded px-1 py-1">
      {points.map((v, h) => (
        <div key={h} className="flex-1 flex flex-col items-center gap-px group relative">
          <div
            className="w-full rounded-sm bg-[var(--chart-2)] opacity-70 group-hover:opacity-100 transition-opacity"
            style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
          />
          <div className="hidden group-hover:block absolute bottom-full mb-1 text-[10px] bg-card border border-border rounded px-1 whitespace-nowrap z-10">
            {h}:00 · {(v * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SimulationPanel() {
  const {
    simulationConfig,
    setSimulationConfig,
    isSimulationPanelOpen,
    toggleSimulationPanel,
    simulationStatus,
    simulationProgress,
  } = useFlowStore();
  const cfg = simulationConfig;
  const ts  = cfg.timeScale ?? { factor: 1, virtualDurationMs: cfg.simulationDuration };

  if (!isSimulationPanelOpen) return null;

  const isScaled = ts.factor > 1;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setTs(partial: Partial<typeof ts>) {
    setSimulationConfig({ timeScale: { ...ts, ...partial } });
  }

  function addBurst() {
    const bursts: TrafficBurst[] = [...(ts.bursts ?? []), { startHour: 12, durationHours: 1, multiplier: 3, label: "Burst" }];
    setTs({ bursts });
  }

  function updateBurst(i: number, partial: Partial<TrafficBurst>) {
    const bursts = (ts.bursts ?? []).map((b, idx) => idx === i ? { ...b, ...partial } : b);
    setTs({ bursts });
  }

  function removeBurst(i: number) {
    setTs({ bursts: (ts.bursts ?? []).filter((_, idx) => idx !== i) });
  }

  function applyPreset(key: keyof typeof DIURNAL_PRESETS) {
    setTs({ diurnalPattern: DIURNAL_PRESETS[key].anchors });
  }

  const scaledRealMinutes = isScaled
    ? Math.round(((ts.virtualDurationMs ?? cfg.simulationDuration) / ts.factor) / 60_000 * 10) / 10
    : null;

  // FIX #13: derive the real wall-clock duration so we can show it next to the
  // virtual-duration input, preventing confusion about how long the test runs.
  const computedRealMs = isScaled && ts.virtualDurationMs
    ? Math.round(ts.virtualDurationMs / ts.factor)
    : cfg.simulationDuration;
  const computedRealLabel = computedRealMs < 60_000
    ? `${(computedRealMs / 1000).toFixed(1)}s real`
    : `${(computedRealMs / 60_000).toFixed(1)} min real`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-foreground">Simulation Configuration</h2>
            {isScaled && (
              <p className="text-xs text-[var(--chart-2)] mt-0.5">
                ⚡ Time-scaled · {ts.factor}× compression · {scaledRealMinutes} real min = {Math.round((ts.virtualDurationMs ?? 0) / 3_600_000 * 10) / 10}h simulated
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSimulationPanel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* ── Basic settings ────────────────────────────────────────────── */}
          <Section title="Basic Settings" defaultOpen>
            {/* Users */}
            <div className="space-y-2">
              <SectionHeader icon={<Users className="w-4 h-4" />} title="Number of Users" />
              <div className="flex items-center gap-3">
                <Slider value={[cfg.numberOfUsers]} onValueChange={([v]) => setSimulationConfig({ numberOfUsers: v })}
                  min={1} max={1000} step={1} className="flex-1" />
                <Input type="number" value={cfg.numberOfUsers}
                  onChange={(e) => setSimulationConfig({ numberOfUsers: parseInt(e.target.value) || 1 })}
                  className="w-20 bg-input text-center" min={1} max={1000} />
              </div>
            </div>

            {/* Max concurrent */}
            <div className="space-y-2">
              <SectionHeader icon={<Activity className="w-4 h-4" />} title="Max Concurrent Sessions" subtitle="Semaphore cap — prevents runaway parallelism" />
              <div className="flex items-center gap-3">
                <Slider value={[cfg.maxConcurrentUsers ?? cfg.numberOfUsers]}
                  onValueChange={([v]) => setSimulationConfig({ maxConcurrentUsers: v })}
                  min={1} max={500} step={1} className="flex-1" />
                <Input type="number" value={cfg.maxConcurrentUsers ?? cfg.numberOfUsers}
                  onChange={(e) => setSimulationConfig({ maxConcurrentUsers: parseInt(e.target.value) || 1 })}
                  className="w-20 bg-input text-center" />
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <SectionHeader icon={<Timer className="w-4 h-4" />} title="Real Duration (ms)" subtitle="Actual wall-clock time the simulation runs" />
              <Input type="number" value={cfg.simulationDuration}
                onChange={(e) => setSimulationConfig({ simulationDuration: parseInt(e.target.value) || 1000 })}
                className="bg-input" min={1000} max={3_600_000} step={1000} />
            </div>

            {/* Base inter-arrival */}
            <div className="space-y-2">
              <SectionHeader icon={<Clock className="w-4 h-4" />} title="Base Inter-Arrival (ms)"
                subtitle={cfg.arrivalMode === "poisson" ? "Mean of exponential distribution (Poisson process)" : "Fixed interval between arrivals"} />
              <div className="flex gap-2">
                <Input type="number" value={cfg.timeBetweenArrivals}
                  onChange={(e) => setSimulationConfig({ timeBetweenArrivals: parseInt(e.target.value) || 100 })}
                  className="bg-input flex-1" />
                <div className="flex rounded-md overflow-hidden border border-border">
                  {(["fixed", "poisson"] as const).map((mode) => (
                    <button key={mode}
                      className={`px-3 py-2 text-xs font-medium transition-colors ${cfg.arrivalMode === mode ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "bg-card text-muted-foreground hover:bg-secondary"}`}
                      onClick={() => setSimulationConfig({ arrivalMode: mode })}>
                      {mode === "fixed" ? "Fixed" : "Poisson"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Exit probability */}
            <div className="space-y-2">
              <SectionHeader icon={<Percent className="w-4 h-4" />} title="Exit Probability" subtitle="Per-step probability a user leaves the flow" />
              <div className="flex items-center gap-3">
                <Slider value={[cfg.exitProbability]} onValueChange={([v]) => setSimulationConfig({ exitProbability: v })}
                  min={0} max={1} step={0.01} className="flex-1" />
                <span className="w-14 text-center text-sm font-mono text-foreground">
                  {(cfg.exitProbability * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Max steps */}
            <div className="space-y-2">
              <SectionHeader icon={<ArrowRightLeft className="w-4 h-4" />} title="Max Steps Per Session"
                subtitle="Hard ceiling — geometric distribution used for realism" />
              <div className="flex items-center gap-3">
                <Slider value={[cfg.maxStepsPerSession]} onValueChange={([v]) => setSimulationConfig({ maxStepsPerSession: v })}
                  min={1} max={100} step={1} className="flex-1" />
                <Input type="number" value={cfg.maxStepsPerSession}
                  onChange={(e) => setSimulationConfig({ maxStepsPerSession: parseInt(e.target.value) || 1 })}
                  className="w-20 bg-input text-center" />
              </div>
            </div>
          </Section>

          {/* ── Think time ────────────────────────────────────────────────── */}
          <Section title="Think Time">
            <div className="flex gap-2 mb-3">
              {(["none", "fixed", "uniform"] as const).map((mode) => (
                <button key={mode}
                  className={`flex-1 py-2 text-xs font-medium rounded-md border transition-colors ${cfg.thinkTime?.mode === mode ? "bg-[var(--accent)] text-[var(--accent-foreground)] border-[var(--accent)]" : "bg-card border-border text-muted-foreground hover:bg-secondary"}`}
                  onClick={() => setSimulationConfig({ thinkTime: { ...cfg.thinkTime, mode } })}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            {cfg.thinkTime?.mode === "fixed" && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Fixed delay (ms)</Label>
                <Input type="number" value={cfg.thinkTime?.fixedMs ?? 500}
                  onChange={(e) => setSimulationConfig({ thinkTime: { ...cfg.thinkTime!, fixedMs: parseInt(e.target.value) || 0 } })}
                  className="bg-input" />
              </div>
            )}
            {cfg.thinkTime?.mode === "uniform" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Min (ms)</Label>
                  <Input type="number" value={cfg.thinkTime?.minMs ?? 200}
                    onChange={(e) => setSimulationConfig({ thinkTime: { ...cfg.thinkTime!, minMs: parseInt(e.target.value) || 0 } })}
                    className="bg-input" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">Max (ms)</Label>
                  <Input type="number" value={cfg.thinkTime?.maxMs ?? 2000}
                    onChange={(e) => setSimulationConfig({ thinkTime: { ...cfg.thinkTime!, maxMs: parseInt(e.target.value) || 0 } })}
                    className="bg-input" />
                </div>
              </div>
            )}
          </Section>

          {/* ── Time Scaling ─────────────────────────────────────────────── */}
          <Section title="⏱ Time Scaling — Simulate 24h in Minutes">
            <div className="space-y-4">
              {/* Factor */}
              <div className="space-y-2">
                <SectionHeader icon={<Zap className="w-4 h-4" />} title="Scale Factor"
                  subtitle="1 = real time · 144 = 10 min simulates 24 h · 60 = 1 h in 1 min" />
                <div className="flex items-center gap-3">
                  <Slider value={[ts.factor]} onValueChange={([v]) => setTs({ factor: v })}
                    min={1} max={360} step={1} className="flex-1" />
                  <Input type="number" value={ts.factor} onChange={(e) => setTs({ factor: parseInt(e.target.value) || 1 })}
                    className="w-20 bg-input text-center" min={1} max={360} />
                </div>
                {ts.factor > 1 && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "10 min → 24h", factor: 144 },
                      { label: "1 min → 1h", factor: 60 },
                      { label: "1 min → 30m", factor: 30 },
                    ].map(({ label, factor }) => (
                      <button key={factor}
                        className={`text-xs py-1.5 rounded border transition-colors ${ts.factor === factor ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-foreground)]" : "border-border text-muted-foreground hover:bg-secondary"}`}
                        onClick={() => setTs({ factor })}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Virtual duration */}
              {ts.factor > 1 && (
                <div className="space-y-2">
                  <SectionHeader icon={<BarChart2 className="w-4 h-4" />} title="Simulated Duration"
                    subtitle="Total virtual time window being modelled" />
                  <div className="flex gap-2">
                    {[
                      { label: "1 Hour", ms: 3_600_000 },
                      { label: "8 Hours", ms: 28_800_000 },
                      { label: "24 Hours", ms: 86_400_000 },
                    ].map(({ label, ms }) => (
                      <button key={ms}
                        className={`flex-1 py-2 text-xs font-medium rounded border transition-colors ${(ts.virtualDurationMs ?? 0) === ms ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-foreground)]" : "border-border text-muted-foreground hover:bg-secondary"}`}
                        onClick={() => setTs({ virtualDurationMs: ms })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* FIX #13: show derived real duration so the user always knows
                      how long the test will actually run on the wall clock. */}
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">
                      Custom: <Input type="number" value={ts.virtualDurationMs ?? cfg.simulationDuration}
                        onChange={(e) => setTs({ virtualDurationMs: parseInt(e.target.value) || cfg.simulationDuration })}
                        className="inline-block bg-input w-32 ml-2 h-7 text-xs" />
                      &nbsp;ms
                    </p>
                    <span className="text-xs font-medium text-[var(--chart-2)] whitespace-nowrap">
                      ≈ {computedRealLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Diurnal Pattern ───────────────────────────────────────────── */}
          {ts.factor > 1 && (
            <Section title="📈 Diurnal Traffic Pattern (24-Hour Curve)">
              <div className="space-y-3">
                {/* Preset buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(DIURNAL_PRESETS).map(([key, preset]) => (
                    <button key={key}
                      className="text-xs py-2 px-3 rounded border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors text-left"
                      onClick={() => applyPreset(key as keyof typeof DIURNAL_PRESETS)}>
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Preview chart */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Traffic intensity by hour (hover to inspect)</p>
                  <DiurnalPreview anchors={ts.diurnalPattern ?? DIURNAL_PRESETS.standard.anchors} />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex gap-1 items-start">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  Select a preset to apply a traffic curve. The curve is linearly interpolated between anchor points.
                </p>
              </div>
            </Section>
          )}

          {/* ── Traffic Bursts ────────────────────────────────────────────── */}
          {ts.factor > 1 && (
            <Section title="⚡ Traffic Bursts (Flash Sales, Breaking News…)">
              <div className="space-y-3">
                {(ts.bursts ?? []).map((burst, i) => (
                  <div key={i} className="p-3 rounded-lg bg-secondary/20 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <Input
                        placeholder="Label (e.g. Flash Sale)"
                        value={burst.label ?? ""}
                        onChange={(e) => updateBurst(i, { label: e.target.value })}
                        className="bg-input text-sm h-7 flex-1 mr-2"
                      />
                      <button onClick={() => removeBurst(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Start hour</Label>
                        <Input type="number" value={burst.startHour} min={0} max={23}
                          onChange={(e) => updateBurst(i, { startHour: parseInt(e.target.value) || 0 })}
                          className="bg-input h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Duration (h)</Label>
                        <Input type="number" value={burst.durationHours} min={0.1} max={4} step={0.1}
                          onChange={(e) => updateBurst(i, { durationHours: parseFloat(e.target.value) || 0.5 })}
                          className="bg-input h-7 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Multiplier</Label>
                        <Input type="number" value={burst.multiplier} min={1.1} max={20} step={0.1}
                          onChange={(e) => updateBurst(i, { multiplier: parseFloat(e.target.value) || 2 })}
                          className="bg-input h-7 text-xs" />
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={addBurst}>
                  <Plus className="w-3 h-3" /> Add Traffic Burst
                </Button>
              </div>
            </Section>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex flex-col gap-3 shrink-0">
          {/* FIX #12: progress bar shown while a simulation is running */}
          {(simulationStatus === "running" || simulationStatus === "validating") && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{simulationStatus === "validating" ? "Validating…" : "Running simulation…"}</span>
                <span>{Math.round(simulationProgress * 100)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                  style={{ width: `${Math.round(simulationProgress * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={toggleSimulationPanel}>Save Configuration</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
