"use client"

import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

const SPAN_COLORS: Record<string, string> = {
  agent: "#a78bfa",
  chain: "#8b8993",
  llm: "#22d3ee",
  rag: "#f59e0b",
  embed: "#2dd4bf",
  tool: "#60a5fa",
  rank: "#fb923c",
  parse: "#5a5868",
}

const LEGEND_ORDER = [
  "agent",
  "chain",
  "llm",
  "rag",
  "embed",
  "tool",
  "rank",
  "parse",
] as const

interface Span {
  span_id?: string
  name: string
  type?: string
  start_time_ms?: number
  start_time?: number
  duration_ms?: number
  duration?: number
  attributes?: Record<string, unknown>
  status?: string
  error?: boolean
}

interface TraceDetail {
  id: string
  name: string
  duration_ms: number
  tokens: number
  cost: number | null
  span_count: number
  model: string | null
  spans: Span[]
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function barColor(type: string | undefined): string {
  return SPAN_COLORS[(type ?? "").toLowerCase()] ?? "#5a5868"
}

function rulerTicks(totalMs: number): number[] {
  if (totalMs <= 0) return [0]
  const count = 5
  const step = totalMs / (count - 1)
  return Array.from({ length: count }, (_, i) => Math.round(step * i))
}

export function Waterfall({
  trace,
  spans,
  totalDurationMs,
  selectedSpan,
  onSelectSpan,
  loading,
}: {
  trace?: TraceDetail | null
  spans: Span[]
  totalDurationMs: number
  selectedSpan: Span | null
  onSelectSpan: (span: Span) => void
  loading?: boolean
}) {
  if (!trace && !loading) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-tertiary">
        Select a trace to view its waterfall
      </div>
    )
  }

  if (loading && !trace) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-tertiary">
        Loading trace…
      </div>
    )
  }

  if (!trace) return null

  const minStart = spans.length
    ? Math.min(...spans.map((s) => s.start_time_ms ?? s.start_time ?? 0))
    : 0

  const total = Math.max(totalDurationMs, 1)
  const ticks = rulerTicks(total)

  return (
    <div className="flex h-full min-h-0 flex-col font-mono">
      {/* Trace header */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="truncate text-[12px] font-semibold text-foreground">
            {trace.name}
          </span>
          <span className="text-[10px] text-text-tertiary">
            trace:{trace.id.slice(0, 8)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-px text-[10px]">
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Duration </span>
            {fmtDuration(trace.duration_ms)}
          </span>
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Tokens </span>
            {trace.tokens.toLocaleString()}
          </span>
          {trace.cost != null && (
            <span className="text-text-secondary">
              <span className="text-text-tertiary">Cost </span>$
              {trace.cost.toFixed(4)}
            </span>
          )}
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Spans </span>
            {trace.span_count}
          </span>
          {trace.model && (
            <span className="text-cyan">
              <span className="text-text-tertiary">Model </span>
              {trace.model}
            </span>
          )}
        </div>
      </div>

      {/* Time ruler */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-1">
        <div
          className="flex justify-between text-[10px] text-text-tertiary tabular-nums"
          style={{ paddingLeft: 120 + 4 }}
        >
          {ticks.map((t, i) => (
            <span key={i}>{t.toLocaleString()}ms</span>
          ))}
        </div>
        <div className="mt-1 h-px w-full bg-border-subtle" />
      </div>

      {/* Span rows */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-px py-1 pr-1 pl-2">
          {spans.length === 0 ? (
            <div className="py-12 text-center text-[10px] text-text-tertiary">
              No spans in this trace.
            </div>
          ) : (
            spans.map((span, i) => {
              const start =
                (span.start_time_ms ?? span.start_time ?? 0) - minStart
              const dur = span.duration_ms ?? span.duration ?? 0
              const leftPct = total > 0 ? (start / total) * 100 : 0
              const widthPct =
                total > 0 ? Math.max((dur / total) * 100, 0.35) : 100
              const spanId = span.span_id ?? `span-${i}`
              const isSelected = selectedSpan === span
              const color = barColor(span.type)
              const attrs = span.attributes ?? {}
              const tokens = attrs.tokens as number | undefined
              const cost = attrs.cost as number | undefined
              const showInline = widthPct >= 12

              return (
                <button
                  key={spanId}
                  type="button"
                  onClick={() => onSelectSpan(span)}
                  className={cn(
                    "flex w-full items-center gap-1 rounded-sm py-px pr-1 text-left transition-colors",
                    isSelected ? "bg-active" : "hover:bg-hover",
                  )}
                >
                  {/* Span label */}
                  <div
                    className="w-[120px] shrink-0 truncate text-[10px] text-text-secondary"
                    title={span.name}
                  >
                    {span.name}
                  </div>

                  {/* Bar */}
                  <div className="relative h-4 min-w-0 flex-1">
                    <div
                      className="absolute top-0.5 flex h-3 min-w-[2px] items-center overflow-hidden rounded-[2px] px-1 text-[9px] font-medium tabular-nums drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        opacity: 0.92,
                        color: "#09090b",
                      }}
                      title={
                        tokens != null || cost != null
                          ? [
                              tokens != null ? `${tokens} tok` : null,
                              cost != null ? `$${cost.toFixed(4)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : undefined
                      }
                    >
                      {showInline && (tokens != null || cost != null) && (
                        <span className="truncate">
                          {tokens != null && (
                            <span>{tokens.toLocaleString()} tok</span>
                          )}
                          {tokens != null && cost != null && (
                            <span className="mx-0.5 opacity-70">·</span>
                          )}
                          {cost != null && <span>${cost.toFixed(4)}</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="w-[52px] shrink-0 text-right text-[10px] text-text-secondary tabular-nums">
                    {fmtDuration(dur)}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Legend */}
      <div className="shrink-0 border-t border-border-subtle px-3 py-1.5">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {LEGEND_ORDER.map((type) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 text-[10px] text-text-tertiary"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: SPAN_COLORS[type] }}
              />
              {type}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
