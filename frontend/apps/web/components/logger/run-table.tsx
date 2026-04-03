"use client"

import { useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

interface Run {
  id: string
  name?: string
  status: string
  config: Record<string, unknown> | null
  best_loss: number | null
  best_loss_step: number | null
  eval_acc?: number | null
  total_steps?: number | null
  duration?: string | null
  checkpoints: number
  artifacts?: number
  hash?: string
}

interface Metric {
  step: number
  loss?: number
  [key: string]: number | string | undefined
}

const SPARKLINE_COLORS = [
  "#22d3ee",
  "#60a5fa",
  "#f59e0b",
  "#a78bfa",
  "#2dd4bf",
]

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const map: Record<string, { bg: string; fg: string; pulse?: boolean }> = {
    complete: { bg: "var(--color-cyan-dim)", fg: "var(--color-cyan)" },
    running: {
      bg: "var(--color-blue-dim)",
      fg: "var(--color-blue)",
      pulse: true,
    },
    oom: { bg: "var(--color-red-dim)", fg: "var(--color-red)" },
    failed: { bg: "var(--color-red-dim)", fg: "var(--color-red)" },
    warning: { bg: "var(--color-amber-dim)", fg: "var(--color-amber)" },
  }

  const v = map[s]
  if (!v) {
    return (
      <span
        className="inline-flex rounded-full px-2 py-0.5 font-mono text-[11px]"
        style={{ background: "var(--elevated)", color: "var(--text-secondary)" }}
      >
        {status}
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium"
      style={{ background: v.bg, color: v.fg }}
    >
      {v.pulse && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: v.fg }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: v.fg }}
          />
        </span>
      )}
      {status}
    </span>
  )
}

function Sparkline({
  data,
  color,
  width = 72,
  height = 24,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length < 2) {
    return (
      <span
        className="font-mono text-[11px]"
        style={{ color: "var(--text-tertiary)" }}
      >
        —
      </span>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - pad * 2) + pad
      const y = height - pad - ((v - min) / range) * (height - pad * 2)
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatConfig(config: Record<string, unknown> | null) {
  if (!config || Object.keys(config).length === 0) return "—"
  return Object.entries(config)
    .slice(0, 6)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ")
}

function stepsCell(r: Run) {
  const cur = r.best_loss_step
  const tot = r.total_steps
  if (cur != null && tot != null) return `${cur}/${tot}`
  if (tot != null) return `—/${tot}`
  if (cur != null) return `${cur}/—`
  return "—"
}

const TH_CLASS =
  "h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wider whitespace-nowrap"

export function RunTable({
  runs,
  selectedIds,
  onToggle,
  metricsMap = {},
}: {
  runs: Run[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  metricsMap?: Record<string, Metric[]>
}) {
  const sparklineData = useMemo(() => {
    const result: Record<string, number[]> = {}
    for (const run of runs) {
      const metrics = metricsMap[run.id]
      if (!metrics?.length) continue
      const sorted = [...metrics]
        .filter((m) => m.loss != null)
        .sort((a, b) => a.step - b.step)
      const step = Math.max(1, Math.floor(sorted.length / 40))
      result[run.id] = sorted
        .filter((_, i) => i % step === 0)
        .map((m) => m.loss!)
    }
    return result
  }, [runs, metricsMap])

  if (runs.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-16 font-sans text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        <p>No runs for this experiment.</p>
        <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          Select another experiment or start a new run.
        </p>
      </div>
    )
  }

  return (
    <Table className="min-w-[960px]">
      <TableHeader>
        <TableRow
          className="border-border-subtle hover:bg-transparent"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <TableHead
            className={cn(TH_CLASS, "w-8")}
            style={{ color: "var(--text-tertiary)" }}
          />
          <TableHead
            className={TH_CLASS}
            style={{ color: "var(--text-tertiary)" }}
          >
            Run
          </TableHead>
          <TableHead
            className={TH_CLASS}
            style={{ color: "var(--text-tertiary)" }}
          >
            Status
          </TableHead>
          <TableHead
            className={cn(TH_CLASS, "text-right")}
            style={{ color: "var(--text-tertiary)" }}
          >
            Best Loss
          </TableHead>
          <TableHead
            className={cn(TH_CLASS, "text-right")}
            style={{ color: "var(--text-tertiary)" }}
          >
            Eval Acc
          </TableHead>
          <TableHead
            className={cn(TH_CLASS, "text-right")}
            style={{ color: "var(--text-tertiary)" }}
          >
            Steps
          </TableHead>
          <TableHead
            className={TH_CLASS}
            style={{ color: "var(--text-tertiary)" }}
          >
            Loss Curve
          </TableHead>
          <TableHead
            className={TH_CLASS}
            style={{ color: "var(--text-tertiary)" }}
          >
            Duration
          </TableHead>
          <TableHead
            className={TH_CLASS}
            style={{ color: "var(--text-tertiary)" }}
          >
            Config
          </TableHead>
          <TableHead
            className={cn(TH_CLASS, "text-right")}
            style={{ color: "var(--text-tertiary)" }}
          >
            Artifacts
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r, idx) => {
          const selected = selectedIds.has(r.id)
          const sparkline = sparklineData[r.id]
          return (
            <TableRow
              key={r.id}
              onClick={() => onToggle(r.id)}
              className={cn(
                "cursor-pointer transition-colors",
                selected ? "bg-active" : "hover:bg-hover/80",
              )}
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <TableCell className="w-8 px-3 py-2">
                <button
                  type="button"
                  aria-label={selected ? "Deselect run" : "Select run"}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(r.id)
                  }}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    selected
                      ? "border-cyan/50 bg-cyan-dim"
                      : "border-border-subtle bg-transparent hover:border-text-tertiary",
                  )}
                >
                  {selected && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M2 5L4 7L8 3"
                        stroke="#22d3ee"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </TableCell>

              <TableCell className="px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span
                    className="truncate font-mono text-[12px] font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {r.name ?? r.id}
                  </span>
                  {r.hash && (
                    <span
                      className="truncate font-mono text-[11px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {r.hash}
                    </span>
                  )}
                </div>
              </TableCell>

              <TableCell className="px-3 py-2">
                <StatusBadge status={r.status} />
              </TableCell>

              <TableCell className="px-3 py-2 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className="font-mono text-[12px] tabular-nums"
                    style={{ color: "var(--foreground)" }}
                  >
                    {r.best_loss != null ? r.best_loss.toFixed(4) : "—"}
                  </span>
                  {r.best_loss_step != null && (
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      step {r.best_loss_step}
                    </span>
                  )}
                </div>
              </TableCell>

              <TableCell
                className="px-3 py-2 text-right font-mono text-[12px] tabular-nums"
                style={{ color: "var(--foreground)" }}
              >
                {r.eval_acc != null
                  ? `${(r.eval_acc * 100).toFixed(1)}%`
                  : "—"}
              </TableCell>

              <TableCell
                className="px-3 py-2 text-right font-mono text-[12px] tabular-nums"
                style={{ color: "var(--text-secondary)" }}
              >
                {stepsCell(r)}
              </TableCell>

              <TableCell className="px-3 py-2">
                {sparkline ? (
                  <Sparkline
                    data={sparkline}
                    color={SPARKLINE_COLORS[idx % SPARKLINE_COLORS.length] ?? "var(--color-cyan)"}
                  />
                ) : (
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    —
                  </span>
                )}
              </TableCell>

              <TableCell
                className="px-3 py-2 font-mono text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {r.duration ?? "—"}
              </TableCell>

              <TableCell
                className="max-w-[200px] truncate px-3 py-2 font-mono text-[11px]"
                style={{ color: "var(--text-tertiary)" }}
                title={formatConfig(r.config)}
              >
                {formatConfig(r.config)}
              </TableCell>

              <TableCell
                className="px-3 py-2 text-right font-mono text-[12px] tabular-nums"
                style={{ color: "var(--text-secondary)" }}
              >
                {r.checkpoints}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
