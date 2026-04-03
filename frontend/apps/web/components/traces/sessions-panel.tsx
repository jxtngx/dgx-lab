"use client"

import { useFetch } from "@/lib/use-fetch"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

interface Session {
  session_id: string
  name: string
  user?: string
  started_at_ms: number
  ended_at_ms: number
  trace_ids: string[]
  turns: number
  total_tokens: number
  total_cost: number
  model?: string
  status?: string
}

interface SessionsResponse {
  sessions: Session[]
  summary: { count: number; total_cost: number; total_tokens: number }
}

function formatDuration(startMs: number, endMs: number): string {
  const s = Math.round((endMs - startMs) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SessionsPanel() {
  const { data, loading } = useFetch<SessionsResponse>("/traces/sessions")
  const sessions = data?.sessions ?? []
  const summary = data?.summary

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
        Loading sessions…
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
        <p className="text-[13px] font-medium text-text-secondary">
          No sessions found
        </p>
        <p className="text-xs">
          Write session records to{" "}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
            ~/.dgx-lab/traces/*/sessions.jsonl
          </code>
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Summary strip */}
      {summary && (
        <div className="flex shrink-0 items-center gap-6 border-b border-border-subtle px-4 py-2.5">
          <div className="font-mono text-[11px]">
            <span className="text-text-tertiary">Sessions </span>
            <span className="font-semibold text-foreground">
              {summary.count}
            </span>
          </div>
          <div className="font-mono text-[11px]">
            <span className="text-text-tertiary">Tokens </span>
            <span className="font-semibold text-foreground">
              {summary.total_tokens.toLocaleString()}
            </span>
          </div>
          <div className="font-mono text-[11px]">
            <span className="text-text-tertiary">Cost </span>
            <span className="font-semibold text-cyan">
              ${summary.total_cost.toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Session list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-px p-2">
          {sessions.map((s) => {
            const statusColor =
              s.status === "error"
                ? "var(--color-red)"
                : s.status === "completed"
                  ? "var(--color-cyan)"
                  : "var(--color-amber)"
            return (
              <div
                key={s.session_id}
                className="rounded-lg border border-border-subtle bg-surface px-3.5 py-3 transition-colors hover:bg-elevated"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <div
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: statusColor }}
                    />
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {s.name}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
                    {formatTime(s.started_at_ms)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-text-tertiary">
                  {s.user && (
                    <span>
                      <span className="text-text-dim">user</span>{" "}
                      <span className="text-text-secondary">{s.user}</span>
                    </span>
                  )}
                  <span>
                    <span className="text-text-dim">turns</span>{" "}
                    <span className="text-text-secondary">{s.turns}</span>
                  </span>
                  <span>
                    <span className="text-text-dim">traces</span>{" "}
                    <span className="text-text-secondary">
                      {s.trace_ids.length}
                    </span>
                  </span>
                  <span>
                    <span className="text-text-dim">dur</span>{" "}
                    <span className="text-text-secondary">
                      {formatDuration(s.started_at_ms, s.ended_at_ms)}
                    </span>
                  </span>
                  <span>
                    <span className="text-text-dim">tok</span>{" "}
                    <span className="text-text-secondary">
                      {s.total_tokens.toLocaleString()}
                    </span>
                  </span>
                  <span>
                    <span className="text-text-dim">cost</span>{" "}
                    <span className="text-cyan">
                      ${s.total_cost.toFixed(4)}
                    </span>
                  </span>
                </div>

                {s.model && (
                  <div className="mt-1.5">
                    <span
                      className="inline-block rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium"
                      style={{
                        background: "var(--color-blue-dim)",
                        color: "var(--color-blue)",
                      }}
                    >
                      {s.model}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
