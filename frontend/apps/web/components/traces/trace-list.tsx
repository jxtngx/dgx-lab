"use client"

import { useState, useMemo } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface TraceSummary {
  id: string
  name: string
  duration_s: number
  tokens: number
  cost: number | null
  span_count: number
  has_error?: boolean
  created_at?: string
  type?: string
}

type FilterTab = "all" | "agent" | "llm" | "tool" | "errors"

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agent" },
  { key: "llm", label: "LLM" },
  { key: "tool", label: "Tool" },
  { key: "errors", label: "Errors" },
]

function timeAgo(dateStr?: string): string {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function TraceList({
  traces,
  selectedId,
  onSelect,
  summary,
  loading,
}: {
  traces: TraceSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  summary?: { count: number; total_cost: number }
  loading?: boolean
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterTab>("all")

  const filtered = useMemo(() => {
    let result = traces
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (filter === "errors") {
      result = result.filter((t) => t.has_error)
    } else if (filter !== "all") {
      result = result.filter((t) => t.type?.toLowerCase() === filter)
    }
    return result
  }, [traces, search, filter])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <h2 className="text-[13px] font-semibold text-foreground">
          Traces{" "}
          <span className="font-normal text-text-tertiary">· Last 24h</span>
        </h2>
        <div className="relative mt-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search traces…"
            className="h-7 w-full rounded-md border border-border-subtle bg-elevated px-2.5 pr-12 font-sans text-xs text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-cyan/40"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex shrink-0 gap-1 px-3 pb-2">
        {FILTERS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[10px] transition-colors",
              filter === tab.key
                ? "bg-cyan-dim text-cyan"
                : "text-text-tertiary hover:bg-elevated hover:text-text-secondary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Trace items */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          {loading ? (
            <div className="py-20 text-center text-xs text-text-tertiary">
              Scanning traces…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-xs text-text-tertiary">
              <p>No traces found.</p>
              <p>
                Write JSONL trace files to{" "}
                <code className="rounded bg-elevated px-1 font-mono">
                  ~/.dgx-lab/traces/
                </code>
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                    selectedId === t.id
                      ? "border-cyan/20 bg-cyan-dim"
                      : "border-transparent hover:bg-elevated/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {t.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
                      {timeAgo(t.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-text-tertiary">
                    <span>{t.duration_s}s</span>
                    <span>{t.tokens.toLocaleString()} tok</span>
                    {t.has_error ? (
                      <span className="rounded bg-red-dim px-1.5 py-0.5 text-red">
                        err
                      </span>
                    ) : (
                      <span>
                        {t.cost != null ? `$${t.cost.toFixed(4)}` : "—"}
                      </span>
                    )}
                    <span>{t.span_count} spans</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Summary footer */}
      {summary && (
        <div className="shrink-0 border-t border-border-subtle px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[10px] text-text-tertiary">
            <span>{summary.count} traces · 24h</span>
            <span>${summary.total_cost.toFixed(2)} total</span>
          </div>
        </div>
      )}
    </div>
  )
}
