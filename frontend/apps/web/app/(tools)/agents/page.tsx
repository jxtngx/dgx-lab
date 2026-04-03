"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { useFetch } from "@/lib/use-fetch"
import { api } from "@/lib/api"
import { ConversationList } from "@/components/agents/conversation-list"
import { MessageTimeline } from "@/components/agents/message-timeline"
import { TurnDetail } from "@/components/agents/turn-detail"

interface ConversationSummary {
  id: string
  title: string
  message_count: number
  tool_call_count: number
  subagent_count: number
  size_bytes: number
  modified_at: number
}

interface Turn {
  index: number
  role: string
  text: string
  tool_calls: { name: string; input: Record<string, unknown> }[]
  timestamp_approx?: number
}

interface ConversationsResponse {
  conversations: ConversationSummary[]
}

interface ConversationDetailResponse {
  conversation_id: string
  turns: Turn[]
}

interface StatsResponse {
  total_conversations: number
  total_messages: number
  total_tool_calls: number
  tool_frequency: Record<string, number>
}

interface SubagentSummary {
  id: string
  title: string
  message_count: number
  size_bytes: number
}

interface SubagentsResponse {
  subagents: SubagentSummary[]
}

interface SubagentDetailResponse {
  subagent_id: string
  turns: Turn[]
}

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

function toolColor(name: string): string {
  return TOOL_COLORS[name] ?? "#8b8993"
}

export default function AgentsPage() {
  const { data, loading, refetch } = useFetch<ConversationsResponse>("/agents/conversations")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedTurn, setSelectedTurn] = useState<Turn | null>(null)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [subagents, setSubagents] = useState<SubagentsResponse | null>(null)

  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null)
  const [subagentDetail, setSubagentDetail] = useState<SubagentDetailResponse | null>(null)
  const [subagentLoading, setSubagentLoading] = useState(false)

  useEffect(() => {
    setSelectedTurn(null)
    setSelectedSubagentId(null)
    setSubagentDetail(null)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setSubagents(null)
      return
    }
    setDetailLoading(true)
    api<ConversationDetailResponse>(`/agents/conversations/${selectedId}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))

    api<SubagentsResponse>(`/agents/conversations/${selectedId}/subagents`)
      .then(setSubagents)
      .catch(() => setSubagents(null))
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !selectedSubagentId) {
      setSubagentDetail(null)
      return
    }
    setSubagentLoading(true)
    api<SubagentDetailResponse>(
      `/agents/conversations/${selectedId}/subagents/${selectedSubagentId}`,
    )
      .then(setSubagentDetail)
      .catch(() => setSubagentDetail(null))
      .finally(() => setSubagentLoading(false))
  }, [selectedId, selectedSubagentId])

  useEffect(() => {
    api<StatsResponse>("/agents/stats")
      .then(setStats)
      .catch(() => {})
  }, [])

  const conversations = data?.conversations ?? []
  const turns = detail?.turns ?? []
  const hasConversations = conversations.length > 0 || loading
  const selectedConversation = conversations.find((c) => c.id === selectedId)
  const subList = subagents?.subagents ?? []

  const selectedSubagentTitle = subList.find((s) => s.id === selectedSubagentId)?.title

  const handleSelectSubagent = useCallback((id: string) => {
    setSelectedTurn(null)
    setSelectedSubagentId(id)
  }, [])

  const handleBackFromSubagent = useCallback(() => {
    setSelectedSubagentId(null)
    setSubagentDetail(null)
  }, [])

  const toolFrequencyForConversation = useMemo(() => {
    const counter: Record<string, number> = {}
    for (const turn of turns) {
      for (const tc of turn.tool_calls) {
        counter[tc.name] = (counter[tc.name] ?? 0) + 1
      }
    }
    return Object.entries(counter).sort(([, a], [, b]) => b - a)
  }, [turns])

  return (
    <div className="flex h-[calc(100vh-52px-28px)] min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2">
        <span className="font-sans text-[11.5px] font-medium tracking-wide text-text-secondary">
          Cursor Traces
        </span>
        <p className="font-mono text-[10px] text-text-tertiary">
          agent-transcripts/
        </p>
      </header>

      {!hasConversations && !loading ? (
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-text-secondary">
            No agent conversations yet
          </p>
          <p className="text-xs">
            Enable Cursor Traces in the sidebar account menu
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-0">
          <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface">
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              loading={loading}
              onRefresh={refetch}
            />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden bg-background">
            <MessageTimeline
              turns={turns}
              selectedTurn={selectedTurn}
              onSelectTurn={setSelectedTurn}
              conversationTitle={selectedConversation?.title}
              loading={detailLoading}
              toolFrequency={toolFrequencyForConversation}
              toolColorFn={toolColor}
              totalToolCalls={selectedConversation?.tool_call_count}
              subagents={subList}
              selectedSubagentId={selectedSubagentId}
              onSelectSubagent={handleSelectSubagent}
              stats={stats}
            />
          </div>

          <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-surface">
            <TurnDetail
              turn={selectedTurn}
              subagentTurns={subagentDetail?.turns ?? null}
              subagentTitle={selectedSubagentTitle}
              subagentLoading={subagentLoading}
              onBackFromSubagent={handleBackFromSubagent}
            />
          </aside>
        </div>
      )}
    </div>
  )
}

