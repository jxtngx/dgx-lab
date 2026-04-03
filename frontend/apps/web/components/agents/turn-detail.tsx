"use client"

import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface Turn {
  index: number
  role: string
  text: string
  tool_calls: { name: string; input: Record<string, unknown> }[]
  timestamp_approx?: number
}

type DetailTab = "content" | "tools" | "raw"

const TABS: { key: DetailTab; label: string }[] = [
  { key: "content", label: "Content" },
  { key: "tools", label: "Tool Calls" },
  { key: "raw", label: "Raw" },
]

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 py-1.5 font-mono text-[10px] font-medium text-text-secondary transition-colors hover:text-foreground"
      >
        <span className="text-text-tertiary">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

export function TurnDetail({
  turn,
  subagentTurns,
  subagentTitle,
  subagentLoading,
  onBackFromSubagent,
}: {
  turn: Turn | null
  subagentTurns?: Turn[] | null
  subagentTitle?: string
  subagentLoading?: boolean
  onBackFromSubagent?: () => void
}) {
  const [tab, setTab] = useState<DetailTab>("content")

  if (subagentLoading) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-text-tertiary">
        Loading subagent…
      </div>
    )
  }

  if (subagentTurns && subagentTurns.length > 0) {
    return <SubagentView turns={subagentTurns} title={subagentTitle} onBack={onBackFromSubagent} />
  }

  if (!turn) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Select a turn to view details
      </div>
    )
  }

  const isUser = turn.role === "user"

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
            style={{
              backgroundColor: isUser ? "rgba(96,165,250,0.15)" : "rgba(34,211,238,0.15)",
              color: isUser ? "#60a5fa" : "#22d3ee",
            }}
          >
            {turn.role}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            Turn #{turn.index}
          </span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-text-tertiary">
          {turn.tool_calls.length} tool call{turn.tool_calls.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-border-subtle px-3 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[10px] transition-colors",
              tab === t.key
                ? "bg-cyan-dim text-cyan"
                : "text-text-tertiary hover:bg-elevated hover:text-text-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-3">
          {tab === "content" && (
            <div className="space-y-1">
              <Section title="Message">
                {turn.text ? (
                  <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary">
                    {turn.text}
                  </pre>
                ) : (
                  <p className="text-xs text-text-tertiary">No text content</p>
                )}
              </Section>
            </div>
          )}

          {tab === "tools" && (
            <div className="space-y-2">
              {turn.tool_calls.length === 0 ? (
                <p className="text-xs text-text-tertiary">No tool calls in this turn</p>
              ) : (
                turn.tool_calls.map((tc, i) => (
                  <Section key={i} title={tc.name} defaultOpen={i === 0}>
                    <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[10px] leading-relaxed text-text-secondary">
                      {JSON.stringify(tc.input, null, 2)}
                    </pre>
                  </Section>
                ))
              )}
            </div>
          )}

          {tab === "raw" && (
            <div>
              <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[10px] leading-relaxed text-text-secondary">
                {JSON.stringify(turn, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SubagentView({
  turns,
  title,
  onBack,
}: {
  turns: Turn[]
  title?: string
  onBack?: () => void
}) {
  const toolCallCount = turns.reduce((s, t) => s + t.tool_calls.length, 0)
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary transition-colors hover:bg-elevated hover:text-text-secondary"
            >
              ← back
            </button>
          )}
          <span className="shrink-0 rounded bg-[rgba(168,139,250,0.15)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#a78bfa]">
            subagent
          </span>
        </div>
        {title && (
          <p className="mt-1.5 truncate text-[12px] font-semibold text-foreground">{title}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-px font-mono text-[10px]">
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Turns </span>
            {turns.length}
          </span>
          <span className="text-text-secondary">
            <span className="text-text-tertiary">Tool calls </span>
            {toolCallCount}
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-3">
          {turns.map((turn) => {
            const isUser = turn.role === "user"
            const isExpanded = expandedTurn === turn.index
            const truncatedText = turn.text.length > 200 && !isExpanded
              ? turn.text.slice(0, 200) + "…"
              : turn.text

            return (
              <button
                key={turn.index}
                type="button"
                onClick={() => setExpandedTurn(isExpanded ? null : turn.index)}
                className={cn(
                  "w-full rounded-md border-l-2 px-3 py-2 text-left transition-colors",
                  isUser ? "border-l-[#60a5fa]" : "border-l-[#a78bfa]",
                  isExpanded ? "bg-active" : "hover:bg-hover",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
                    style={{
                      backgroundColor: isUser ? "rgba(96,165,250,0.15)" : "rgba(168,139,250,0.15)",
                      color: isUser ? "#60a5fa" : "#a78bfa",
                    }}
                  >
                    {turn.role}
                  </span>
                  <span className="font-mono text-[10px] text-text-tertiary">#{turn.index}</span>
                </div>

                {truncatedText && (
                  <pre className={cn(
                    "mt-1.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-text-secondary",
                    !isExpanded && "line-clamp-3",
                  )}>
                    {truncatedText}
                  </pre>
                )}

                {turn.tool_calls.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {turn.tool_calls.map((tc, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[9px] font-medium"
                        style={{
                          backgroundColor: "rgba(168,139,250,0.12)",
                          color: "#a78bfa",
                        }}
                      >
                        {tc.name}
                      </span>
                    ))}
                  </div>
                )}

                {isExpanded && turn.tool_calls.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {turn.tool_calls.map((tc, i) => (
                      <div key={i} className="rounded bg-elevated p-2">
                        <p className="font-mono text-[10px] font-medium text-[#a78bfa]">{tc.name}</p>
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-text-tertiary">
                          {JSON.stringify(tc.input, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
