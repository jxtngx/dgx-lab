"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { api } from "@/lib/api"
import { ConversationList } from "@/components/agents/conversation-list"
import { MessageTimeline } from "@/components/agents/message-timeline"
import { ProjectOverview, displayModelName, type ModelUsageResponse } from "@/components/agents/project-overview"
import { TurnDetail } from "@/components/agents/turn-detail"
import type { ProjectSummary } from "@/components/agents/project-selector"

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

interface ProjectsResponse {
  projects: ProjectSummary[]
  default_slug: string | null
  override: boolean
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

const PROJECT_STORAGE_KEY = "dgx-lab-cursor-project"

function toolColor(name: string): string {
  return TOOL_COLORS[name] ?? "#8b8993"
}

function withProject(path: string, project: string | null): string {
  if (!project) return path
  const sep = path.includes("?") ? "&" : "?"
  return `${path}${sep}project=${encodeURIComponent(project)}`
}

export default function AgentsPage() {
  const [projects, setProjects] = useState<ProjectsResponse | null>(null)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [projectInitialized, setProjectInitialized] = useState(false)

  const [conversationsData, setConversationsData] = useState<ConversationsResponse | null>(null)
  const [conversationsLoading, setConversationsLoading] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedTurn, setSelectedTurn] = useState<Turn | null>(null)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [subagents, setSubagents] = useState<SubagentsResponse | null>(null)

  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null)
  const [subagentDetail, setSubagentDetail] = useState<SubagentDetailResponse | null>(null)
  const [subagentLoading, setSubagentLoading] = useState(false)

  const [modelUsage, setModelUsage] = useState<ModelUsageResponse | null>(null)

  useEffect(() => {
    setProjectsLoading(true)
    api<ProjectsResponse>("/agents/projects")
      .then((res) => {
        setProjects(res)
        const stored = typeof window !== "undefined"
          ? window.localStorage.getItem(PROJECT_STORAGE_KEY)
          : null
        const validStored = stored && res.projects.some((p) => p.slug === stored) ? stored : null
        const fallback = res.default_slug && res.projects.some((p) => p.slug === res.default_slug)
          ? res.default_slug
          : (res.projects[0]?.slug ?? null)
        setSelectedProject(validStored ?? fallback)
        setProjectInitialized(true)
      })
      .catch(() => {
        setProjects({ projects: [], default_slug: null, override: false })
        setProjectInitialized(true)
      })
      .finally(() => setProjectsLoading(false))
  }, [])

  const handleSelectProject = useCallback((slug: string) => {
    setSelectedProject(slug)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, slug)
    }
    setSelectedId(null)
    setDetail(null)
    setSubagents(null)
    setSelectedSubagentId(null)
    setSubagentDetail(null)
    setSelectedTurn(null)
  }, [])

  const refetchConversations = useCallback(() => {
    if (!projectInitialized) return
    setConversationsLoading(true)
    api<ConversationsResponse>(withProject("/agents/conversations", selectedProject))
      .then(setConversationsData)
      .catch(() => setConversationsData({ conversations: [] }))
      .finally(() => setConversationsLoading(false))
  }, [projectInitialized, selectedProject])

  useEffect(() => {
    refetchConversations()
  }, [refetchConversations])

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
    api<ConversationDetailResponse>(
      withProject(`/agents/conversations/${selectedId}`, selectedProject),
    )
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))

    api<SubagentsResponse>(
      withProject(`/agents/conversations/${selectedId}/subagents`, selectedProject),
    )
      .then(setSubagents)
      .catch(() => setSubagents(null))
  }, [selectedId, selectedProject])

  useEffect(() => {
    if (!selectedId || !selectedSubagentId) {
      setSubagentDetail(null)
      return
    }
    setSubagentLoading(true)
    api<SubagentDetailResponse>(
      withProject(
        `/agents/conversations/${selectedId}/subagents/${selectedSubagentId}`,
        selectedProject,
      ),
    )
      .then(setSubagentDetail)
      .catch(() => setSubagentDetail(null))
      .finally(() => setSubagentLoading(false))
  }, [selectedId, selectedSubagentId, selectedProject])

  useEffect(() => {
    if (!projectInitialized) return
    api<StatsResponse>(withProject("/agents/stats", selectedProject))
      .then(setStats)
      .catch(() => setStats(null))
  }, [projectInitialized, selectedProject])

  useEffect(() => {
    if (!projectInitialized) return
    const path = selectedId
      ? `/agents/model-usage?conversation_id=${encodeURIComponent(selectedId)}`
      : "/agents/model-usage"
    api<ModelUsageResponse>(withProject(path, selectedProject))
      .then(setModelUsage)
      .catch(() => setModelUsage(null))
  }, [projectInitialized, selectedProject, selectedId])

  const conversations = conversationsData?.conversations ?? []
  const turns = detail?.turns ?? []
  const hasConversations = conversations.length > 0 || conversationsLoading
  const selectedConversation = conversations.find((c) => c.id === selectedId)
  const subList = subagents?.subagents ?? []
  const projectList = projects?.projects ?? []
  const isOverride = projects?.override ?? false
  const activeProject = projectList.find((p) => p.slug === selectedProject) ?? null

  const selectedSubagentTitle = subList.find((s) => s.id === selectedSubagentId)?.title

  const handleSelectSubagent = useCallback((id: string) => {
    setSelectedTurn(null)
    setSelectedSubagentId(id)
  }, [])

  const handleBackFromSubagent = useCallback(() => {
    setSelectedSubagentId(null)
    setSubagentDetail(null)
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
    setSubagents(null)
    setSelectedSubagentId(null)
    setSubagentDetail(null)
    setSelectedTurn(null)
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

  const headerSubtitle = isOverride
    ? "agent-transcripts/ (override)"
    : selectedProject
      ? `~/.cursor/projects/${selectedProject}/agent-transcripts/`
      : "agent-transcripts/"

  const conversationModelMatch = modelUsage?.scope === "conversation" ? modelUsage.agent_match : null
  const conversationModelColor = conversationModelMatch?.last_used_model
    ? (conversationModelMatch.last_used_model.includes("claude")
        ? "#a78bfa"
        : conversationModelMatch.last_used_model.includes("gpt")
          ? "#10b981"
          : conversationModelMatch.last_used_model.includes("composer")
            ? "#f59e0b"
            : "#8b8993")
    : undefined

  return (
    <div className="flex h-[calc(100vh-52px-28px)] min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2">
        <span className="font-sans text-[11.5px] font-medium tracking-wide text-text-secondary">
          Cursor Traces
        </span>
        <p className="font-mono text-[10px] text-text-tertiary truncate ml-3">
          {headerSubtitle}
        </p>
      </header>

      {!hasConversations && !conversationsLoading && projectList.length === 0 && !isOverride ? (
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
            No Cursor projects found
          </p>
          <p className="text-xs">
            Looked under <code className="rounded bg-elevated px-1 font-mono">~/.cursor/projects/</code>
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-0">
          <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-surface">
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              loading={conversationsLoading}
              onRefresh={refetchConversations}
              projects={projectList}
              selectedProject={selectedProject}
              onSelectProject={handleSelectProject}
              projectsLoading={projectsLoading}
              onClearSelection={handleClearSelection}
            />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden bg-background">
            {selectedId ? (
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
                modelLabel={
                  conversationModelMatch?.last_used_model
                    ? displayModelName(conversationModelMatch.last_used_model)
                    : null
                }
                modelColor={conversationModelColor}
                modeLabel={conversationModelMatch?.mode ?? null}
              />
            ) : (
              <ProjectOverview
                project={activeProject}
                stats={stats}
                modelUsage={modelUsage}
                toolColorFn={toolColor}
                loading={conversationsLoading || projectsLoading}
              />
            )}
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
