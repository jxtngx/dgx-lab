"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { usePoll } from "@/lib/use-poll"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

interface HubModel {
  id: string
  downloads: number
  likes: number
  pipeline_tag: string | null
  last_modified: string | null
}

type DownloadStatus = {
  status: "downloading" | "complete" | "error" | "interrupted"
  error?: string | null
  started_at?: number
  finished_at?: number
  path?: string
  progress?: number | null
  downloaded_gb?: number
  expected_gb?: number | null
  elapsed_s?: number
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatElapsed(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  if (m < 60) return `${m}m ${rem}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function PullModelSheet({
  open,
  onOpenChange,
  onPullComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPullComplete?: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<HubModel[]>([])
  const [searching, setSearching] = useState(false)
  const [pulling, setPulling] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasPulling = pulling.size > 0
  const { data: downloads } = usePoll<Record<string, DownloadStatus>>(
    open || hasPulling ? "/control/models/downloads" : null,
    2000,
  )

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setQuery("")
      setResults([])
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    try {
      const data = await api<HubModel[]>(
        `/control/search?q=${encodeURIComponent(q.trim())}&limit=20`,
      )
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  function onQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 400)
  }

  async function handlePull(repoId: string) {
    setPulling((prev) => new Set(prev).add(repoId))
    try {
      await api("/control/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: repoId }),
      })
    } catch {
      // error tracked server-side
    }
  }

  function getStatus(repoId: string): DownloadStatus | null {
    return downloads?.[repoId] ?? null
  }

  const hasActiveDownloads =
    downloads &&
    Object.values(downloads).some((d) => d.status === "downloading")

  useEffect(() => {
    if (!downloads) return
    for (const [id, dl] of Object.entries(downloads)) {
      if (dl.status === "complete" && pulling.has(id)) {
        setPulling((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        onPullComplete?.()
      }
    }
  }, [downloads, pulling, onPullComplete])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="!w-[480px] !max-w-[480px] !bg-[var(--surface)]"
      >
        <SheetHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            Pull Model
          </SheetTitle>
          <SheetDescription className="font-mono text-[10px] text-text-tertiary">
            Search HuggingFace Hub and download to local cache
          </SheetDescription>

          {/* Search */}
          <div className="relative mt-3">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 16l4.5 4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={inputRef}
              type="search"
              placeholder="Search models… (e.g. meta-llama/Llama)"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="h-8 w-full rounded-md pl-8 pr-3 font-mono text-[12px] text-foreground placeholder:text-text-tertiary outline-none focus-visible:ring-1 focus-visible:ring-cyan/40"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            />
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 py-2">
            {/* Active downloads */}
            {downloads &&
              Object.entries(downloads).some(
                ([, d]) => d.status === "downloading",
              ) && (
                <div className="mb-3">
                  <div className="mb-1.5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
                    Active Downloads
                  </div>
                  {Object.entries(downloads)
                    .filter(([, d]) => d.status === "downloading")
                    .map(([id, dl]) => {
                      const pct = dl.progress != null ? Math.min(Math.round(dl.progress * 100), 100) : null
                      return (
                        <div
                          key={id}
                          className="mb-1.5 rounded-md border px-3 py-2.5"
                          style={{
                            borderColor: "rgba(34,211,238,0.2)",
                            background: "var(--color-cyan-dim)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{
                                background: "var(--color-cyan)",
                                animation: "pulse-dot 2s ease infinite",
                              }}
                            />
                            <span className="truncate font-mono text-[11px] font-medium text-cyan">
                              {id}
                            </span>
                            {pct != null && (
                              <span className="ml-auto shrink-0 font-mono text-[11px] font-bold text-cyan">
                                {pct}%
                              </span>
                            )}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--active)" }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: pct != null ? `${pct}%` : "100%",
                                background: "var(--color-cyan)",
                                animation: pct == null ? "pulse-dot 2s ease infinite" : undefined,
                              }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 font-mono text-[9px] text-text-tertiary">
                            {dl.downloaded_gb != null && (
                              <span>
                                {dl.downloaded_gb} GB
                                {dl.expected_gb != null && ` / ${dl.expected_gb} GB`}
                              </span>
                            )}
                            {dl.elapsed_s != null && (
                              <span className="ml-auto">{formatElapsed(dl.elapsed_s)}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}

            {/* Completed / errored downloads */}
            {downloads &&
              Object.entries(downloads).some(
                ([, d]) => d.status === "complete" || d.status === "error" || d.status === "interrupted",
              ) && (
                <div className="mb-3">
                  <div className="mb-1.5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
                    Recent
                  </div>
                  {Object.entries(downloads)
                    .filter(
                      ([, d]) =>
                        d.status === "complete" || d.status === "error" || d.status === "interrupted",
                    )
                    .map(([id, dl]) => (
                      <div
                        key={id}
                        className="mb-1.5 rounded-md border px-3 py-2.5"
                        style={{
                          background: dl.status === "complete"
                            ? "var(--color-cyan-dim)"
                            : dl.status === "interrupted"
                              ? "rgba(245,158,11,0.05)"
                              : "var(--elevated)",
                          borderColor: dl.status === "complete"
                            ? "rgba(34,211,238,0.2)"
                            : dl.status === "interrupted"
                              ? "rgba(245,158,11,0.2)"
                              : "var(--border-subtle)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="shrink-0 text-[13px]"
                            style={{
                              color: dl.status === "complete"
                                ? "var(--color-cyan)"
                                : dl.status === "interrupted"
                                  ? "var(--color-amber)"
                                  : "var(--color-red)",
                            }}
                          >
                            {dl.status === "complete" ? "✓" : dl.status === "interrupted" ? "⏸" : "✗"}
                          </span>
                          <span className={cn(
                            "truncate font-mono text-[11px] font-medium",
                            dl.status === "complete" ? "text-cyan" : "text-text-secondary",
                          )}>
                            {id}
                          </span>
                          {dl.status === "interrupted" ? (
                            <button
                              type="button"
                              onClick={() => handlePull(id)}
                              className="ml-auto shrink-0 rounded-md px-2 py-0.5 font-mono text-[9px] font-semibold transition-colors"
                              style={{
                                background: "var(--color-cyan-dim)",
                                color: "var(--color-cyan)",
                                border: "1px solid rgba(34,211,238,0.25)",
                              }}
                            >
                              Resume
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "ml-auto shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold",
                                dl.status === "complete"
                                  ? "bg-cyan-dim text-cyan"
                                  : "bg-red-dim text-red",
                              )}
                              style={{
                                border: `1px solid ${
                                  dl.status === "complete"
                                    ? "rgba(34,211,238,0.25)"
                                    : "rgba(239,68,68,0.25)"
                                }`,
                              }}
                            >
                              {dl.status === "complete" ? "Downloaded" : "Failed"}
                            </span>
                          )}
                        </div>
                        {(dl.status === "error" || dl.status === "interrupted") && dl.error && (
                          <p className="mt-1.5 font-mono text-[9px] text-red leading-relaxed">
                            {dl.error}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}

            {/* Search results */}
            {searching && (
              <div className="flex items-center justify-center py-12 text-xs text-text-tertiary">
                <span
                  className="mr-2 inline-block size-3 animate-pulse rounded-full"
                  style={{ background: "rgba(34,211,238,0.4)" }}
                />
                Searching Hub…
              </div>
            )}

            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div className="py-12 text-center text-xs text-text-tertiary">
                No models found for &ldquo;{query}&rdquo;
              </div>
            )}

            {!searching && results.length > 0 && (
              <div>
                <div className="mb-1.5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
                  Results · {results.length}
                </div>
                <div className="space-y-px">
                  {results.map((m) => {
                    const status = getStatus(m.id)
                    const isPending = pulling.has(m.id) && !status
                    const isDownloading = status?.status === "downloading" || isPending
                    const isComplete = status?.status === "complete"
                    const isInterrupted = status?.status === "interrupted"

                    return (
                      <div
                        key={m.id}
                        className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-elevated"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isDownloading && (
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{
                                  background: "var(--color-cyan)",
                                  animation: "pulse-dot 2s ease infinite",
                                }}
                              />
                            )}
                            <span className="truncate text-[12px] font-semibold text-foreground">
                              {m.id}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] text-text-tertiary">
                            {m.pipeline_tag && (
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[9px] font-medium"
                                style={{
                                  background: "var(--color-blue-dim)",
                                  color: "var(--color-blue)",
                                }}
                              >
                                {m.pipeline_tag}
                              </span>
                            )}
                            <span>↓ {formatNumber(m.downloads)}</span>
                            <span>♥ {formatNumber(m.likes)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloading || isComplete}
                          onClick={() => handlePull(m.id)}
                          className={cn(
                            "shrink-0 rounded-md px-3 py-1.5 font-mono text-[10px] font-semibold transition-colors",
                            isComplete
                              ? "cursor-default text-cyan"
                              : isDownloading
                                ? "cursor-wait text-cyan"
                                : isInterrupted
                                  ? "text-cyan hover:opacity-90"
                                  : "text-foreground hover:text-cyan",
                          )}
                          style={{
                            background: isComplete
                              ? "var(--color-cyan-dim)"
                              : isDownloading
                                ? "var(--color-cyan-dim)"
                                : isInterrupted
                                  ? "var(--color-cyan-dim)"
                                  : "var(--elevated)",
                            border: `1px solid ${
                              isComplete || isDownloading || isInterrupted
                                ? "rgba(34,211,238,0.2)"
                                : "var(--border-subtle)"
                            }`,
                          }}
                        >
                          {isComplete
                            ? "Cached"
                            : isPending
                              ? "Starting…"
                              : isDownloading
                                ? "Pulling…"
                                : isInterrupted
                                  ? "Resume"
                                : "Pull"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!searching &&
              query.trim().length < 2 &&
              results.length === 0 &&
              !hasActiveDownloads &&
              !(
                downloads &&
                Object.values(downloads).some(
                  (d) => d.status === "complete" || d.status === "error" || d.status === "interrupted",
                )
              ) && (
                <div className="flex flex-col items-center gap-3 py-16 text-text-tertiary">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-text-dim"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M16 16l4.5 4.5" strokeLinecap="round" />
                  </svg>
                  <p className="text-[12px]">
                    Search for models on HuggingFace Hub
                  </p>
                  <p className="font-mono text-[10px] text-text-dim">
                    e.g. meta-llama/Llama · mistralai · Qwen
                  </p>
                </div>
              )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
