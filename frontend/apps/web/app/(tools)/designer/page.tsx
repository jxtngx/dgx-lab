"use client"

import { useState, useMemo } from "react"
import { useFetch } from "@/lib/use-fetch"
import { usePoll } from "@/lib/use-poll"
import { cn } from "@workspace/ui/lib/utils"

interface DesignerStatus {
  installed: boolean
  version: string | null
  config_dir: string
  data_dir: string
  provider_count: number
  model_count: number
  dataset_count: number
}

interface Provider {
  name: string
  base_url?: string
  api_key_set?: boolean
  [key: string]: unknown
}

interface ModelConfig {
  alias: string
  model_id?: string
  provider?: string
  temperature?: number
  max_tokens?: number
  [key: string]: unknown
}

interface Dataset {
  name: string
  path: string
  format: string
  size_bytes: number
  modified: number
  row_count: number | null
  file_count?: number
}

interface Job {
  id: string
  name: string
  status: string
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

const PAGE_TABS = ["Overview", "Providers", "Models", "Datasets", "Jobs"] as const
type PageTab = (typeof PAGE_TABS)[number]

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
        {installed ? `data-designer ${version}` : "Not installed"}
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

export default function DesignerPage() {
  const { data: status } = useFetch<DesignerStatus>("/designer/status")
  const { data: providers } = useFetch<Provider[]>("/designer/providers")
  const { data: models } = useFetch<ModelConfig[]>("/designer/models")
  const { data: datasets } = useFetch<Dataset[]>("/designer/datasets")
  const { data: jobs } = usePoll<Job[]>("/designer/jobs", 5000)

  const [activeTab, setActiveTab] = useState<PageTab>("Overview")
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)
  const [preview, setPreview] = useState<DatasetPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const activeJobs = useMemo(() => (jobs ?? []).filter((j) => j.status === "running" || j.status === "queued"), [jobs])

  async function loadPreview(name: string) {
    setSelectedDataset(name)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/designer/datasets/${encodeURIComponent(name)}?limit=20`)
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
          <nav className="flex gap-0" aria-label="Designer views">
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
        {/* Overview */}
        {activeTab === "Overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Providers" value={status?.provider_count ?? 0} />
              <StatCard label="Model Configs" value={status?.model_count ?? 0} />
              <StatCard label="Datasets" value={status?.dataset_count ?? 0} />
              <StatCard label="Active Jobs" value={activeJobs.length} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
              >
                <h3 className="mb-3 font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                  About Data Designer
                </h3>
                <p className="font-sans text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  NeMo Data Designer is an orchestration framework for synthetic data generation. Point it at LLM APIs,
                  define column schemas with dependencies, validators, and quality scoring — then generate
                  production-grade datasets at scale.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Synthetic Generation", "Column Dependencies", "LLM-as-Judge", "Batch Parallel", "Validation"].map((t) => (
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
                    <span style={{ color: "var(--text-tertiary)" }}>Config directory</span>
                    <span style={{ color: "var(--text-secondary)" }}>{status?.config_dir ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-tertiary)" }}>Data directory</span>
                    <span style={{ color: "var(--text-secondary)" }}>{status?.data_dir ?? "—"}</span>
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
                        pip install data-designer
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Providers */}
        {activeTab === "Providers" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                Configured Providers
              </h3>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {providers?.length ?? 0} providers
              </span>
            </div>

            {!providers || providers.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", color: "var(--text-secondary)" }}
              >
                <p className="text-[13px] font-medium">No providers configured</p>
                <p className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Run{" "}
                  <code className="rounded px-1.5 py-0.5" style={{ background: "var(--elevated)" }}>
                    data-designer config providers
                  </code>{" "}
                  to add API providers
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {providers.map((p) => (
                  <div
                    key={p.name}
                    className="rounded-xl border p-4"
                    style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>{p.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
                        style={{
                          background: p.api_key_set ? "var(--color-cyan-dim)" : "rgba(251,191,36,0.1)",
                          color: p.api_key_set ? "var(--color-cyan)" : "var(--color-amber)",
                        }}
                      >
                        {p.api_key_set ? "Key set" : "No key"}
                      </span>
                    </div>
                    {p.base_url && (
                      <p className="mt-1.5 truncate font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        {p.base_url as string}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Models */}
        {activeTab === "Models" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                Model Configurations
              </h3>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {models?.length ?? 0} models
              </span>
            </div>

            {!models || models.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", color: "var(--text-secondary)" }}
              >
                <p className="text-[13px] font-medium">No model configs</p>
                <p className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Run{" "}
                  <code className="rounded px-1.5 py-0.5" style={{ background: "var(--elevated)" }}>
                    data-designer config models
                  </code>{" "}
                  to configure model aliases
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {models.map((m) => (
                  <div
                    key={m.alias}
                    className="flex items-center gap-4 rounded-lg border px-4 py-3"
                    style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-sans text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>{m.alias}</div>
                      {m.model_id && (
                        <div className="truncate font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>{m.model_id}</div>
                      )}
                    </div>
                    {m.provider && (
                      <span className="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium" style={{ background: "var(--elevated)", color: "var(--text-secondary)" }}>
                        {m.provider}
                      </span>
                    )}
                    <div className="flex gap-3 font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {m.temperature != null && <span>temp {m.temperature}</span>}
                      {m.max_tokens != null && <span>max {m.max_tokens}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Datasets */}
        {activeTab === "Datasets" && (
          <div className="flex min-h-0 gap-4">
            <div className={cn("space-y-2", selectedDataset ? "w-1/2" : "w-full")}>
              <div className="flex items-center justify-between">
                <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
                  Generated Datasets
                </h3>
                <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {datasets?.length ?? 0} files
                </span>
              </div>

              {!datasets || datasets.length === 0 ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", color: "var(--text-secondary)" }}
                >
                  <p className="text-[13px] font-medium">No datasets yet</p>
                  <p className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Generated data will appear in{" "}
                    <code className="rounded px-1.5 py-0.5" style={{ background: "var(--elevated)" }}>~/.dgx-lab/designer/</code>
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
                    ✕
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

        {/* Jobs */}
        {activeTab === "Jobs" && (
          <div className="space-y-3">
            <h3 className="font-sans text-[14px] font-medium" style={{ color: "var(--foreground)" }}>
              Generation Jobs
            </h3>

            {!jobs || jobs.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", color: "var(--text-secondary)" }}
              >
                <p className="text-[13px] font-medium">No jobs</p>
                <p className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Generation jobs will appear here when started
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
                      <span className="ml-auto font-mono text-[10px] capitalize" style={{ color: "var(--text-tertiary)" }}>{j.status}</span>
                    </div>
                    {j.error && (
                      <p className="mt-1.5 font-mono text-[10px] leading-relaxed" style={{ color: "#ef4444" }}>{j.error}</p>
                    )}
                    <div className="mt-1 font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>
                      Started {fmtDate(j.started_at)}
                      {j.finished_at && <> · Finished {fmtDate(j.finished_at)}</>}
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
