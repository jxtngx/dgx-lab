"use client"

import { useEffect, useState } from "react"
import { useFetch } from "@/lib/use-fetch"
import { api } from "@/lib/api"
import { TraceList } from "@/components/traces/trace-list"
import { Waterfall } from "@/components/traces/waterfall"
import { SpanDetail } from "@/components/traces/span-detail"
import { SessionsPanel } from "@/components/traces/sessions-panel"
import { EvalsPanel } from "@/components/traces/evals-panel"
import { CostsPanel } from "@/components/traces/costs-panel"
import { cn } from "@workspace/ui/lib/utils"

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

interface TracesResponse {
  traces: TraceSummary[]
  summary: { count: number; total_cost: number }
}

const PAGE_TABS = ["Traces", "Sessions", "Evals", "Costs"] as const
type PageTab = (typeof PAGE_TABS)[number]

export default function TracesPage() {
  const [activeTab, setActiveTab] = useState<PageTab>("Traces")
  const { data, loading } = useFetch<TracesResponse>("/traces")
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null)

  useEffect(() => {
    setSelectedSpan(null)
  }, [selectedTraceId])

  useEffect(() => {
    if (!selectedTraceId) {
      setTraceDetail(null)
      return
    }
    setDetailLoading(true)
    api<TraceDetail>(`/traces/${selectedTraceId}`)
      .then(setTraceDetail)
      .catch(() => setTraceDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedTraceId])

  const traces = data?.traces ?? []
  const summary = data?.summary
  const hasTraces = traces.length > 0 || loading

  return (
    <div className="flex h-[calc(100vh-52px-28px)] min-h-0 flex-col bg-background">
      {/* Page header with tabs */}
      <header className="shrink-0 border-b border-border-subtle px-4">
        <div className="flex items-end justify-between">
          <nav className="flex gap-0" aria-label="Trace views">
            {PAGE_TABS.map((label) => {
              const isActive = activeTab === label
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveTab(label)}
                  className={cn(
                    "relative px-3 py-2.5 font-sans text-[11.5px] font-medium tracking-wide transition-colors",
                    isActive
                      ? "text-cyan"
                      : "text-text-tertiary hover:text-text-secondary",
                  )}
                >
                  {label}
                  {isActive && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-[2px] rounded-t-full"
                      style={{ backgroundColor: "var(--color-cyan)" }}
                    />
                  )}
                </button>
              )
            })}
          </nav>
          <div className="pb-2">
            <p className="font-mono text-[10px] text-text-tertiary">
              OTel → JSONL · ~/.dgx-lab/traces/
            </p>
          </div>
        </div>
      </header>

      {/* Tab content */}
      {activeTab === "Sessions" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SessionsPanel />
        </div>
      )}

      {activeTab === "Evals" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EvalsPanel />
        </div>
      )}

      {activeTab === "Costs" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CostsPanel />
        </div>
      )}

      {activeTab === "Traces" && (
        <>
          {/* Empty state */}
          {!hasTraces && !loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: "var(--elevated)" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-text-tertiary"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-text-secondary">
                No traces yet
              </p>
              <p className="text-xs">
                Write JSONL trace files to{" "}
                <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                  ~/.dgx-lab/traces/
                </code>
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 gap-0">
              {/* Left: Trace list */}
              <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface">
                <TraceList
                  traces={traces}
                  selectedId={selectedTraceId}
                  onSelect={setSelectedTraceId}
                  summary={summary}
                  loading={loading}
                />
              </div>

              {/* Center: Waterfall */}
              <div className="min-w-0 flex-1 overflow-hidden bg-background">
                <Waterfall
                  trace={traceDetail}
                  spans={traceDetail?.spans ?? []}
                  totalDurationMs={traceDetail?.duration_ms ?? 0}
                  selectedSpan={selectedSpan}
                  onSelectSpan={setSelectedSpan}
                  loading={detailLoading}
                />
              </div>

              {/* Right: Span detail */}
              <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-surface">
                <SpanDetail span={selectedSpan} />
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  )
}
