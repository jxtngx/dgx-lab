"use client"

import { useMemo } from "react"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import type { ProjectSummary } from "@/components/agents/project-selector"

interface StatsResponse {
  total_conversations: number
  total_messages: number
  total_tool_calls: number
  tool_frequency: Record<string, number>
}

export interface ChatAgentMeta {
  agent_id: string
  name: string | null
  mode: string | null
  last_used_model: string | null
  created_at: number | null
  current_plan_uri: string | null
  message_models?: Record<string, number>
  message_count?: number
  primary_model?: string | null
}

export interface ModelUsageResponse {
  scope: "project" | "conversation" | "global"
  workspace_hash: string | null
  agents: ChatAgentMeta[]
  agent_match: ChatAgentMeta | null
  by_model: Record<string, { hashes: number; files: number; deletions: number }>
  by_model_messages?: Record<string, number>
  total_messages?: number
  totals: { hashes: number; files: number; deletions: number }
  available: boolean
}

interface ProjectOverviewProps {
  project: ProjectSummary | null
  stats: StatsResponse | null
  modelUsage: ModelUsageResponse | null
  toolColorFn: (name: string) => string
  loading?: boolean
}

const MODEL_COLORS: Record<string, string> = {
  default: "#8b8993",
  "claude-4.6-opus-max-thinking": "#a78bfa",
  "claude-4.6-opus": "#a78bfa",
  "claude-4-opus": "#a78bfa",
  "claude-3.5-sonnet": "#22d3ee",
  "claude-sonnet": "#22d3ee",
  "gpt-5": "#10b981",
  "gpt-4o": "#10b981",
  "gpt-4": "#10b981",
  "composer-2": "#f59e0b",
  "composer-1": "#f59e0b",
}

function modelColor(name: string): string {
  if (MODEL_COLORS[name]) return MODEL_COLORS[name]
  if (name.includes("claude")) return "#a78bfa"
  if (name.includes("gpt")) return "#10b981"
  if (name.includes("composer")) return "#f59e0b"
  return "#8b8993"
}

// Render the model identifier exactly as Cursor stores it -- no mapping, no
// prettification, no fabricated display names.
export function displayModelName(name: string): string {
  return name
}

function formatTimestamp(ms: number | null): string {
  if (!ms) return "—"
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function shortPath(displayPath: string): string {
  const parts = displayPath.split("/").filter(Boolean)
  if (parts.length <= 3) return displayPath
  return ".../" + parts.slice(-3).join("/")
}

export function ProjectOverview({
  project,
  stats,
  modelUsage,
  toolColorFn,
  loading,
}: ProjectOverviewProps) {
  const freq = useMemo(() => {
    if (!stats) return [] as [string, number][]
    return Object.entries(stats.tool_frequency).sort(([, a], [, b]) => b - a)
  }, [stats])

  const modelEntries = useMemo(() => {
    if (!modelUsage) return [] as [string, { hashes: number; files: number; deletions: number }][]
    return Object.entries(modelUsage.by_model).sort(
      ([, a], [, b]) => b.hashes - a.hashes,
    )
  }, [modelUsage])
  const maxModelHashes = modelEntries[0]?.[1].hashes ?? 1

  const messageModelEntries = useMemo(() => {
    if (!modelUsage?.by_model_messages) return [] as [string, number][]
    return Object.entries(modelUsage.by_model_messages).sort(([, a], [, b]) => b - a)
  }, [modelUsage])
  const maxMessageModelCount = messageModelEntries[0]?.[1] ?? 1
  const totalMessageModelCount = useMemo(
    () => messageModelEntries.reduce((sum, [, n]) => sum + n, 0),
    [messageModelEntries],
  )

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-tertiary">
        {loading ? "Loading project…" : "Select a project to get started"}
      </div>
    )
  }

  const hasData = stats && stats.total_conversations > 0
  const maxCount = freq[0]?.[1] ?? 1

  return (
    <div className="flex h-full min-h-0 flex-col font-mono">
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-[12px] font-semibold text-foreground"
            title={project.display_path}
          >
            {shortPath(project.display_path)}
          </span>
          {project.is_default && (
            <span
              className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider"
              style={{
                background: "var(--color-cyan-dim)",
                color: "var(--color-cyan)",
              }}
            >
              current
            </span>
          )}
        </div>
        <div className="mt-1 text-[10px] text-text-tertiary">Project overview</div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <div className="grid grid-cols-3 gap-2">
            {([
              ["Conversations", stats?.total_conversations ?? 0],
              ["Messages", stats?.total_messages ?? 0],
              ["Tool Calls", stats?.total_tool_calls ?? 0],
            ] as const).map(([label, value]) => (
              <div
                key={label}
                className="rounded px-3 py-2"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div className="text-[9px] uppercase tracking-wider text-text-tertiary">
                  {label}
                </div>
                <div className="mt-1 text-[16px] font-semibold text-foreground">
                  {value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {freq.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-text-secondary">
                  Tool Usage
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {stats?.total_tool_calls.toLocaleString() ?? 0} calls
                </span>
              </div>
              <div
                className="space-y-0.5 rounded p-2"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {freq.map(([name, count]) => {
                  const pct = (count / (maxCount as number)) * 100
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-[10px] text-text-secondary">
                        {name}
                      </span>
                      <div className="relative h-3 min-w-0 flex-1">
                        <div
                          className="absolute top-0 h-3 rounded-[2px]"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: toolColorFn(name),
                            opacity: 0.8,
                            minWidth: 2,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[10px] text-text-tertiary">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {modelUsage?.available && messageModelEntries.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-text-secondary">
                  Messages by Model
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {totalMessageModelCount.toLocaleString()} messages
                </span>
              </div>
              <div
                className="space-y-1 rounded p-2"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {messageModelEntries.map(([name, count]) => {
                  const pct = (count / maxMessageModelCount) * 100
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span
                        className="w-40 shrink-0 truncate text-[10px]"
                        style={{ color: modelColor(name) }}
                        title={name}
                      >
                        {displayModelName(name)}
                      </span>
                      <div className="relative h-3 min-w-0 flex-1">
                        <div
                          className="absolute top-0 h-3 rounded-[2px]"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: modelColor(name),
                            opacity: 0.8,
                            minWidth: 2,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[10px] text-text-tertiary">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {modelUsage?.available && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-text-secondary">
                  Code Generation by Model
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {(modelUsage.totals?.hashes ?? 0).toLocaleString()} hashes ·{" "}
                  {(modelUsage.totals?.files ?? 0).toLocaleString()} files
                </span>
              </div>

              {modelEntries.length > 0 ? (
                <div
                  className="space-y-1 rounded p-2"
                  style={{
                    background: "var(--elevated)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {modelEntries.map(([name, slot]) => {
                    const pct = (slot.hashes / maxModelHashes) * 100
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span
                          className="w-32 shrink-0 truncate text-[10px]"
                          style={{ color: modelColor(name) }}
                          title={name}
                        >
                          {displayModelName(name)}
                        </span>
                        <div className="relative h-3 min-w-0 flex-1">
                          <div
                            className="absolute top-0 h-3 rounded-[2px]"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: modelColor(name),
                              opacity: 0.8,
                              minWidth: 2,
                            }}
                          />
                        </div>
                        <span
                          className="w-14 shrink-0 text-right text-[10px] text-text-tertiary"
                          title={`${slot.files} files, ${slot.deletions} deletions`}
                        >
                          {slot.hashes.toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div
                  className="rounded p-3 text-center text-[10px] text-text-tertiary"
                  style={{
                    background: "var(--elevated)",
                    border: "1px dashed var(--border-subtle)",
                  }}
                >
                  No tracked model usage for this workspace yet.
                </div>
              )}

              {modelUsage.agents.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] font-medium text-text-secondary">
                    Cursor Agents in this workspace
                  </div>
                  <div className="space-y-1">
                    {modelUsage.agents.map((a) => {
                      const agentModels = Object.entries(a.message_models ?? {}).sort(
                        ([, x], [, y]) => y - x,
                      )
                      return (
                        <div
                          key={a.agent_id}
                          className="rounded px-2.5 py-1.5"
                          style={{
                            background: "var(--elevated)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[11px] text-foreground">
                              {a.name ?? "Untitled"}
                            </span>
                            {a.mode && (
                              <span
                                className="shrink-0 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider text-text-tertiary"
                                style={{ background: "var(--surface)" }}
                              >
                                {a.mode}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[9.5px]">
                            <span className="text-text-tertiary">
                              {formatTimestamp(a.created_at)}
                            </span>
                            {a.message_count !== undefined && a.message_count > 0 && (
                              <span className="text-text-tertiary">
                                {a.message_count} msgs
                              </span>
                            )}
                            <span className="ml-auto truncate text-text-tertiary">
                              {a.agent_id.slice(0, 8)}…
                            </span>
                          </div>
                          {agentModels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {agentModels.map(([name, count]) => (
                                <span
                                  key={name}
                                  className="rounded px-1.5 py-0.5 text-[9.5px]"
                                  style={{
                                    backgroundColor: `${modelColor(name)}22`,
                                    color: modelColor(name),
                                  }}
                                  title={name}
                                >
                                  {displayModelName(name)} · {count}
                                </span>
                              ))}
                            </div>
                          )}
                          {agentModels.length === 0 && a.last_used_model && (
                            <div className="mt-0.5 text-[9.5px]"
                              style={{ color: modelColor(a.last_used_model) }}>
                              last: {displayModelName(a.last_used_model)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {!hasData && !loading && (
            <div className="rounded p-4 text-center text-[11px] text-text-tertiary"
              style={{
                background: "var(--elevated)",
                border: "1px dashed var(--border-subtle)",
              }}
            >
              No conversations in this project yet.
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border-subtle px-3 py-2">
        <div className="text-[10px] text-text-tertiary">
          Select a conversation from the left to view its timeline.
        </div>
      </div>
    </div>
  )
}
