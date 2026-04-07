"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { useFetch } from "@/lib/use-fetch"
import { useSettings } from "@/lib/settings-context"

interface UserInfo {
  name: string
  username: string
}

const OPTIONAL_TOOLS = [
  { key: "agent-viewer", label: "Cursor Traces" },
  { key: "claude-traces", label: "Claude Traces" },
  { key: "langsmith-traces", label: "LangSmith Traces" },
] as const

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function SettingsModal({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: UserInfo | null
}) {
  const { isToolEnabled, setToolEnabled } = useSettings()
  const backdropRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div
        className="w-[380px] rounded-xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          animation: "fade-up 150ms ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--foreground)" }}>
            Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--elevated)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* User */}
        {user && (
          <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <Avatar className="h-10 w-10 rounded-lg">
              <AvatarFallback className="rounded-lg bg-[var(--color-cyan-dim)] font-mono text-[13px] font-bold text-[var(--color-cyan)]">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-sans text-[14px] font-semibold" style={{ color: "var(--foreground)" }}>
                {user.name}
              </div>
              <div className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {user.username}
              </div>
            </div>
          </div>
        )}

        {/* Optional Tools */}
        <div className="px-5 py-3 pb-4">
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            Optional Tools
          </div>
          {OPTIONAL_TOOLS.map((tool) => (
            <label
              key={tool.key}
              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-[var(--elevated)]"
            >
              <span className="font-sans text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {tool.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isToolEnabled(tool.key)}
                onClick={() => setToolEnabled(tool.key, !isToolEnabled(tool.key))}
                className="relative h-5 w-9 rounded-full transition-colors"
                style={{
                  background: isToolEnabled(tool.key) ? "var(--color-cyan)" : "var(--active)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform"
                  style={{
                    background: isToolEnabled(tool.key) ? "#000" : "var(--text-tertiary)",
                    transform: isToolEnabled(tool.key) ? "translateX(16px)" : "translateX(0)",
                  }}
                />
              </button>
            </label>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function SidebarAccount() {
  const { data: user } = useFetch<UserInfo>("/user")
  const [open, setOpen] = useState(false)

  const displayName = user?.name || user?.username || "…"
  const displaySub = user?.username ?? ""
  const initials = getInitials(user?.name || user?.username || "")

  return (
    <div className="p-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--elevated)]"
      >
        <Avatar className="h-8 w-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-[var(--color-cyan-dim)] font-mono text-[11px] font-bold text-[var(--color-cyan)]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
            {displayName}
          </span>
          {displaySub && (
            <span className="truncate font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {displaySub}
            </span>
          )}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0"
          style={{ color: "var(--text-dim)" }}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <SettingsModal open={open} onClose={() => setOpen(false)} user={user} />
    </div>
  )
}
