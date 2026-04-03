"use client"

import { useFetch } from "@/lib/use-fetch"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

interface EvalRecord {
  eval_id: string
  name: string
  trace_id: string
  dataset?: string
  metric: string
  score: number
  passed: boolean
  model?: string
  timestamp_ms: number
  latency_ms?: number
  tokens?: number
}

interface EvalsResponse {
  evals: EvalRecord[]
  summary: {
    count: number
    passed: number
    failed: number
    avg_score: number
    by_metric: Record<string, number>
  }
}

export function EvalsPanel() {
  const { data, loading } = useFetch<EvalsResponse>("/traces/evals")
  const evals = data?.evals ?? []
  const summary = data?.summary

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
        Loading evals…
      </div>
    )
  }

  if (evals.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
        <p className="text-[13px] font-medium text-text-secondary">
          No evaluations found
        </p>
        <p className="text-xs">
          Write eval records to{" "}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
            ~/.dgx-lab/traces/*/evals.jsonl
          </code>
        </p>
      </div>
    )
  }

  const passRate = summary
    ? Math.round((summary.passed / Math.max(summary.count, 1)) * 100)
    : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Summary strip */}
      {summary && (
        <div className="shrink-0 border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Total </span>
              <span className="font-semibold text-foreground">
                {summary.count}
              </span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Passed </span>
              <span className="font-semibold text-cyan">{summary.passed}</span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Failed </span>
              <span className="font-semibold" style={{ color: "var(--color-red)" }}>
                {summary.failed}
              </span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Pass rate </span>
              <span className="font-semibold text-foreground">{passRate}%</span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Avg score </span>
              <span className="font-semibold text-foreground">
                {summary.avg_score}
              </span>
            </div>
          </div>

          {/* Per-metric bars */}
          {summary.by_metric && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {Object.entries(summary.by_metric).map(([metric, avg]) => (
                <div key={metric}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] text-text-tertiary">
                      {metric}
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-text-secondary">
                      {avg}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "var(--active)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(avg * 100, 100)}%`,
                        background:
                          avg >= 0.8
                            ? "var(--color-cyan)"
                            : avg >= 0.5
                              ? "var(--color-amber)"
                              : "var(--color-red)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Eval rows */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {/* Header */}
          <div className="grid grid-cols-[minmax(0,1fr)_80px_60px_60px_80px_64px] gap-2 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
            <span>Eval</span>
            <span>Metric</span>
            <span>Score</span>
            <span />
            <span>Trace</span>
            <span className="text-right">Result</span>
          </div>

          <div className="space-y-px">
            {evals.map((ev) => (
              <div
                key={ev.eval_id}
                className="grid grid-cols-[minmax(0,1fr)_80px_60px_60px_80px_64px] items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-elevated"
              >
                <span className="truncate text-[12px] font-medium text-foreground">
                  {ev.name}
                </span>
                <span className="font-mono text-[10px] text-text-tertiary">
                  {ev.metric}
                </span>
                <span className="font-mono text-[11px] font-semibold text-text-secondary">
                  {ev.score.toFixed(2)}
                </span>
                {/* Score bar */}
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--active)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(ev.score * 100, 100)}%`,
                      background: ev.passed
                        ? "var(--color-cyan)"
                        : "var(--color-red)",
                    }}
                  />
                </div>
                <span className="truncate font-mono text-[10px] text-text-tertiary">
                  {ev.trace_id}
                </span>
                <div className="flex justify-end">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium",
                      ev.passed
                        ? "bg-cyan-dim text-cyan"
                        : "bg-red-dim text-red",
                    )}
                  >
                    {ev.passed ? "PASS" : "FAIL"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
