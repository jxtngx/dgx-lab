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

interface HubDataset {
  id: string
  downloads: number
  likes: number
  last_modified: string | null
  tags: string[]
}

type DownloadStatus = {
  status: "downloading" | "complete" | "error"
  error?: string | null
  started_at?: number
  finished_at?: number
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

export function PullDatasetSheet({
  open,
  onOpenChange,
  onPullComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPullComplete?: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<HubDataset[]>([])
  const [searching, setSearching] = useState(false)
  const [pulling, setPulling] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasPulling = pulling.size > 0
  const { data: downloads } = usePoll<Record<string, DownloadStatus>>(
    open || hasPulling ? "/datasets/downloads" : null,
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
      const data = await api<HubDataset[]>(
        `/datasets/search?q=${encodeURIComponent(q.trim())}&limit=20`,
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
      await api("/datasets/pull", {
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
            Pull Dataset
          </SheetTitle>
          <SheetDescription className="font-mono text-[10px] text-text-tertiary">
            Search HuggingFace Hub and download to local cache
          </SheetDescription>

          <div className="relative mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                placeholder="Search or paste repo ID (e.g. nvidia/nemotron-research-lgt)"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim().includes("/")) {
                    handlePull(query.trim())
                  }
                }}
                className="h-8 w-full rounded-md pl-8 pr-3 font-mono text-[12px] text-foreground placeholder:text-text-tertiary outline-none focus-visible:ring-1 focus-visible:ring-cyan/40"
                style={{
                  background: "var(--elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>
            {query.trim().includes("/") && (
              <button
                type="button"
                disabled={pulling.has(query.trim())}
                onClick={() => handlePull(query.trim())}
                className="shrink-0 rounded-md px-3 py-1 font-mono text-[10px] font-semibold transition-colors disabled:opacity-40"
                style={{ background: "var(--color-cyan)", color: "#000" }}
              >
                Pull
              </button>
            )}
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
                    .map(([id, dl]) => (
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
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--active)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: "100%",
                              background: "var(--color-cyan)",
                              animation: "pulse-dot 2s ease infinite",
                            }}
                          />
                        </div>
                        {dl.elapsed_s != null && (
                          <div className="mt-1.5 font-mono text-[9px] text-text-tertiary">
                            {formatElapsed(dl.elapsed_s)}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}

            {/* Completed / errored */}
            {downloads &&
              Object.entries(downloads).some(
                ([, d]) => d.status === "complete" || d.status === "error",
              ) && (
                <div className="mb-3">
                  <div className="mb-1.5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
                    Recent
                  </div>
                  {Object.entries(downloads)
                    .filter(([, d]) => d.status === "complete" || d.status === "error")
                    .map(([id, dl]) => (
                      <div
                        key={id}
                        className="mb-1.5 rounded-md border px-3 py-2.5"
                        style={{
                          background: dl.status === "complete" ? "var(--color-cyan-dim)" : "var(--elevated)",
                          borderColor: dl.status === "complete" ? "rgba(34,211,238,0.2)" : "var(--border-subtle)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="shrink-0 text-[13px]"
                            style={{ color: dl.status === "complete" ? "var(--color-cyan)" : "var(--color-red)" }}
                          >
                            {dl.status === "complete" ? "✓" : "✗"}
                          </span>
                          <span className={cn(
                            "truncate font-mono text-[11px] font-medium",
                            dl.status === "complete" ? "text-cyan" : "text-text-secondary",
                          )}>
                            {id}
                          </span>
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold",
                              dl.status === "complete" ? "bg-cyan-dim text-cyan" : "bg-red-dim text-red",
                            )}
                            style={{
                              border: `1px solid ${dl.status === "complete" ? "rgba(34,211,238,0.25)" : "rgba(239,68,68,0.25)"}`,
                            }}
                          >
                            {dl.status === "complete" ? "Downloaded" : "Failed"}
                          </span>
                        </div>
                        {dl.status === "error" && dl.error && (
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
                No datasets found for &ldquo;{query}&rdquo;
              </div>
            )}

            {!searching && results.length > 0 && (
              <div>
                <div className="mb-1.5 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-dim">
                  Results · {results.length}
                </div>
                <div className="space-y-px">
                  {results.map((d) => {
                    const status = getStatus(d.id)
                    const isPending = pulling.has(d.id) && !status
                    const isDownloading = status?.status === "downloading" || isPending
                    const isComplete = status?.status === "complete"

                    return (
                      <div
                        key={d.id}
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
                              {d.id}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-tertiary">
                            <span>↓ {formatNumber(d.downloads)}</span>
                            <span>♥ {formatNumber(d.likes)}</span>
                            {d.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded-sm px-1 py-0.5 text-[9px]"
                                style={{ background: "var(--active)", color: "var(--text-secondary)" }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloading || isComplete}
                          onClick={() => handlePull(d.id)}
                          className={cn(
                            "shrink-0 rounded-md px-3 py-1.5 font-mono text-[10px] font-semibold transition-colors",
                            isComplete
                              ? "cursor-default text-cyan"
                              : isDownloading
                                ? "cursor-wait text-cyan"
                                : "text-foreground hover:text-cyan",
                          )}
                          style={{
                            background: isComplete || isDownloading
                              ? "var(--color-cyan-dim)"
                              : "var(--elevated)",
                            border: `1px solid ${
                              isComplete || isDownloading
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
                  (d) => d.status === "complete" || d.status === "error",
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
                    Search for datasets on HuggingFace Hub
                  </p>
                  <p className="font-mono text-[10px] text-text-dim">
                    e.g. tatsu-lab/alpaca · Open-Orca · gsm8k
                  </p>
                </div>
              )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
