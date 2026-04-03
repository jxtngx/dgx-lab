"use client"

import { useState, useMemo } from "react"
import { useFetch } from "@/lib/use-fetch"
import { usePoll } from "@/lib/use-poll"
import { cn } from "@workspace/ui/lib/utils"

interface CuratorStatus {
  installed: boolean
  version: string | null
  data_dir: string
  dataset_count: number
  active_jobs: number
}

interface PipelineStage {
  id: string
  name: string
  category: string
  description: string
}

interface Dataset {
  name: string
  path: string
  format: string
  size_bytes: number
  modified: number
  row_count: number | null
  file_count: number
}

interface Job {
  id: string
  name: string
  status: string
  stages: string[]
  input_path: string
  started_at: number
  finished_at: number | null
  output: string | null
  error: string | null
}

interface DatasetPreview {
  path: string
  rows: Record<string, unknown>[]
  count: number
}

const PAGE_TABS = ["Overview", "Pipeline", "Datasets", "Jobs"] as const
type PageTab = (typeof PAGE_TABS)[number]

const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  io: { bg: "var(--elevated)", fg: "var(--text-secondary)" },
  cleaning: { bg: "var(--color-cyan-dim)", fg: "var(--color-cyan)" },
  filtering: { bg: "rgba(251,191,36,0.1)", fg: "var(--color-amber)" },
  dedup: { bg: "rgba(96,165,250,0.1)", fg: "#60a5fa" },
  safety: { bg: "rgba(239,68,68,0.1)", fg: "#ef4444" },
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatusBadge({ installed, version }: { installed: boolean; version: string | null }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{
        background: installed ? "var(--color-cyan-dim)" : "var(--elevated)",
        border: `1px solid ${installed ? "rgba(34,211,238,0.2)" : "var(--border-subtle)"}`,
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{
          background: installed ? "var(--color-cyan)" : "var(--color-amber)",
          animation: installed ? undefined : "pulse-dot 2s ease infinite",
        }}
      />
      <span className="font-mono text-[11px] font-medium" style={{ color: installed ? "var(--color-cyan)" : "var(--color-amber)" }}>
        {installed ? `nemo-curator ${version}` : "Not installed"}
      </span>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border px-4 py-3"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
    >
      <span className="font-sans text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </span>
      <span className="font-mono text-[18px] font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
        {value}
      </span>
    </div>
  )
}

export default function CuratorPage() {
  const { data: status } = useFetch<CuratorStatus>("/curator/status")
  const { data: stages } = useFetch<PipelineStage[]>("/curator/stages")
  const { data: datasets } = useFetch<Dataset[]>("/curator/datasets")
  const { data: jobs } = usePoll<Job[]>("/curator/jobs", 5000)

  const [activeTab, setActiveTab] = useState<PageTab>("Overview")
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)
  const [preview, setPreview] = useState<DatasetPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const activeJobs = useMemo(() => (jobs ?? []).filter((j) => j.status === "running" || j.status === "queued"), [jobs])

  const stagesByCategory = useMemo(() => {
    if (!stages) return new Map<string, PipelineStage[]>()
    const map = new Map<string, PipelineStage[]>()
    for (const s of stages) {
      const list = map.get(s.category) ?? []
      list.push(s)
      map.set(s.category, list)
    }
    return map
  }, [stages])

  async function loadPreview(name: string) {
    setSelectedDataset(name)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/curator/datasets/${encodeURIComponent(name)}?limit=20`)
      if (res.ok) setPreview(await res.json())
    } catch {
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-52px-28px)] min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border-subtle px-4">
        <div className="flex items-end justify-between">
          <nav className="flex gap-0" aria-label="Curator views">
            {PAGE_TABS.map((label) => {
              const isActive = activeTab === label
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveTab(label)}
                  className={cn(
                    "relative px-3 py-2.5 font-sans text-[11.5px] font-medium tracking-wide transition-colors",
                    isActive ? "text-cyan" : "text-text-tertiary hover:text-text-secondary",
                  )}
                >
                  {label}
                  {label === "Jobs" && activeJobs.length > 0 && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-cyan)", animation: "pulse-dot 2s ease infinite" }} />
                  )}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-t-full" style={{ backgroundColor: "var(--color-cyan)" }} />
                  )}
                </button>
              )
            })}
          </nav>
          <div className="pb-2">
            <StatusBadge installed={status?.installed ?? false} version={status?.version ?? null} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === "Overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Datasets" value={status?.dataset_count ?? 0} />
              <StatCard label="Pipeline Stages" value={stages?.length ?? 0} />
              <StatCard label="Active Jobs" value={activeJobs.length} />
              <StatCard label="Modalities" value="Text" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
              >
                <h3 className="mb-3 font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                  About NeMo Curator
                </h3>
                <p className="font-sans text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  NeMo Curator is a scalable data curation platform for preparing large datasets for LLM and AI training.
                  It supports text, image, video, and audio with GPU-accelerated filtering, deduplication, quality scoring,
                  and PII redaction.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["GPU Accelerated", "Deduplication", "Quality Filtering", "PII Redaction", "Multi-Modal", "Distributed"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-2.5 py-1 font-mono text-[10px] font-medium"
                      style={{ background: "var(--color-cyan-dim)", color: "var(--color-cyan)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
              >
                <h3 className="mb-3 font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                  Configuration
                </h3>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-tertiary)" }}>Data directory</span>
                    <span style={{ color: "var(--text-secondary)" }}>{status?.data_dir ?? "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-tertiary)" }}>Status</span>
                    <span style={{ color: status?.installed ? "var(--color-cyan)" : "var(--color-amber)" }}>
                      {status?.installed ? "Ready" : "Not installed"}
                    </span>
                  </div>
                </div>
                {!status?.installed && (
                  <div
                    className="mt-3 rounded-lg px-3 py-2"
                    style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
                  >
                    <p className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      Install with:{" "}
                      <code className="rounded px-1 py-0.5 text-text-secondary" style={{ background: "var(--active)" }}>
                        pip install nemo-curator[all]
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "Pipeline" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                Available Pipeline Stages
              </h3>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {stages?.length ?? 0} stages
              </span>
            </div>

            {Array.from(stagesByCategory.entries()).map(([category, stageList]) => {
              const colors = CATEGORY_COLORS[category] ?? { bg: "var(--elevated)", fg: "var(--text-secondary)" }
              return (
                <div key={category}>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: colors.bg, color: colors.fg }}
                    >
                      {category}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
                      {stageList.length} stages
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stageList.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-lg border px-4 py-3 transition-colors"
                        style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
                      >
                        <div className="font-sans text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                          {s.name}
                        </div>
                        <p className="mt-1 font-sans text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                          {s.description}
                        </p>
                        <div className="mt-2">
                          <code className="font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>
                            {s.id}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activeTab === "Datasets" && (
          <div className="flex min-h-0 gap-4">
            <div className={cn("space-y-2", selectedDataset ? "w-1/2" : "w-full")}>
              <div className="flex items-center justify-between">
                <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                  Datasets
                </h3>
                <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {datasets?.length ?? 0} datasets
                </span>
              </div>

              {!datasets || datasets.length === 0 ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", color: "var(--text-secondary)" }}
                >
                  <p className="text-[13px] font-medium">No datasets yet</p>
                  <p className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Place datasets in{" "}
                    <code className="rounded px-1.5 py-0.5" style={{ background: "var(--elevated)" }}>~/.dgx-lab/curator/</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {datasets.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => loadPreview(d.name)}
                      className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
                      style={{
                        background: selectedDataset === d.name ? "rgba(34,211,238,0.07)" : "var(--surface)",
                        border: `1px solid ${selectedDataset === d.name ? "rgba(34,211,238,0.15)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-sans text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>{d.name}</div>
                        <div className="flex gap-3 font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                          <span>{d.format.toUpperCase()}</span>
                          <span>{fmtBytes(d.size_bytes)}</span>
                          {d.row_count != null && <span>{d.row_count} rows</span>}
                          <span>{d.file_count} file{d.file_count > 1 ? "s" : ""}</span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
                        {fmtDate(d.modified)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedDataset && (
              <div className="w-1/2 overflow-auto rounded-xl border" style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}>
                <div className="sticky top-0 flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}>
                  <span className="font-mono text-[12px] font-semibold" style={{ color: "var(--foreground)" }}>{selectedDataset}</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedDataset(null); setPreview(null) }}
                    className="font-mono text-[11px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    x
                  </button>
                </div>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <span className="inline-block size-4 animate-pulse rounded-full" style={{ background: "rgba(34,211,238,0.4)" }} />
                  </div>
                ) : preview?.rows.length ? (
                  <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {preview.rows.map((row, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          {JSON.stringify(row, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-6 font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>No rows to preview</p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "Jobs" && (
          <div className="space-y-3">
            <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
              Curation Jobs
            </h3>

            {!jobs || jobs.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", color: "var(--text-secondary)" }}
              >
                <p className="text-[13px] font-medium">No jobs</p>
                <p className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Pipeline jobs will appear here when started
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="rounded-lg border px-4 py-3"
                    style={{
                      borderColor: j.status === "error" ? "rgba(239,68,68,0.2)" : j.status === "running" ? "rgba(34,211,238,0.15)" : "var(--border-subtle)",
                      background: j.status === "running" ? "var(--color-cyan-dim)" : "var(--surface)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: j.status === "complete" ? "var(--color-cyan)" : j.status === "error" ? "#ef4444" : j.status === "running" ? "var(--color-cyan)" : "var(--color-amber)",
                          animation: j.status === "running" ? "pulse-dot 2s ease infinite" : undefined,
                        }}
                      />
                      <span className="font-sans text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>{j.name}</span>
                      <div className="flex gap-1.5">
                        {j.stages.map((s) => (
                          <span
                            key={s}
                            className="rounded px-1.5 py-0.5 font-mono text-[9px] font-medium"
                            style={{ background: "var(--elevated)", color: "var(--text-tertiary)" }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                      <span className="ml-auto font-mono text-[10px] capitalize" style={{ color: "var(--text-tertiary)" }}>{j.status}</span>
                    </div>
                    {j.error && (
                      <p className="mt-1.5 font-mono text-[10px] leading-relaxed" style={{ color: "#ef4444" }}>{j.error}</p>
                    )}
                    <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>
                      Started {fmtDate(j.started_at)}
                      {j.finished_at && <>{" "}Finished {fmtDate(j.finished_at)}</>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
