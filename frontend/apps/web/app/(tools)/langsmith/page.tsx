"use client"

import { useEffect, useState } from "react"
import { useFetch } from "@/lib/use-fetch"
import { api } from "@/lib/api"
import { cn } from "@workspace/ui/lib/utils"

interface RunSummary {
  id: string
  name: string
  run_type: string
  duration_s: number
  tokens: number
  cost: number | null
  status: string
  has_error?: boolean
  start_time_ms: number
  parent_run_id: string | null
}

interface RunDetail {
  id: string
  name: string
  run_type: string
  duration_ms: number
  duration_s: number
  tokens: number
  cost: number | null
  status: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  error?: string
  spans: RunSpan[]
  span_count: number
}

interface RunSpan {
  id: string
  name: string
  run_type: string
  start_time_ms: number
  duration_ms: number
  duration_s: number
  tokens: number
  cost: number | null
  status: string
  has_error?: boolean
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  error?: string
  parent_run_id: string | null
}

interface RunsResponse {
  runs: RunSummary[]
  source: string
  summary: { count: number; total_cost: number }
}

interface Session {
  id: string
  name: string
  description: string | null
  created_at_ms: number
  run_count: number | null
}

interface SessionsResponse {
  sessions: Session[]
  source: string
}

interface FeedbackItem {
  id: string
  run_id: string | null
  key: string
  score: number | null
  value: unknown
  comment: string | null
  created_at_ms: number
}

interface FeedbackResponse {
  feedback: FeedbackItem[]
  source: string
}

interface StatusResponse {
  mode: string
  api_reachable: boolean
  api_key_set: boolean
  local_fallback_available: boolean
  local_file_count: number
}

const PAGE_TABS = ["Runs", "Sessions", "Feedback"] as const
type PageTab = (typeof PAGE_TABS)[number]

function StatusDot({ status }: { status: string }) {
  const color =
    status === "error"
      ? "var(--color-red)"
      : status === "success"
        ? "var(--color-cyan)"
        : "var(--color-blue)"
  return (
    <div
      className="h-[6px] w-[6px] shrink-0 rounded-full"
      style={{
        background: color,
        animation: status === "pending" ? "pulse-dot 2s ease infinite" : undefined,
      }}
    />
  )
}

function RunList({
  runs,
  selectedId,
  onSelect,
  loading,
  source,
}: {
  runs: RunSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  source?: string
}) {
  const rootRuns = runs.filter((r) => !r.parent_run_id)
  return (
    <div className="flex flex-col overflow-auto">
      {source && (
        <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--text-dim)" }}>
            source: {source}
          </span>
        </div>
      )}
      {loading && rootRuns.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Loading...
          </span>
        </div>
      )}
      {rootRuns.map((run) => {
        const active = run.id === selectedId
        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            className="flex flex-col gap-1 border-b px-3 py-2.5 text-left transition-colors"
            style={{
              borderColor: "var(--border-subtle)",
              background: active ? "var(--active)" : undefined,
            }}
          >
            <div className="flex items-center gap-2">
              <StatusDot status={run.status} />
              <span className="truncate font-sans text-[12px] font-medium text-foreground">
                {run.name}
              </span>
            </div>
            <div className="flex items-center gap-3 pl-[14px]">
              <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {run.run_type}
              </span>
              <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {run.duration_s}s
              </span>
              {run.tokens > 0 && (
                <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {run.tokens.toLocaleString()} tok
                </span>
              )}
              {run.cost != null && run.cost > 0 && (
                <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  ${run.cost.toFixed(4)}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SpanWaterfall({
  spans,
  totalDurationMs,
  selectedSpan,
  onSelectSpan,
  loading,
}: {
  spans: RunSpan[]
  totalDurationMs: number
  selectedSpan: RunSpan | null
  onSelectSpan: (span: RunSpan) => void
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Loading spans...
        </span>
      </div>
    )
  }

  if (spans.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Select a run to view spans
        </span>
      </div>
    )
  }

  const minStart = Math.min(...spans.map((s) => s.start_time_ms))
  const maxDuration = totalDurationMs || 1

  return (
    <div className="flex flex-col overflow-auto p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
          Span waterfall
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
          {spans.length} spans · {(totalDurationMs / 1000).toFixed(2)}s total
        </span>
      </div>
      {spans.map((span) => {
        const offset = ((span.start_time_ms - minStart) / maxDuration) * 100
        const width = Math.max(((span.duration_ms || 1) / maxDuration) * 100, 0.5)
        const active = selectedSpan?.id === span.id
        const barColor =
          span.has_error
            ? "var(--color-red)"
            : span.run_type === "llm"
              ? "var(--color-purple)"
              : span.run_type === "tool"
                ? "var(--color-blue)"
                : span.run_type === "retriever"
                  ? "var(--color-cyan)"
                  : "var(--text-tertiary)"

        return (
          <button
            key={span.id}
            type="button"
            onClick={() => onSelectSpan(span)}
            className="mb-1 flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors"
            style={{ background: active ? "var(--active)" : undefined }}
          >
            <span
              className="w-[120px] shrink-0 truncate font-mono text-[10px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {span.name}
            </span>
            <div className="relative h-[14px] flex-1 rounded" style={{ background: "var(--elevated)" }}>
              <div
                className="absolute top-0 h-full rounded"
                style={{
                  left: `${offset}%`,
                  width: `${width}%`,
                  background: barColor,
                  opacity: 0.8,
                }}
              />
            </div>
            <span className="w-[50px] shrink-0 text-right font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>
              {span.duration_s}s
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SpanDetailPanel({ span }: { span: RunSpan | null }) {
  if (!span) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Select a span
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-auto p-3">
      <div className="mb-3">
        <h3 className="font-sans text-[13px] font-semibold text-foreground">{span.name}</h3>
        <div className="mt-1 flex items-center gap-2">
          <StatusDot status={span.status} />
          <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            {span.run_type}
          </span>
          <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            {span.duration_s}s
          </span>
        </div>
      </div>

      {span.tokens > 0 && (
        <div className="mb-3 rounded-md p-2.5" style={{ background: "var(--elevated)" }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--text-dim)" }}>
            Tokens
          </span>
          <p className="mt-1 font-mono text-[12px] font-medium text-foreground">
            {span.tokens.toLocaleString()}
          </p>
        </div>
      )}

      {span.cost != null && span.cost > 0 && (
        <div className="mb-3 rounded-md p-2.5" style={{ background: "var(--elevated)" }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--text-dim)" }}>
            Cost
          </span>
          <p className="mt-1 font-mono text-[12px] font-medium text-foreground">
            ${span.cost.toFixed(6)}
          </p>
        </div>
      )}

      {span.error && (
        <div className="mb-3 rounded-md border p-2.5" style={{ borderColor: "var(--color-red)", background: "rgba(239,68,68,0.08)" }}>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--color-red)" }}>
            Error
          </span>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px]" style={{ color: "var(--color-red)" }}>
            {span.error}
          </pre>
        </div>
      )}

      {span.inputs && Object.keys(span.inputs).length > 0 && (
        <div className="mb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--text-dim)" }}>
            Inputs
          </span>
          <pre
            className="mt-1 max-h-[200px] overflow-auto rounded-md p-2 font-mono text-[10px]"
            style={{ background: "var(--elevated)", color: "var(--text-secondary)" }}
          >
            {JSON.stringify(span.inputs, null, 2)}
          </pre>
        </div>
      )}

      {span.outputs && Object.keys(span.outputs).length > 0 && (
        <div className="mb-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--text-dim)" }}>
            Outputs
          </span>
          <pre
            className="mt-1 max-h-[200px] overflow-auto rounded-md p-2 font-mono text-[10px]"
            style={{ background: "var(--elevated)", color: "var(--text-secondary)" }}
          >
            {JSON.stringify(span.outputs, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function SessionsPanel() {
  const { data, loading } = useFetch<SessionsResponse>("/langsmith/sessions")
  const sessions = data?.sessions ?? []

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>Loading sessions...</span>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>No sessions found</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-auto p-3">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="mb-1 flex items-center justify-between rounded-md px-3 py-2.5"
          style={{ background: "var(--elevated)" }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[12px] font-medium text-foreground">{s.name}</span>
            {s.description && (
              <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {s.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {s.run_count != null && (
              <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {s.run_count} runs
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function FeedbackPanel() {
  const { data, loading } = useFetch<FeedbackResponse>("/langsmith/feedback")
  const feedback = data?.feedback ?? []

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>Loading feedback...</span>
      </div>
    )
  }

  if (feedback.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>No feedback yet</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-auto p-3">
      {feedback.map((fb) => (
        <div
          key={fb.id}
          className="mb-1 flex items-center justify-between rounded-md px-3 py-2.5"
          style={{ background: "var(--elevated)" }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[12px] font-medium text-foreground">{fb.key}</span>
            {fb.comment && (
              <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {fb.comment}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {fb.score != null && (
              <span className="font-mono text-[11px] font-semibold" style={{ color: fb.score >= 0.7 ? "var(--color-cyan)" : fb.score >= 0.4 ? "var(--color-amber)" : "var(--color-red)" }}>
                {fb.score.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LangSmithPage() {
  const [activeTab, setActiveTab] = useState<PageTab>("Runs")
  const { data, loading } = useFetch<RunsResponse>("/langsmith")
  const { data: statusData } = useFetch<StatusResponse>("/langsmith/status")
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedSpan, setSelectedSpan] = useState<RunSpan | null>(null)

  useEffect(() => {
    setSelectedSpan(null)
  }, [selectedRunId])

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null)
      return
    }
    setDetailLoading(true)
    api<RunDetail>(`/langsmith/${selectedRunId}`)
      .then(setRunDetail)
      .catch(() => setRunDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedRunId])

  const runs = data?.runs ?? []
  const summary = data?.summary
  const source = data?.source
  const hasRuns = runs.length > 0 || loading
  const mode = statusData?.mode ?? "unknown"

  return (
    <div className="flex h-[calc(100vh-52px-28px)] min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border-subtle px-4">
        <div className="flex items-end justify-between">
          <nav className="flex gap-0" aria-label="LangSmith views">
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
          <div className="flex items-center gap-3 pb-2">
            <div className="flex items-center gap-1.5">
              <div
                className="h-[5px] w-[5px] rounded-full"
                style={{
                  background: mode === "api" ? "var(--color-cyan)" : mode === "local" ? "var(--color-amber)" : "var(--color-red)",
                }}
              />
              <span className="font-mono text-[9px] uppercase" style={{ color: "var(--text-dim)" }}>
                {mode}
              </span>
            </div>
            <p className="font-mono text-[10px] text-text-tertiary">
              LangSmith API · ~/.dgx-lab/langsmith-traces/
            </p>
          </div>
        </div>
      </header>

      {activeTab === "Sessions" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SessionsPanel />
        </div>
      )}

      {activeTab === "Feedback" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <FeedbackPanel />
        </div>
      )}

      {activeTab === "Runs" && (
        <>
          {!hasRuns && !loading ? (
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
              <p className="text-[13px] font-medium text-text-secondary">No LangSmith runs yet</p>
              <p className="text-xs">
                Set{" "}
                <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                  LANGSMITH_API_KEY
                </code>{" "}
                or export traces to{" "}
                <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
                  ~/.dgx-lab/langsmith-traces/
                </code>
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 gap-0">
              <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface">
                <RunList
                  runs={runs}
                  selectedId={selectedRunId}
                  onSelect={setSelectedRunId}
                  loading={loading}
                  source={source}
                />
              </div>

              <div className="min-w-0 flex-1 overflow-hidden bg-background">
                <SpanWaterfall
                  spans={runDetail?.spans ?? []}
                  totalDurationMs={runDetail?.duration_ms ?? 0}
                  selectedSpan={selectedSpan}
                  onSelectSpan={setSelectedSpan}
                  loading={detailLoading}
                />
              </div>

              <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-surface">
                <SpanDetailPanel span={selectedSpan} />
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  )
}
