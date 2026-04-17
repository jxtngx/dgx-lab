"use client"

import { useEffect, useRef, useState } from "react"

export interface ProjectSummary {
  slug: string
  display_path: string
  conversation_count: number
  modified_at: number
  is_default: boolean
}

interface ProjectSelectorProps {
  projects: ProjectSummary[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
  loading?: boolean
}

function shortPath(displayPath: string): string {
  const parts = displayPath.split("/").filter(Boolean)
  if (parts.length <= 2) return displayPath
  return ".../" + parts.slice(-2).join("/")
}

export function ProjectSelector({
  projects,
  selectedSlug,
  onSelect,
  loading,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const selected = projects.find((p) => p.slug === selectedSlug) ?? null

  if (loading && projects.length === 0) {
    return (
      <div
        className="flex h-7 items-center rounded-md px-2.5 font-mono text-[10px]"
        style={{
          background: "var(--elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-tertiary)",
        }}
      >
        Loading projects…
      </div>
    )
  }

  if (projects.length === 0) {
    return null
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left transition-colors"
        style={{
          background: "var(--elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className="shrink-0 font-mono text-[10px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            project
          </span>
          <span
            className="truncate font-mono text-[11px]"
            style={{ color: "var(--foreground)" }}
            title={selected?.display_path ?? ""}
          >
            {selected ? shortPath(selected.display_path) : "Select project"}
          </span>
          {selected?.is_default && (
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
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--text-tertiary)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[280px] overflow-y-auto rounded-md py-1"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {projects.map((p) => {
            const active = p.slug === selectedSlug
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => {
                  onSelect(p.slug)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--elevated)]"
                style={{
                  background: active ? "var(--color-cyan-dim)" : undefined,
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate font-mono text-[11px]"
                    style={{
                      color: active ? "var(--color-cyan)" : "var(--foreground)",
                    }}
                    title={p.display_path}
                  >
                    {shortPath(p.display_path)}
                  </span>
                  <span
                    className="font-mono text-[9.5px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {p.conversation_count} conv
                    {p.is_default ? " · current" : ""}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
