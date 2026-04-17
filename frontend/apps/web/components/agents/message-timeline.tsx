"use client"

import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

const TOOL_COLORS: Record<string, string> = {
  Read: "#60a5fa",
  Grep: "#60a5fa",
  Glob: "#60a5fa",
  Shell: "#60a5fa",
  Write: "#f59e0b",
  StrReplace: "#f59e0b",
  Delete: "#f59e0b",
  Task: "#a78bfa",
  WebFetch: "#2dd4bf",
  WebSearch: "#2dd4bf",
  CreatePlan: "#22d3ee",
  TodoWrite: "#22d3ee",
}

interface Turn {
  index: number
  role: string
  text: string
  tool_calls: { name: string; input: Record<string, unknown> }[]
  timestamp_approx?: number
}

interface SubagentSummary {
  id: string
  title: string
  message_count: number
  size_bytes: number
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: string | number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-hover"
      >
        <span className="font-mono text-[9px] text-text-tertiary">{open ? "▾" : "▸"}</span>
        <span className="font-mono text-[10px] font-medium text-text-secondary">{title}</span>
        {badge !== undefined && (
          <span className="ml-auto font-mono text-[10px] text-text-tertiary">{badge}</span>
        )}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  )
}

export function MessageTimeline({
  turns,
  selectedTurn,
  onSelectTurn,
  conversationTitle,
  loading,
  toolFrequency,
  toolColorFn,
  totalToolCalls,
  subagents,
  selectedSubagentId,
  onSelectSubagent,
  modelLabel,
  modelColor,
  modeLabel,
}: {
  turns: Turn[]
  selectedTurn: Turn | null
  onSelectTurn: (turn: Turn) => void
  conversationTitle?: string
  loading?: boolean
  toolFrequency?: [string, number][]
  toolColorFn?: (name: string) => string
  totalToolCalls?: number
  subagents?: SubagentSummary[]
  selectedSubagentId?: string | null
  onSelectSubagent?: (id: string) => void
  modelLabel?: string | null
  modelColor?: string
  modeLabel?: string | null
}) {
  const getToolColor = toolColorFn ?? ((name: string) => TOOL_COLORS[name] ?? "#8b8993")

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-tertiary">
        Loading conversation…
      </div>
    )
  }

  if (turns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-tertiary">
        Select a conversation to view its timeline
      </div>
    )
  }

  const toolCallCount = turns.reduce((s, t) => s + t.tool_calls.length, 0)
  const freq = toolFrequency ?? []
  const subs = subagents ?? []

  return (
    <div className="flex h-full min-h-0 flex-col font-mono">
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        {conversationTitle && (
          <div className="truncate text-[12px] font-semibold text-foreground">
            {conversationTitle}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-px text-[10px]">
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Turns </span>
            {turns.length}
          </span>
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Tool calls </span>
            {toolCallCount}
          </span>
          {subs.length > 0 && (
            <span className="text-text-secondary">
              <span className="text-text-tertiary">Subagents </span>
              {subs.length}
            </span>
          )}
          {modelLabel && (
            <span
              className="rounded px-1.5 py-0.5 text-[9.5px]"
              style={{
                backgroundColor: `${modelColor ?? "#8b8993"}22`,
                color: modelColor ?? "#8b8993",
              }}
              title={modelLabel}
            >
              {modelLabel}
              {modeLabel ? ` · ${modeLabel}` : ""}
            </span>
          )}
        </div>
      </div>

      {freq.length > 0 && (
        <CollapsibleSection title="Tool Usage" badge={`${totalToolCalls ?? toolCallCount} calls`}>
          <div className="space-y-0.5">
            {freq.map(([name, count]) => {
              const maxCount = freq[0]?.[1] ?? 1
              const pct = (count / (maxCount as number)) * 100
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-[10px] text-text-secondary">{name}</span>
                  <div className="relative h-3 min-w-0 flex-1">
                    <div
                      className="absolute top-0 h-3 rounded-[2px]"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: getToolColor(name),
                        opacity: 0.8,
                        minWidth: 2,
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[9px] text-text-tertiary">{count}</span>
                </div>
              )
            })}
          </div>
        </CollapsibleSection>
      )}

      {subs.length > 0 && (
        <CollapsibleSection title="Subagents" badge={subs.length}>
          <div className="space-y-1">
            {subs.map((sub) => {
              const isActive = selectedSubagentId === sub.id
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelectSubagent?.(sub.id)}
                  className={cn(
                    "w-full rounded border px-2.5 py-1.5 text-left transition-colors",
                    isActive
                      ? "border-[#a78bfa]/40 bg-[rgba(168,139,250,0.08)]"
                      : "border-border-subtle bg-elevated hover:bg-hover",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[rgba(168,139,250,0.15)] px-1.5 py-0.5 text-[9px] font-medium text-[#a78bfa]">
                      sub
                    </span>
                    <span className="truncate text-[11px] font-semibold text-foreground">
                      {sub.title}
                    </span>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-[9px] text-text-tertiary">
                    <span>{sub.message_count} msgs</span>
                    <span className="truncate">{sub.id.slice(0, 12)}…</span>
                  </div>
                </button>
              )
            })}
          </div>
        </CollapsibleSection>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-3">
          {turns.map((turn) => {
            const isUser = turn.role === "user"
            const isSelected = selectedTurn?.index === turn.index
            const truncatedText = turn.text.length > 200 ? turn.text.slice(0, 200) + "…" : turn.text

            return (
              <button
                key={turn.index}
                type="button"
                onClick={() => onSelectTurn(turn)}
                className={cn(
                  "w-full rounded-md border-l-2 px-3 py-2 text-left transition-colors",
                  isUser ? "border-l-[#60a5fa]" : "border-l-[#22d3ee]",
                  isSelected ? "bg-active" : "hover:bg-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: isUser ? "rgba(96,165,250,0.15)" : "rgba(34,211,238,0.15)",
                      color: isUser ? "#60a5fa" : "#22d3ee",
                    }}
                  >
                    {turn.role}
                  </span>
                  <span className="text-[10px] text-text-tertiary">#{turn.index}</span>
                </div>

                {truncatedText && (
                  <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-text-secondary">
                    {truncatedText}
                  </p>
                )}

                {turn.tool_calls.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {turn.tool_calls.map((tc, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                        style={{
                          backgroundColor: `${getToolColor(tc.name)}22`,
                          color: getToolColor(tc.name),
                        }}
                      >
                        {tc.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border-subtle px-3 py-1.5">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(TOOL_COLORS)
            .filter(([name]) => turns.some((t) => t.tool_calls.some((tc) => tc.name === name)))
            .map(([name, color]) => (
              <span key={name} className="inline-flex items-center gap-1 text-[10px] text-text-tertiary">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
                {name}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
