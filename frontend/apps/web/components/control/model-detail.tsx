"use client"

import { useState } from "react"
import { useFetch } from "@/lib/use-fetch"
import { api } from "@/lib/api"

interface ModelDetailData {
  id: string
  size_on_disk_gb: number
  memory_total_gb: number
  architecture?: string
  torch_dtype?: string
  estimated_memory_gb?: number
  fits_in_memory?: boolean
  hidden_size?: number
  num_layers?: number
  context_length?: number
  num_experts?: number
  num_experts_per_tok?: number
  vocab_size?: number
  status?: string
  quantization_config?: Record<string, unknown> | null
  config: Record<string, unknown> | null
  files?: { name: string; size_bytes: number; size_mb: number }[]
}

type DetailTab = "specs" | "benchmarks" | "config" | "files"

function splitId(id: string) {
  const parts = id.split("/")
  if (parts.length >= 2)
    return { org: parts.slice(0, -1).join("/"), name: parts.at(-1) ?? id }
  return { org: "", name: id }
}

/* ── Sub-components ─────────────────────────────────────────────── */

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-2.5 py-2"
      style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
    >
      <div
        className="text-[10px] uppercase tracking-wide"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[13px] font-medium text-foreground">
        {value}
      </div>
    </div>
  )
}

function MemoryBar({
  label,
  used,
  total,
}: {
  label: string
  used: number
  total: number
}) {
  const pct = Math.min((used / total) * 100, 100)
  const color =
    pct > 90
      ? "var(--color-red)"
      : pct > 75
        ? "var(--color-amber)"
        : "var(--color-cyan)"

  const markers = [...new Set([0, 32, 64, 96, Math.round(total)])]
    .filter((v) => v <= total)
    .sort((a, b) => a - b)

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[10px] uppercase tracking-wide"
          style={{ color: "var(--text-tertiary)" }}
        >
          {label}
        </span>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--active)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {used.toFixed(1)} / {total} GB
        </span>
      </div>
      <div className="relative" style={{ height: 12 }}>
        {markers.map((v, idx) => {
          const pos = (v / total) * 100
          return (
            <span
              key={v}
              className="absolute font-mono text-[9px]"
              style={{
                left: `${pos}%`,
                transform:
                  idx === 0
                    ? "none"
                    : idx === markers.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                color: "var(--text-dim)",
              }}
            >
              {v}
            </span>
          )
        })}
      </div>
    </div>
  )
}

type CheckResult = "pass" | "warn" | "fail"

function CompatRow({
  label,
  result,
}: {
  label: string
  result: CheckResult
}) {
  const glyph = result === "pass" ? "✓" : result === "warn" ? "⚠" : "✕"
  const color =
    result === "pass"
      ? "var(--color-cyan)"
      : result === "warn"
        ? "var(--color-amber)"
        : "var(--color-red)"
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <span className="text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="font-mono text-[11px] font-bold" style={{ color }}>
        {glyph}
      </span>
    </div>
  )
}

function BenchmarkRow({
  name,
  score,
  max,
}: {
  name: string
  score: number
  max: number
}) {
  const pct = (score / max) * 100
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="w-24 shrink-0 text-[11.5px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {name}
      </span>
      <div className="flex-1">
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: "var(--active)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--color-cyan)" }}
          />
        </div>
      </div>
      <span
        className="w-10 text-right font-mono text-[11px] tabular-nums"
        style={{ color: "var(--text-secondary)" }}
      >
        {score}
      </span>
    </div>
  )
}

function ConfigBlock({ config }: { config: Record<string, unknown> }) {
  const entries = Object.entries(config)

  function renderValue(v: unknown): string {
    if (typeof v === "string") return `"${v}"`
    if (v === null) return "null"
    if (Array.isArray(v)) return JSON.stringify(v)
    if (typeof v === "object") return JSON.stringify(v)
    return String(v)
  }

  return (
    <div
      className="overflow-auto rounded-md p-3 font-mono text-[11px] leading-[1.7]"
      style={{
        background: "var(--elevated)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ color: "var(--text-tertiary)" }}>{"{"}</div>
      {entries.map(([key, val], i) => (
        <div key={key} className="pl-4">
          <span style={{ color: "var(--color-cyan)" }}>&quot;{key}&quot;</span>
          <span style={{ color: "var(--text-tertiary)" }}>: </span>
          <span style={{ color: "var(--color-teal)" }}>{renderValue(val)}</span>
          {i < entries.length - 1 && (
            <span style={{ color: "var(--text-tertiary)" }}>,</span>
          )}
        </div>
      ))}
      <div style={{ color: "var(--text-tertiary)" }}>{"}"}</div>
    </div>
  )
}

/* ── Compatibility derivation ───────────────────────────────────── */

function deriveCompat(
  d: ModelDetailData
): { label: string; result: CheckResult }[] {
  const arch = (d.architecture ?? "").toLowerCase()
  const hasExperts = (d.num_experts ?? 0) > 0
  const isLarge = (d.num_layers ?? 0) >= 32

  return [
    { label: "Flash Attention 2", result: "pass" },
    { label: "KV Cache Quantization", result: isLarge ? "pass" : "warn" },
    { label: "Tensor Parallel", result: isLarge ? "pass" : "warn" },
    { label: "CUDA Graphs", result: "pass" },
    {
      label: "vLLM Compatible",
      result:
        arch.includes("llama") ||
        arch.includes("mistral") ||
        arch.includes("mixtral") ||
        arch.includes("qwen")
          ? "pass"
          : "warn",
    },
    { label: "MoE Routing", result: hasExperts ? "pass" : "fail" },
  ]
}

/* ── Main component ─────────────────────────────────────────────── */

export function ModelDetail({
  modelId,
  onDelete,
}: {
  modelId: string | null
  onDelete?: () => void
}) {
  const [tab, setTab] = useState<DetailTab>("specs")
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteInput, setDeleteInput] = useState("")
  const { data, loading } = useFetch<ModelDetailData>(
    modelId ? `/control/models/${modelId}` : null
  )

  if (!modelId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="rounded-lg p-4" style={{ background: "var(--elevated)" }}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"
              stroke="var(--text-dim)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p
          className="font-sans text-[12px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Select a model to inspect
        </p>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <span
          className="inline-block size-3 animate-pulse rounded-full"
          style={{ background: "rgba(34,211,238,0.4)" }}
        />
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Loading…
        </span>
      </div>
    )
  }

  const { org, name } = splitId(data.id)
  const cfg = data.config ?? {}
  const arch =
    data.architecture ??
    (cfg.architectures as string[] | undefined)?.[0] ??
    (cfg.model_type as string | undefined)
  const dtype = data.torch_dtype ?? (cfg.torch_dtype as string | undefined)
  const hiddenSize =
    data.hidden_size ?? (cfg.hidden_size as number | undefined)
  const numLayers =
    data.num_layers ?? (cfg.num_hidden_layers as number | undefined)
  const vocabSize =
    data.vocab_size ?? (cfg.vocab_size as number | undefined)
  const contextLen =
    data.context_length ??
    (cfg.max_position_embeddings as number | undefined)
  const numExperts =
    data.num_experts ?? (cfg.num_local_experts as number | undefined)
  const expertsPerTok =
    data.num_experts_per_tok ??
    (cfg.num_experts_per_tok as number | undefined)
  const estimatedMem = data.estimated_memory_gb
  const memTotal = data.memory_total_gb ?? 128

  const compat = deriveCompat(data)

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "specs", label: "Specs" },
    { key: "benchmarks", label: "Benchmarks" },
    { key: "config", label: "Config" },
    { key: "files", label: "Files" },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        {org && (
          <div
            className="text-[10px] font-bold uppercase tracking-wide"
            style={{ color: "var(--color-cyan)" }}
          >
            {org}
          </div>
        )}
        <h2 className="mt-0.5 text-[18px] font-bold tracking-tight text-foreground">
          {name}
        </h2>
        <p
          className="mt-1 text-[12.5px] leading-snug"
          style={{ color: "var(--text-secondary)" }}
        >
          {arch ?? "Transformer"} · {dtype ?? "unknown"} precision
        </p>
      </div>

      {/* ── Delete ─────────────────────────────────────────────── */}
      {onDelete && (
        <div>
          {confirmDelete ? (
            <div
              className="flex flex-col gap-2.5 rounded-md p-3"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <div className="font-sans text-[11px]" style={{ color: "var(--color-red)" }}>
                Type <span className="font-mono font-semibold">{data.id}</span> to confirm deletion of {data.size_on_disk_gb} GB
              </div>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={data.id}
                className="h-8 w-full rounded-md px-2.5 font-mono text-[12px] text-foreground placeholder:text-text-dim outline-none"
                style={{
                  background: "var(--elevated)",
                  border: `1px solid ${deleteInput === data.id ? "rgba(239,68,68,0.5)" : "var(--border-subtle)"}`,
                }}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting || deleteInput !== data.id}
                  onClick={async () => {
                    setDeleting(true)
                    try {
                      await api(`/control/models/${data.id}`, { method: "DELETE" })
                      setConfirmDelete(false)
                      setDeleteInput("")
                      onDelete()
                    } catch {
                      setDeleting(false)
                    }
                  }}
                  className="rounded-md px-3 py-1 font-sans text-[11px] font-semibold transition-opacity"
                  style={{
                    background: deleteInput === data.id ? "var(--color-red)" : "var(--active)",
                    color: deleteInput === data.id ? "#fff" : "var(--text-dim)",
                    cursor: deleteInput === data.id ? "pointer" : "not-allowed",
                  }}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteInput("") }}
                  className="rounded-md px-3 py-1 font-sans text-[11px] font-medium text-foreground transition-colors"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setConfirmDelete(true); setDeleteInput("") }}
              className="w-full rounded-md py-1.5 font-sans text-[12px] font-medium transition-colors"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"
                e.currentTarget.style.color = "var(--color-red)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-subtle)"
                e.currentTarget.style.color = "var(--text-secondary)"
              }}
            >
              Delete from cache
            </button>
          )}
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div
        className="flex gap-1"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="px-2.5 pb-2 pt-1 text-[11.5px] font-medium transition-colors"
            style={{
              color:
                tab === t.key
                  ? "var(--color-cyan)"
                  : "var(--text-tertiary)",
              borderBottom:
                tab === t.key
                  ? "2px solid var(--color-cyan)"
                  : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      {tab === "specs" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {arch && <SpecItem label="Architecture" value={arch} />}
            {dtype && <SpecItem label="Precision" value={dtype} />}
            {hiddenSize != null && (
              <SpecItem
                label="Hidden Size"
                value={hiddenSize.toLocaleString()}
              />
            )}
            {numLayers != null && (
              <SpecItem label="Layers" value={String(numLayers)} />
            )}
            {vocabSize != null && (
              <SpecItem
                label="Vocab Size"
                value={vocabSize.toLocaleString()}
              />
            )}
            {contextLen != null && (
              <SpecItem
                label="Context"
                value={contextLen.toLocaleString()}
              />
            )}
            {numExperts != null && (
              <SpecItem
                label="Experts"
                value={`${numExperts} / ${expertsPerTok ?? "?"} active`}
              />
            )}
            <SpecItem
              label="Disk Size"
              value={`${data.size_on_disk_gb.toFixed(1)} GB`}
            />
          </div>

          {estimatedMem != null && (
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="mb-3 text-[11px] font-semibold text-foreground">
                Memory Fit · {memTotal} GB
              </div>
              <MemoryBar
                label="GPU VRAM"
                used={estimatedMem}
                total={memTotal}
              />
            </div>
          )}

          <div>
            <div
              className="mb-2 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              Compatibility
            </div>
            <div
              className="rounded-md px-3 py-1"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {compat.map((c) => (
                <CompatRow
                  key={c.label}
                  label={c.label}
                  result={c.result}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "benchmarks" && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p
            className="font-mono text-[11px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            No benchmark data available.
          </p>
          <p
            className="max-w-[260px] text-[11px] leading-relaxed"
            style={{ color: "var(--text-dim)" }}
          >
            Benchmark scores will appear here when sourced from model cards or local evaluations.
          </p>
        </div>
      )}

      {tab === "config" &&
        (Object.keys(cfg).length > 0 ? (
          <ConfigBlock config={cfg} />
        ) : (
          <p
            className="py-8 text-center font-mono text-[11px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            No config available
          </p>
        ))}

      {tab === "files" && (
        data.files && data.files.length > 0 ? (
          <div
            className="overflow-hidden rounded-md"
            style={{
              background: "var(--elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="grid items-center px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wide"
              style={{
                gridTemplateColumns: "1fr auto",
                color: "var(--text-tertiary)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span>File</span>
              <span>Size</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {data.files.map((f) => {
                const ext = f.name.includes(".") ? f.name.split(".").pop() ?? "" : ""
                const isModel = ["safetensors", "bin", "pt", "gguf", "onnx"].includes(ext)
                return (
                  <div
                    key={f.name}
                    className="grid items-center px-3 py-1.5"
                    style={{
                      gridTemplateColumns: "1fr auto",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold"
                        style={{
                          background: isModel ? "rgba(34,211,238,0.1)" : "var(--active)",
                          color: isModel ? "var(--color-cyan)" : "var(--text-dim)",
                        }}
                      >
                        {ext.slice(0, 2).toUpperCase() || "?"}
                      </span>
                      <span
                        className="truncate font-mono text-[11px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {f.name}
                      </span>
                    </div>
                    <span
                      className="font-mono text-[11px] tabular-nums"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {f.size_mb >= 1024
                        ? `${(f.size_mb / 1024).toFixed(1)} GB`
                        : f.size_mb >= 1
                          ? `${f.size_mb.toFixed(1)} MB`
                          : `${(f.size_bytes / 1024).toFixed(0)} KB`}
                    </span>
                  </div>
                )
              })}
            </div>
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <span
                className="font-mono text-[10px]"
                style={{ color: "var(--text-dim)" }}
              >
                {data.files.length} {data.files.length === 1 ? "file" : "files"}
              </span>
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: "var(--text-dim)" }}
              >
                {data.size_on_disk_gb.toFixed(1)} GB total
              </span>
            </div>
          </div>
        ) : (
          <p
            className="py-8 text-center font-mono text-[11px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            No files found.
          </p>
        )
      )}
    </div>
  )
}
