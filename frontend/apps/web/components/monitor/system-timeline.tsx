"use client"

import { useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts"

interface TimelinePoint {
  timestamp: number
  gpu_util?: number
  memory_used_gb?: number
  memory_bandwidth_gbs?: number | null
  throughput_toks?: number
}

const TIME_RANGES = ["5s", "30s", "2m", "10m", "1h"] as const
type TimeRange = (typeof TIME_RANGES)[number]

const RANGE_MS: Record<TimeRange, number> = {
  "5s": 5_000,
  "30s": 30_000,
  "2m": 120_000,
  "10m": 600_000,
  "1h": 3_600_000,
}

const CHART_GRID = "#1a1a24"
const STROKE_CYAN = "#22d3ee"
const STROKE_BLUE = "#60a5fa"
const STROKE_AMBER = "#f59e0b"
const STROKE_PURPLE = "#a78bfa"

interface MiniChartProps {
  data: TimelinePoint[]
  dataKey: string
  label: string
  unit: string
  stroke: string
  max?: number
  annotation?: string
  referenceLine?: { y: number; label: string }
}

function MiniChart({
  data,
  dataKey,
  label,
  unit,
  stroke,
  max,
  annotation,
  referenceLine,
}: MiniChartProps) {
  const last = data.at(-1)
  const raw = last
    ? (last as unknown as Record<string, number | null | undefined>)[dataKey]
    : undefined
  const latest = typeof raw === "number" ? raw : null

  const fmtVal = (v: number) =>
    v % 1 !== 0 ? v.toFixed(1) : String(Math.round(v))

  return (
    <div className="rounded-lg border border-border-subtle bg-elevated">
      <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
          {label}
        </span>
        <span
          className="shrink-0 font-mono text-xs tabular-nums"
          style={{ color: stroke }}
        >
          {latest != null ? `${fmtVal(latest)} ${unit}` : "—"}
        </span>
      </div>

      {(annotation || referenceLine) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-1">
          {annotation && (
            <span className="font-mono text-[9px] text-text-dim">
              {annotation}
            </span>
          )}
          {referenceLine && (
            <span className="font-mono text-[9px] text-text-dim">
              {referenceLine.label}
            </span>
          )}
        </div>
      )}

      <div className="px-1 pb-2">
        <ResponsiveContainer width="100%" height={60}>
          <LineChart
            data={data}
            margin={{ top: 2, right: 8, bottom: 0, left: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_GRID}
              vertical={false}
            />
            <XAxis dataKey="timestamp" hide />
            <YAxis hide domain={[0, max ?? "auto"]} />

            {referenceLine && (
              <ReferenceLine
                y={referenceLine.y}
                stroke="#3a3848"
                strokeDasharray="4 3"
                strokeOpacity={0.9}
              />
            )}

            <Tooltip
              contentStyle={{
                backgroundColor: "#0f0f12",
                border: "1px solid #1a1a24",
                borderRadius: 6,
                fontSize: 10,
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                color: "#e8e6e3",
                padding: "4px 8px",
              }}
              labelFormatter={() => ""}
              formatter={(value) => {
                const v = typeof value === "number" ? value : Number(value ?? 0)
                return [
                  `${v % 1 !== 0 ? v.toFixed(1) : v} ${unit}`,
                  label,
                ]
              }}
              cursor={{ stroke: "#5a5868", strokeWidth: 1 }}
            />

            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function SystemTimeline({ data }: { data: TimelinePoint[] }) {
  const [range, setRange] = useState<TimeRange>("30s")

  const now = Date.now()
  const windowMs = RANGE_MS[range]
  const filtered = data.filter((d) => d.timestamp >= now - windowMs)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-tight text-foreground">
          System Timeline
        </h2>
        <div className="flex flex-wrap gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] transition-colors ${
                range === r
                  ? "bg-cyan/15 text-cyan ring-1 ring-cyan/40"
                  : "bg-elevated text-text-secondary hover:bg-hover hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-secondary">
          Waiting for data…
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <MiniChart
            data={filtered}
            dataKey="gpu_util"
            label="GPU Compute Utilization"
            unit="%"
            stroke={STROKE_CYAN}
            max={100}
          />
          <MiniChart
            data={filtered}
            dataKey="memory_used_gb"
            label="Unified Memory Usage"
            unit="GB"
            stroke={STROKE_BLUE}
            max={128}
            annotation="model load"
          />
          <MiniChart
            data={filtered}
            dataKey="memory_bandwidth_gbs"
            label="Memory Bandwidth"
            unit="GB/s"
            stroke={STROKE_AMBER}
            max={300}
            referenceLine={{ y: 273, label: "273 GB/s ceiling" }}
          />
          <MiniChart
            data={filtered}
            dataKey="throughput_toks"
            label="Inference Throughput"
            unit="tok/s"
            stroke={STROKE_PURPLE}
            annotation="server start"
          />
        </div>
      )}
    </div>
  )
}
