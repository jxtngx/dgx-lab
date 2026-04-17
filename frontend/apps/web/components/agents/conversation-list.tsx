"use client"

import { useState, useMemo } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { ProjectSelector, type ProjectSummary } from "@/components/agents/project-selector"

interface ConversationSummary {
  id: string
  title: string
  message_count: number
  tool_call_count: number
  subagent_count: number
  size_bytes: number
  modified_at: number
}

function timeAgo(epoch: number): string {
  const diff = Date.now() - epoch * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
  onRefresh,
  projects,
  selectedProject,
  onSelectProject,
  projectsLoading,
  onClearSelection,
}: {
  conversations: ConversationSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  onRefresh?: () => void
  projects?: ProjectSummary[]
  selectedProject?: string | null
  onSelectProject?: (slug: string) => void
  projectsLoading?: boolean
  onClearSelection?: () => void
}) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search) return conversations
    const q = search.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, search])

  const showPicker = !!projects && projects.length > 0 && !!onSelectProject

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">
            Conversations{" "}
            <span className="font-normal text-text-tertiary">
              · {conversations.length}
            </span>
          </h2>
          {selectedId && onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-elevated"
              style={{
                color: "var(--text-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}
              title="Back to project overview"
              aria-label="Back to project overview"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        {showPicker && (
          <div className="mt-2">
            <ProjectSelector
              projects={projects ?? []}
              selectedSlug={selectedProject ?? null}
              onSelect={onSelectProject!}
              loading={projectsLoading}
            />
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="h-7 min-w-0 flex-1 rounded-md border border-border-subtle bg-elevated px-2.5 font-sans text-xs text-foreground placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-cyan/40"
          />
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-tertiary)",
              }}
              title="Refresh conversations"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          {loading ? (
            <div className="py-20 text-center text-xs text-text-tertiary">
              Scanning transcripts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-20 text-xs text-text-tertiary">
              {showPicker ? (
                <>
                  <p>No conversations in this project yet.</p>
                  <p>Pick another project from the selector above.</p>
                </>
              ) : (
                <>
                  <p>No conversations found.</p>
                  <p>
                    Cursor transcripts live in{" "}
                    <code className="rounded bg-elevated px-1 font-mono">
                      agent-transcripts/
                    </code>
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                    selectedId === c.id
                      ? "border-cyan/20 bg-cyan-dim"
                      : "border-transparent hover:bg-elevated/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-2 text-[12px] font-semibold text-foreground">
                      {c.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
                      {timeAgo(c.modified_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-text-tertiary">
                    <span>{c.message_count} msgs</span>
                    <span>{c.tool_call_count} tools</span>
                    {c.subagent_count > 0 && (
                      <span className="rounded bg-[rgba(168,139,250,0.15)] px-1.5 py-0.5 text-[#a78bfa]">
                        {c.subagent_count} sub
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border-subtle px-3 py-2">
        <div className="font-mono text-[10px] text-text-tertiary">
          {conversations.length} conversations
        </div>
      </div>
    </div>
  )
}
