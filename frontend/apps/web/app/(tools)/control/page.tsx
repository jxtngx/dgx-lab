"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFetch } from "@/lib/use-fetch"
import { usePoll } from "@/lib/use-poll"
import { ModelTable, type ControlModel } from "@/components/control/model-table"
import { ModelDetail } from "@/components/control/model-detail"
import { PullModelSheet } from "@/components/control/pull-model-sheet"
import { cn } from "@workspace/ui/lib/utils"

interface DownloadEntry {
  status: "downloading" | "complete" | "error" | "interrupted"
  progress?: number | null
  downloaded_gb?: number
  expected_gb?: number | null
  elapsed_s?: number
}

/* ── Inline SVG icons ───────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconPull() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function IconRefresh({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={spinning ? { animation: "spin 0.8s linear infinite" } : undefined}
    >
      <path
        d="M21 12a9 9 0 1 1-2.63-6.36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}


/* ── Constants ──────────────────────────────────────────────────── */

const GRID = "minmax(0,2fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.8fr) 100px"

/* ── Page ───────────────────────────────────────────────────────── */

export default function ControlPage() {
  const { data: models, loading, refetch } = useFetch<ControlModel[]>("/control/models")
  const { data: downloads } = usePoll<Record<string, DownloadEntry>>("/control/models/downloads", 2000)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"list" | "compact">("list")
  const [pullOpen, setPullOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const handlePullComplete = useCallback(() => refetch(), [refetch])
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetch("/api/control/models/reconcile", { method: "POST" })
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  const handleResume = useCallback(async (repoId: string) => {
    try {
      await fetch("/api/control/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: repoId }),
      })
    } catch {
      // download endpoint will track status
    }
  }, [])

  const hasActiveDownloads = downloads && Object.values(downloads).some((d) => d.status === "downloading")

  useEffect(() => {
    if (!hasActiveDownloads) return
    const id = setInterval(refetch, 5000)
    return () => clearInterval(id)
  }, [hasActiveDownloads, refetch])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const filtered = useMemo(() => {
    const cached = models ?? []
    const cachedIds = new Set(cached.map((m) => m.id))

    const trackedDownloads = new Map<string, DownloadEntry>()
    if (downloads) {
      for (const [id, dl] of Object.entries(downloads)) {
        if (dl.status === "downloading" || dl.status === "interrupted") {
          trackedDownloads.set(id, dl)
        }
      }
    }

    const merged = cached.map((m) => {
      const dl = trackedDownloads.get(m.id)
      if (dl) {
        return { ...m, status: dl.status, _download: dl } as ControlModel
      }
      return m
    })

    const extra: ControlModel[] = []
    for (const [id, dl] of trackedDownloads) {
      if (!cachedIds.has(id)) {
        extra.push({
          id,
          size_on_disk_gb: dl.downloaded_gb ?? 0,
          status: dl.status,
          _download: dl,
        } as ControlModel)
      }
    }

    const list = [...extra, ...merged]
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((m) => m.id.toLowerCase().includes(q))
  }, [models, query, downloads])

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <header
        className="flex shrink-0 flex-col gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-sans text-[15px] font-semibold tracking-tight text-foreground">
            Models
          </h1>
          <div className="flex items-center gap-3">
            {hasActiveDownloads && (
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{
                  background: "var(--color-cyan-dim)",
                  border: "1px solid rgba(34,211,238,0.2)",
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--color-cyan)",
                    animation: "pulse-dot 2s ease infinite",
                  }}
                />
                <span className="font-mono text-[10px] font-medium text-cyan">
                  {Object.values(downloads!).filter((d) => d.status === "downloading").length} downloading
                </span>
              </div>
            )}
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {filtered.length}
              {query.trim() ? ` / ${models?.length ?? 0}` : ""} models
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px] max-w-[50%] flex-1">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-tertiary)" }}
            >
              <IconSearch />
            </span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search models (org/name)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "h-8 w-full rounded-md pl-8 pr-12 font-mono text-[12px]",
                "text-foreground placeholder:text-text-tertiary",
                "outline-none ring-cyan focus-visible:border-cyan/40 focus-visible:ring-1"
              )}
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <kbd
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ background: "var(--active)", color: "var(--text-dim)" }}
            >
              /
            </kbd>
          </div>

          {/* View toggle */}
          <div
            className="flex rounded-md p-0.5"
            style={{
              border: "1px solid var(--border-subtle)",
              background: "var(--elevated)",
            }}
            role="group"
            aria-label="View density"
          >
            {(["list", "compact"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className="inline-flex h-7 w-8 items-center justify-center rounded transition-colors"
                style={{
                  background: view === v ? "var(--active)" : undefined,
                  color:
                    view === v
                      ? "var(--color-cyan)"
                      : "var(--text-secondary)",
                }}
              >
                {v === "list" ? (
                  <IconList />
                ) : (
                  <IconGrid />
                )}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-sans text-[12px] font-medium transition-colors"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                opacity: refreshing ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--hover)"
                e.currentTarget.style.borderColor = "var(--border)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--elevated)"
                e.currentTarget.style.borderColor = "var(--border-subtle)"
              }}
            >
              <IconRefresh spinning={refreshing} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setPullOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-sans text-[12px] font-medium transition-colors"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--color-cyan)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--hover)"
                e.currentTarget.style.borderColor = "var(--border)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--elevated)"
                e.currentTarget.style.borderColor = "var(--border-subtle)"
              }}
            >
              <IconPull />
              Pull
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Model list */}
        <div className="min-w-0 flex-1 overflow-auto px-4 py-3">
          <ModelTable
              models={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onResume={handleResume}
              gridTemplate={GRID}
              compact={view === "compact"}
            />
        </div>

        {/* Detail panel */}
        <aside
          className="w-[380px] shrink-0 overflow-y-auto px-4 py-4"
          style={{
            background: "var(--surface)",
            borderLeft: "1px solid var(--border-subtle)",
          }}
          aria-label="Model details"
        >
          <ModelDetail
            modelId={selectedId}
            onDelete={() => {
              setSelectedId(null)
              refetch()
            }}
          />
        </aside>
      </div>

      <PullModelSheet
        open={pullOpen}
        onOpenChange={setPullOpen}
        onPullComplete={handlePullComplete}
      />
    </div>
  )
}
