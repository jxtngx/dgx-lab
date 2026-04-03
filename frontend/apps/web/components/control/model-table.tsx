"use client"

import { useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"

export interface ControlModel {
  id: string
  size_on_disk_gb: number
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
  status: string
  quantization_config?: Record<string, unknown> | null
  _download?: {
    status: string
    progress?: number | null
    downloaded_gb?: number
    expected_gb?: number | null
    elapsed_s?: number
  }
}

function formatId(id: string) {
  const parts = id.split("/")
  if (parts.length >= 2) return { org: parts.slice(0, -1).join("/"), name: parts.at(-1) ?? id }
  return { org: "", name: id }
}

type QColor = "cyan" | "blue" | "purple" | "teal" | "amber" | "muted"

function getQuantBadge(m: ControlModel): { label: string; color: QColor } {
  const id = m.id.toLowerCase()
  if (id.includes("q4_k_m") || id.includes("q4km")) return { label: "Q4_K_M", color: "teal" }
  if (id.includes("parquet")) return { label: "Parquet", color: "purple" }
  const raw = (m.torch_dtype ?? "").toLowerCase()
  if (raw.includes("fp4") || raw === "float4") return { label: "FP4", color: "cyan" }
  if (raw.includes("fp8") || raw.includes("float8")) return { label: "FP8", color: "blue" }
  if (raw.includes("bfloat") || raw === "bf16") return { label: "BF16", color: "purple" }
  if (raw.includes("float16") || raw === "fp16" || raw === "half") return { label: "FP16", color: "amber" }
  if (m.torch_dtype) return { label: m.torch_dtype.toUpperCase(), color: "muted" }
  return { label: "—", color: "muted" }
}

const BADGE: Record<QColor, { border: string; bg: string; fg: string }> = {
  cyan:   { border: "rgba(34,211,238,0.35)",  bg: "var(--color-cyan-dim)",   fg: "var(--color-cyan)" },
  blue:   { border: "rgba(96,165,250,0.35)",  bg: "var(--color-blue-dim)",   fg: "var(--color-blue)" },
  purple: { border: "rgba(167,139,250,0.35)", bg: "var(--color-purple-dim)", fg: "var(--color-purple)" },
  teal:   { border: "rgba(45,212,191,0.35)",  bg: "var(--color-teal-dim)",   fg: "var(--color-teal)" },
  amber:  { border: "rgba(245,158,11,0.35)",  bg: "var(--color-amber-dim)",  fg: "var(--color-amber)" },
  muted:  { border: "var(--border-subtle)",    bg: "var(--elevated)",         fg: "var(--text-secondary)" },
}

function modelIcon(m: ControlModel) {
  const arch = (m.architecture ?? "").toLowerCase()
  if (m.id.toLowerCase().endsWith(".gguf"))
    return { bg: "var(--color-teal-dim)", fg: "var(--color-teal)", glyph: "G" }
  if (arch.includes("moe") || arch.includes("mixtral"))
    return { bg: "var(--color-purple-dim)", fg: "var(--color-purple)", glyph: "M" }
  if (arch.includes("llama") || arch.includes("mistral"))
    return { bg: "var(--color-blue-dim)", fg: "var(--color-blue)", glyph: "L" }
  if (arch.includes("qwen") || arch.includes("deepseek"))
    return { bg: "var(--color-amber-dim)", fg: "var(--color-amber)", glyph: "Q" }
  return { bg: "var(--color-cyan-dim)", fg: "var(--color-cyan)", glyph: "◆" }
}

function StatusDot({ status }: { status: string }) {
  const loaded = status === "loaded"
  const cached = status === "cached"
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: 6,
        height: 6,
        background: loaded
          ? "var(--color-cyan)"
          : cached
            ? "var(--color-amber)"
            : "var(--text-tertiary)",
        boxShadow: loaded ? "0 0 10px rgba(34,211,238,0.35)" : "none",
      }}
      aria-hidden
    />
  )
}

export function ModelTable({
  models,
  selectedId,
  onSelect,
  onResume,
  gridTemplate,
  compact,
}: {
  models: ControlModel[]
  selectedId: string | null
  onSelect: (id: string) => void
  onResume?: (id: string) => void
  gridTemplate: string
  compact: boolean
}) {
  const hasAnimated = useRef(false)
  const shouldAnimate = !hasAnimated.current
  if (shouldAnimate) hasAnimated.current = true

  if (models.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg py-20 text-center"
        style={{ border: "1px dashed var(--border-subtle)", background: "rgba(22,22,25,0.4)" }}
      >
        <p className="font-sans text-[13px] font-medium text-foreground">No models match</p>
        <p
          className="max-w-sm font-mono text-[11px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Pull from the hub or import a GGUF. Cached Hugging Face repos appear here after download.
        </p>
      </div>
    )
  }

  return (
    <>
      <style>{`
@keyframes ctrlFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.model-row-idle:hover{background:var(--elevated)!important;border-color:var(--border-subtle)!important}
`}</style>
      <div>
        <div className="grid gap-x-3" style={{ gridTemplateColumns: gridTemplate }}>
          {["Model", "Size", "Quantization", "Memory Fit"].map((h) => (
            <div
              key={h}
              className="pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}
            >
              {h}
            </div>
          ))}
          <div
            className="pb-2 pt-1 text-right text-[10px] font-bold uppercase tracking-wide"
            style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}
          >
            Status
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {models.map((m, i) => {
            const { org, name } = formatId(m.id)
            const q = getQuantBadge(m)
            const b = BADGE[q.color]
            const ic = modelIcon(m)
            const sel = selectedId === m.id
            const dl = m._download
            const isDownloading = dl?.status === "downloading"
            const isInterrupted = dl?.status === "interrupted" || m.status === "interrupted"
            const pct = dl?.progress != null ? Math.min(Math.round(dl.progress * 100), 100) : null

            return (
              <div
                key={m.id}
                style={shouldAnimate ? { animation: `ctrlFadeUp 0.3s ease ${i * 0.02}s both` } : undefined}
              >
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  className={cn(
                    "grid w-full gap-x-3 rounded-lg text-left transition-colors items-center overflow-hidden",
                    !sel && "model-row-idle",
                  )}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    padding: compact ? "4px 8px" : "0 12px",
                    minHeight: compact ? undefined : 72,
                    border: isDownloading
                      ? "1px solid rgba(34,211,238,0.15)"
                      : isInterrupted
                        ? "1px solid rgba(245,158,11,0.2)"
                        : sel
                          ? "1px solid rgba(34,211,238,0.1)"
                          : "1px solid transparent",
                    background: isDownloading
                      ? "var(--color-cyan-dim)"
                      : isInterrupted
                        ? "rgba(245,158,11,0.04)"
                        : sel
                          ? "rgba(34,211,238,0.07)"
                          : undefined,
                    cursor: undefined,
                  }}
                >
                  {/* Model name cell */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="flex shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-semibold"
                      style={{
                        width: 36,
                        height: 36,
                        background: isDownloading ? "var(--color-cyan-dim)" : ic.bg,
                        color: isDownloading ? "var(--color-cyan)" : ic.fg,
                      }}
                      aria-hidden
                    >
                      {isDownloading ? "↓" : ic.glyph}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-sans text-[13px] font-semibold text-foreground">
                        {name}
                      </div>
                      {org && (
                        <div
                          className="truncate font-mono text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {org}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Size */}
                  <div
                    className="font-mono text-[11.5px] tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {isDownloading
                      ? dl.downloaded_gb != null
                        ? `${dl.downloaded_gb} GB`
                        : "—"
                      : `${m.size_on_disk_gb.toFixed(2)} GB`
                    }
                  </div>

                  {/* Quant badge */}
                  <div>
                    {isDownloading ? (
                      <span
                        className="inline-block rounded-sm font-mono text-[10px] font-bold"
                        style={{
                          padding: "2px 7px",
                          border: "1px solid rgba(34,211,238,0.35)",
                          background: "var(--color-cyan-dim)",
                          color: "var(--color-cyan)",
                        }}
                      >
                        {pct != null ? `${pct}%` : "…"}
                      </span>
                    ) : (
                      <span
                        className="inline-block rounded-sm font-mono text-[10px] font-bold"
                        style={{
                          padding: "2px 7px",
                          border: `1px solid ${b.border}`,
                          background: b.bg,
                          color: b.fg,
                        }}
                      >
                        {q.label}
                      </span>
                    )}
                  </div>

                  {/* Memory fit */}
                  <div
                    className="font-mono text-[11.5px] tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {isDownloading
                      ? dl.expected_gb != null
                        ? `${dl.expected_gb} GB`
                        : "—"
                      : m.estimated_memory_gb != null
                        ? `${m.estimated_memory_gb.toFixed(1)} GB`
                        : "—"
                    }
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-end gap-2">
                    {isDownloading ? (
                      <>
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: "var(--color-cyan)",
                            animation: "pulse-dot 2s ease infinite",
                          }}
                        />
                        <span className="font-mono text-[11px] text-cyan">
                          pulling
                        </span>
                      </>
                    ) : isInterrupted ? (
                      <>
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "var(--color-amber)" }}
                        />
                        <span className="font-mono text-[11px]" style={{ color: "var(--color-amber)" }}>
                          interrupted
                        </span>
                        {onResume && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onResume(m.id) }}
                            className="ml-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors"
                            style={{
                              background: "var(--color-cyan-dim)",
                              color: "var(--color-cyan)",
                              border: "1px solid rgba(34,211,238,0.2)",
                            }}
                          >
                            Resume
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <StatusDot status={m.status} />
                        <span
                          className="font-mono text-[11px] capitalize"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {m.status.replace("_", " ")}
                        </span>
                      </>
                    )}
                  </div>
                  {isDownloading && (
                    <div
                      className="col-span-full h-px overflow-hidden rounded-full"
                      style={{ background: "var(--active)" }}
                    >
                      <div
                        className="h-full transition-all duration-700"
                        style={{
                          width: pct != null ? `${pct}%` : "100%",
                          background: "var(--color-cyan)",
                          animation: pct == null ? "pulse-dot 2s ease infinite" : undefined,
                        }}
                      />
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
