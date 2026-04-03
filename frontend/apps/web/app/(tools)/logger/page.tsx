"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useFetch } from "@/lib/use-fetch"
import { api } from "@/lib/api"
import { LossChart, CHART_COLORS } from "@/components/logger/loss-chart"
import { RunTable } from "@/components/logger/run-table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Button } from "@workspace/ui/components/button"

interface Checkpoint {
  name: string
  size_bytes: number
}

interface Experiment {
  id: string
  name: string
  run_count: number
  best_loss: number | null
  best_run: string | null
}

interface Run {
  id: string
  name?: string
  status: string
  config: Record<string, unknown> | null
  best_loss: number | null
  best_loss_step: number | null
  eval_acc?: number | null
  total_steps?: number | null
  duration?: string | null
  checkpoints: number
  artifacts?: number
  hash?: string
}

interface Metric {
  step: number
  loss?: number
  learning_rate?: number
  grad_norm?: number
  gpu_util?: number
  [key: string]: number | string | undefined
}

type ChartRun = { id: string; label: string; metrics: Metric[] }

type FilterKey = "all" | "complete" | "best_loss"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "complete", label: "Complete" },
  { key: "best_loss", label: "Best Loss" },
]

const TAB_TRIGGER =
  "font-sans text-[11.5px] text-text-secondary after:bg-cyan data-[state=active]:text-cyan hover:text-foreground"

/* ------------------------------------------------------------------ */
/*  Feature importance (Shapley values)                                */
/* ------------------------------------------------------------------ */

interface ShapleyFeature {
  feature: string
  shapley_value: number
  importance: number
}

interface ImportanceResponse {
  features: ShapleyFeature[]
  run_count: number
  metric: string
  direction: string
}

function FeatureImportance({ experimentId }: { experimentId: string | null }) {
  const { data } = useFetch<ImportanceResponse>(
    experimentId ? `/logger/experiments/${experimentId}/importance` : null
  )

  if (!data || data.features.length === 0) return null

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
    >
      <div className="mb-4 flex flex-col gap-0.5">
        <h3
          className="font-sans text-[14px] font-medium"
          style={{ color: "var(--foreground)" }}
        >
          Hyperparameter Importance
        </h3>
        <p
          className="font-mono text-[11px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Shapley values · {data.run_count} runs · {data.direction} {data.metric}
        </p>
      </div>

      <div className="space-y-2.5">
        {data.features.map((f) => {
          const isPositive = f.shapley_value > 0
          return (
            <div key={f.feature} className="flex items-center gap-3">
              <span
                className="w-[120px] shrink-0 text-right font-mono text-[11px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {f.feature}
              </span>

              <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* Bar */}
                <div className="relative h-[18px] flex-1 overflow-hidden rounded-md" style={{ background: "var(--elevated)" }}>
                  <div
                    className="absolute top-0 h-full rounded-md transition-all"
                    style={{
                      width: `${f.importance * 100}%`,
                      background: isPositive ? "var(--color-amber)" : "var(--color-cyan)",
                      opacity: 0.7,
                    }}
                  />
                  <span
                    className="absolute inset-0 flex items-center px-2 font-mono text-[10px] font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    {f.importance >= 0.15 ? f.shapley_value.toFixed(4) : ""}
                  </span>
                </div>

                {/* Value label */}
                <span
                  className="w-[52px] shrink-0 text-right font-mono text-[10px] font-semibold tabular-nums"
                  style={{
                    color: isPositive ? "var(--color-amber)" : "var(--color-cyan)",
                  }}
                >
                  {(f.importance * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p
        className="mt-3 font-mono text-[10px]"
        style={{ color: "var(--text-dim)" }}
      >
        {data.direction === "minimize" ? "Amber" : "Cyan"} = increases {data.metric} · {data.direction === "minimize" ? "Cyan" : "Amber"} = decreases {data.metric}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Artifacts tab                                                      */
/* ------------------------------------------------------------------ */

function ArtifactsTab({ runs, experimentId }: { runs: Run[]; experimentId: string | null }) {
  const [checkpoints, setCheckpoints] = useState<Record<string, Checkpoint[]>>({})

  useEffect(() => {
    if (!experimentId) return
    for (const run of runs) {
      if (run.checkpoints === 0) continue
      api<Checkpoint[]>(`/logger/experiments/${experimentId}/runs/${run.id}/checkpoints`).then((ckpts) => {
        setCheckpoints((prev) => ({ ...prev, [run.id]: ckpts }))
      })
    }
  }, [runs, experimentId])

  const runsWithCkpts = runs.filter((r) => r.checkpoints > 0)

  if (runsWithCkpts.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl border px-6 py-16 font-sans text-[14px]"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--surface)",
          color: "var(--text-secondary)",
        }}
      >
        No checkpoints saved yet.
      </div>
    )
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const totalCkpts = runsWithCkpts.reduce((s, r) => s + r.checkpoints, 0)
  const totalSize = Object.values(checkpoints)
    .flat()
    .reduce((s, c) => s + c.size_bytes, 0)

  return (
    <>
      {/* Summary */}
      <div
        className="flex items-center gap-6 rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
      >
        <div className="font-mono text-[11px]">
          <span style={{ color: "var(--text-tertiary)" }}>Checkpoints </span>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>{totalCkpts}</span>
        </div>
        <div className="font-mono text-[11px]">
          <span style={{ color: "var(--text-tertiary)" }}>Total size </span>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>{fmtSize(totalSize)}</span>
        </div>
        <div className="font-mono text-[11px]">
          <span style={{ color: "var(--text-tertiary)" }}>Runs with artifacts </span>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>{runsWithCkpts.length}</span>
        </div>
      </div>

      {/* Per-run checkpoint lists */}
      {runsWithCkpts.map((run) => {
        const ckpts = checkpoints[run.id] ?? []
        return (
          <div
            key={run.id}
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2.5"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-[13px] font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  {run.name ?? run.id}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
                  style={{ background: "var(--color-cyan-dim)", color: "var(--color-cyan)" }}
                >
                  {run.checkpoints} checkpoints
                </span>
              </div>
              {run.best_loss != null && (
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  best loss {run.best_loss.toFixed(4)}
                </span>
              )}
            </div>
            {ckpts.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {ckpts.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-[var(--elevated)]"
                  >
                    <span
                      className="font-mono text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {c.name}
                    </span>
                    <span
                      className="font-mono text-[11px] tabular-nums"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {fmtSize(c.size_bytes)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="px-4 py-3 font-mono text-[11px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                Loading checkpoints…
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LoggerPage() {
  const { data: experiments, loading } =
    useFetch<Experiment[]>("/logger/experiments")
  const [selectedExp, setSelectedExp] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set())
  const [runMetrics, setRunMetrics] = useState<Record<string, Metric[]>>({})
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")

  useEffect(() => {
    if (experiments && experiments.length > 0 && !selectedExp) {
      setSelectedExp(experiments[0]!.id)
    }
  }, [experiments, selectedExp])

  useEffect(() => {
    if (!selectedExp) return
    api<Run[]>(`/logger/experiments/${selectedExp}/runs`).then((r) => {
      setRuns(r)
      setSelectedRuns(new Set(r.map((run) => run.id)))
      setRunMetrics({})
    })
  }, [selectedExp])

  useEffect(() => {
    if (!selectedExp || selectedRuns.size === 0) return

    for (const runId of selectedRuns) {
      if (runMetrics[runId]) continue
      api<Metric[]>(
        `/logger/experiments/${selectedExp}/runs/${runId}/metrics`,
      ).then((metrics) => {
        setRunMetrics((prev) => ({ ...prev, [runId]: metrics }))
      })
    }
  }, [selectedExp, selectedRuns, runMetrics])

  const toggleRun = useCallback((id: string) => {
    setSelectedRuns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exp = experiments?.find((e) => e.id === selectedExp)

  const filteredRuns = useMemo(() => {
    switch (activeFilter) {
      case "complete":
        return runs.filter((r) => r.status === "complete")
      case "best_loss":
        return runs.filter((r) => r.best_loss != null && r.best_loss < 0.8)
      default:
        return runs
    }
  }, [runs, activeFilter])

  const chartRuns: ChartRun[] = useMemo(() => {
    return Array.from(selectedRuns)
      .filter((id) => runMetrics[id]?.length)
      .map((id) => {
        const run = runs.find((r) => r.id === id)
        const lr = run?.config?.lr ?? run?.config?.learning_rate ?? ""
        return {
          id,
          label: `${run?.name ?? id}${lr ? ` · lr=${lr}` : ""}`,
          metrics: runMetrics[id]!,
        }
      })
  }, [selectedRuns, runMetrics, runs])

  const latestStats = useMemo(() => {
    const ids = Array.from(selectedRuns)
    let best: Metric | null = null
    for (const id of ids) {
      const series = runMetrics[id]
      if (!series?.length) continue
      const last = series.reduce((a, b) => (a.step > b.step ? a : b))
      if (!best || last.step > best.step) best = last
    }
    if (!best) return null
    return {
      lr: best.learning_rate as number | undefined,
      grad_norm: best.grad_norm as number | undefined,
      gpu_util: best.gpu_util as number | undefined,
    }
  }, [runMetrics, selectedRuns])

  return (
    <div className="p-6 font-sans">
      <Tabs defaultValue="experiments">
        {/* ---- Tab bar ---- */}
        <div
          className="flex flex-wrap items-center gap-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <TabsList variant="line" className="gap-4 bg-transparent">
            <TabsTrigger value="experiments" className={TAB_TRIGGER}>
              Experiments
            </TabsTrigger>
            <TabsTrigger value="compare" className={TAB_TRIGGER}>
              Compare
            </TabsTrigger>
            <TabsTrigger value="artifacts" className={TAB_TRIGGER}>
              Artifacts
            </TabsTrigger>
          </TabsList>

          {experiments && experiments.length > 1 && (
            <select
              className="ml-auto rounded-lg border px-3 py-1.5 font-sans text-[13px] outline-none"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
              value={selectedExp ?? ""}
              onChange={(e) => {
                setSelectedExp(e.target.value)
                setRuns([])
                setRunMetrics({})
              }}
            >
              {experiments.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ---- States ---- */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="flex flex-col items-center gap-3"
              style={{ color: "var(--text-secondary)" }}
            >
              <div
                className="h-5 w-5 animate-spin rounded-full border-2"
                style={{
                  borderColor: "var(--text-tertiary)",
                  borderTopColor: "var(--color-cyan)",
                }}
              />
              <span className="text-[14px]">Scanning experiments…</span>
            </div>
          </div>
        ) : experiments?.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 py-24 text-[14px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <p>No experiments found.</p>
            <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              Place experiment directories in{" "}
              <code
                className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                style={{ background: "var(--elevated)" }}
              >
                ~/.dgx-lab/experiments/
              </code>
            </p>
          </div>
        ) : (
          <>
            {/* ============ Experiments tab ============ */}
            <TabsContent value="experiments" className="mt-6 space-y-6">
              {/* Header */}
              <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2
                      className="truncate text-[20px] font-semibold leading-tight"
                      style={{ color: "var(--foreground)" }}
                    >
                      {exp?.name ?? "—"}
                    </h2>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[12px] font-medium"
                      style={{
                        background: "var(--color-cyan-dim)",
                        color: "var(--color-cyan)",
                      }}
                    >
                      {exp?.run_count ?? 0} runs
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveFilter(key)}
                        className="rounded-full px-3 py-1 font-mono text-[11px] font-medium transition-colors"
                        style={
                          activeFilter === key
                            ? {
                                background: "var(--color-cyan-dim)",
                                color: "var(--color-cyan)",
                              }
                            : {
                                background: "var(--elevated)",
                                color: "var(--text-secondary)",
                              }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border-subtle font-sans text-[13px] text-text-secondary hover:border-cyan/40 hover:text-foreground"
                  >
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border-subtle font-sans text-[13px] text-text-secondary hover:border-cyan/40 hover:text-foreground"
                  >
                    Compare Selected
                  </Button>
                  <Button
                    size="sm"
                    className="font-sans text-[13px]"
                    style={{
                      background: "var(--color-cyan)",
                      color: "#000",
                    }}
                  >
                    + New Run
                  </Button>
                </div>
              </header>

              {/* Chart + Live metrics strip */}
              <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
                <div
                  className="min-w-0 flex-1 rounded-xl border p-4"
                  style={{
                    borderColor: "var(--border-subtle)",
                    background: "var(--surface)",
                  }}
                >
                  <div className="mb-4 flex flex-col gap-0.5">
                    <h3
                      className="font-sans text-[14px] font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      Training Loss
                    </h3>
                    <p
                      className="font-mono text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      step vs loss · smoothing 0.6
                    </p>
                  </div>
                  <LossChart runs={chartRuns} smoothing={0.6} />
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2 xl:w-[200px]">
                  {(
                    [
                      {
                        label: "Learning Rate",
                        value: latestStats?.lr,
                        fmt: (v: number) => v.toExponential(1),
                      },
                      {
                        label: "Grad Norm",
                        value: latestStats?.grad_norm,
                        fmt: (v: number) => v.toFixed(2),
                      },
                      {
                        label: "GPU Util",
                        value: latestStats?.gpu_util,
                        fmt: (v: number) => `${Math.round(v)}%`,
                      },
                    ] as const
                  ).map(({ label, value, fmt }) => (
                    <div
                      key={label}
                      className="flex flex-1 flex-col justify-center rounded-lg border px-3 py-3"
                      style={{
                        borderColor: "var(--border-subtle)",
                        background: "var(--elevated)",
                      }}
                    >
                      <p
                        className="font-sans text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {label}
                      </p>
                      <p
                        className="mt-1 font-mono text-[13px] font-medium tabular-nums"
                        style={{ color: "var(--foreground)" }}
                      >
                        {value != null ? fmt(value as number) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature importance */}
              <FeatureImportance experimentId={selectedExp} />

              {/* Run table */}
              <div
                className="overflow-hidden rounded-xl border"
                style={{
                  borderColor: "var(--border-subtle)",
                  background: "var(--surface)",
                }}
              >
                <RunTable
                  runs={filteredRuns}
                  selectedIds={selectedRuns}
                  onToggle={toggleRun}
                  metricsMap={runMetrics}
                />
              </div>
            </TabsContent>

            {/* ============ Compare tab ============ */}
            <TabsContent value="compare" className="mt-6 space-y-6">
              {(() => {
                const compareRuns = runs.filter((r) => selectedRuns.has(r.id))
                if (compareRuns.length < 2) {
                  return (
                    <div
                      className="flex flex-col items-center gap-2 rounded-xl border px-6 py-16 font-sans text-[14px]"
                      style={{
                        borderColor: "var(--border-subtle)",
                        background: "var(--surface)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Select two or more runs in the Experiments tab to compare.
                    </div>
                  )
                }

                const allKeys = Array.from(
                  new Set(compareRuns.flatMap((r) => Object.keys(r.config ?? {})))
                )

                return (
                  <>
                    {/* Loss overlay */}
                    <div
                      className="rounded-xl border p-4"
                      style={{
                        borderColor: "var(--border-subtle)",
                        background: "var(--surface)",
                      }}
                    >
                      <div className="mb-4 flex flex-col gap-0.5">
                        <h3
                          className="font-sans text-[14px] font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          Loss Comparison
                        </h3>
                        <p
                          className="font-mono text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {compareRuns.length} runs selected
                        </p>
                      </div>
                      <LossChart runs={chartRuns.filter((r) => selectedRuns.has(r.id))} smoothing={0.6} />
                    </div>

                    {/* Config comparison table */}
                    <div
                      className="overflow-hidden rounded-xl border"
                      style={{
                        borderColor: "var(--border-subtle)",
                        background: "var(--surface)",
                      }}
                    >
                      <div
                        className="border-b px-4 py-2.5"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <h3
                          className="font-sans text-[14px] font-medium"
                          style={{ color: "var(--foreground)" }}
                        >
                          Configuration
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr
                              className="border-b"
                              style={{ borderColor: "var(--border-subtle)" }}
                            >
                              <th
                                className="px-4 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                Parameter
                              </th>
                              {compareRuns.map((r, i) => (
                                <th
                                  key={r.id}
                                  className="px-4 py-2 text-left font-mono text-[11px] font-semibold"
                                  style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}
                                >
                                  {r.name ?? r.id}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {/* Status row */}
                            <tr
                              className="border-b"
                              style={{ borderColor: "var(--border-subtle)" }}
                            >
                              <td
                                className="px-4 py-2 font-mono text-[11px]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                status
                              </td>
                              {compareRuns.map((r) => (
                                <td key={r.id} className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
                                  {r.status}
                                </td>
                              ))}
                            </tr>
                            {/* Best loss row */}
                            <tr
                              className="border-b"
                              style={{ borderColor: "var(--border-subtle)" }}
                            >
                              <td
                                className="px-4 py-2 font-mono text-[11px]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                best_loss
                              </td>
                              {compareRuns.map((r) => {
                                const isBest = compareRuns.every(
                                  (o) => r.best_loss == null || o.best_loss == null || r.best_loss <= o.best_loss
                                )
                                return (
                                  <td
                                    key={r.id}
                                    className="px-4 py-2 font-mono text-[11px] font-semibold"
                                    style={{ color: isBest ? "var(--color-cyan)" : "var(--text-secondary)" }}
                                  >
                                    {r.best_loss?.toFixed(4) ?? "—"}
                                  </td>
                                )
                              })}
                            </tr>
                            {/* Config rows */}
                            {allKeys.map((key) => {
                              const values = compareRuns.map((r) => String(r.config?.[key] ?? "—"))
                              const allSame = values.every((v) => v === values[0])
                              return (
                                <tr
                                  key={key}
                                  className="border-b"
                                  style={{ borderColor: "var(--border-subtle)" }}
                                >
                                  <td
                                    className="px-4 py-2 font-mono text-[11px]"
                                    style={{ color: "var(--text-tertiary)" }}
                                  >
                                    {key}
                                  </td>
                                  {values.map((v, i) => (
                                    <td
                                      key={compareRuns[i]!.id}
                                      className="px-4 py-2 font-mono text-[11px]"
                                      style={{
                                        color: allSame ? "var(--text-secondary)" : "var(--color-amber)",
                                      }}
                                    >
                                      {v}
                                    </td>
                                  ))}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )
              })()}
            </TabsContent>

            {/* ============ Artifacts tab ============ */}
            <TabsContent value="artifacts" className="mt-6 space-y-4">
              <ArtifactsTab runs={runs} experimentId={selectedExp} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
