"use client"

import { useFetch } from "@/lib/use-fetch"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface CostRecord {
  timestamp_ms: number
  model: string
  operation: string
  trace_id: string
  tokens_in: number
  tokens_out: number
  cost: number
}

interface CostsResponse {
  records: CostRecord[]
  summary: {
    total_cost: number
    total_tokens_in: number
    total_tokens_out: number
    total_tokens: number
    count: number
    by_operation: Record<string, number>
    by_model: Record<string, number>
  }
}

const OP_COLORS: Record<string, string> = {
  generate: "var(--color-cyan)",
  classify: "var(--color-blue)",
  summarize: "var(--color-purple)",
  route: "var(--color-teal)",
  embed: "var(--color-amber)",
}

function opColor(op: string): string {
  return OP_COLORS[op] ?? "var(--text-secondary)"
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function CostsPanel() {
  const { data, loading } = useFetch<CostsResponse>("/traces/costs")
  const records = data?.records ?? []
  const summary = data?.summary

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
        Loading costs…
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
        <p className="text-[13px] font-medium text-text-secondary">
          No cost records found
        </p>
        <p className="text-xs">
          Write cost records to{" "}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
            ~/.dgx-lab/traces/*/costs.jsonl
          </code>
        </p>
      </div>
    )
  }

  const maxOpCost = summary
    ? Math.max(...Object.values(summary.by_operation), 0.001)
    : 1

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Summary strip */}
      {summary && (
        <div className="shrink-0 border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Total </span>
              <span className="font-semibold text-cyan">
                ${summary.total_cost.toFixed(4)}
              </span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Requests </span>
              <span className="font-semibold text-foreground">
                {summary.count}
              </span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Tokens in </span>
              <span className="font-semibold text-foreground">
                {summary.total_tokens_in.toLocaleString()}
              </span>
            </div>
            <div className="font-mono text-[11px]">
              <span className="text-text-tertiary">Tokens out </span>
              <span className="font-semibold text-foreground">
                {summary.total_tokens_out.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Operation breakdown */}
          <div className="mt-3 space-y-1.5">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
              By operation
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(summary.by_operation).map(([op, cost]) => (
                <div key={op}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="font-mono text-[10px] font-medium"
                      style={{ color: opColor(op) }}
                    >
                      {op}
                    </span>
                    <span className="font-mono text-[10px] text-text-secondary">
                      ${cost.toFixed(4)}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "var(--active)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(cost / maxOpCost) * 100}%`,
                        background: opColor(op),
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Records table */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {/* Header */}
          <div className="grid grid-cols-[72px_minmax(0,1fr)_80px_80px_72px_72px_64px] gap-2 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
            <span>Time</span>
            <span>Model</span>
            <span>Operation</span>
            <span>Trace</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
            <span className="text-right">Cost</span>
          </div>

          <div className="space-y-px">
            {records.map((r, i) => (
              <div
                key={`${r.trace_id}-${r.operation}-${i}`}
                className="grid grid-cols-[72px_minmax(0,1fr)_80px_80px_72px_72px_64px] items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-elevated"
              >
                <span className="font-mono text-[10px] text-text-tertiary">
                  {formatTime(r.timestamp_ms)}
                </span>
                <span className="truncate font-mono text-[11px] text-text-secondary">
                  {r.model}
                </span>
                <span
                  className="inline-flex w-fit rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium"
                  style={{
                    background: `color-mix(in srgb, ${opColor(r.operation)} 12%, transparent)`,
                    color: opColor(r.operation),
                  }}
                >
                  {r.operation}
                </span>
                <span className="truncate font-mono text-[10px] text-text-tertiary">
                  {r.trace_id}
                </span>
                <span className="text-right font-mono text-[10px] text-text-secondary">
                  {r.tokens_in.toLocaleString()}
                </span>
                <span className="text-right font-mono text-[10px] text-text-secondary">
                  {r.tokens_out.toLocaleString()}
                </span>
                <span className="text-right font-mono text-[10px] font-semibold text-cyan">
                  ${r.cost.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
