"use client"

import { useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface Metric {
  step: number
  loss?: number
  learning_rate?: number
  grad_norm?: number
  gpu_util?: number
  [key: string]: number | string | undefined
}

export const CHART_COLORS = ["#22d3ee", "#60a5fa", "#f59e0b", "#a78bfa", "#2dd4bf"]

function ema(data: number[], alpha: number): number[] {
  const result: number[] = []
  let prev = data[0] ?? 0
  for (const val of data) {
    prev = alpha * prev + (1 - alpha) * val
    result.push(prev)
  }
  return result
}

export function LossChart({
  runs,
  smoothing = 0.6,
}: {
  runs: { id: string; label: string; metrics: Metric[] }[]
  smoothing?: number
}) {
  const chartData = useMemo(() => {
    if (runs.length === 0) return []

    const smoothedRuns = runs.map((run) => {
      const sorted = run.metrics
        .filter((m) => m.loss != null)
        .sort((a, b) => a.step - b.step)
      const smoothed = ema(
        sorted.map((m) => m.loss!),
        smoothing,
      )
      return sorted.map((m, i) => ({ step: m.step, [run.id]: smoothed[i] }))
    })

    const stepMap = new Map<number, Record<string, number>>()
    for (const series of smoothedRuns) {
      for (const pt of series) {
        const existing = stepMap.get(pt.step) ?? { step: pt.step }
        Object.assign(existing, pt)
        stepMap.set(pt.step, existing)
      }
    }

    return Array.from(stepMap.values()).sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
  }, [runs, smoothing])

  if (runs.length === 0) {
    return (
      <div
        className="flex h-[320px] items-center justify-center font-sans text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        No metric data available
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid
            stroke="var(--border-subtle)"
            strokeDasharray="4 4"
          />
          <XAxis
            dataKey="step"
            tick={{
              fill: "var(--text-tertiary)",
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
            }}
            tickLine={{ stroke: "var(--text-tertiary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
          />
          <YAxis
            tick={{
              fill: "var(--text-tertiary)",
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
            }}
            tickLine={{ stroke: "var(--text-tertiary)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            domain={["auto", "auto"]}
            width={52}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--foreground)",
              padding: "8px 12px",
            }}
            itemStyle={{ color: "var(--foreground)" }}
            labelStyle={{
              color: "var(--text-tertiary)",
              marginBottom: 4,
              fontSize: 10,
            }}
            labelFormatter={(v) => `step ${v}`}
            formatter={(value, name) => [
              typeof value === "number" ? value.toFixed(4) : String(value ?? ""),
              String(name),
            ]}
            cursor={{ stroke: "var(--text-tertiary)", strokeDasharray: "4 4" }}
          />
          {runs.map((run, i) => (
            <Line
              key={run.id}
              type="monotone"
              dataKey={run.id}
              name={run.label}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 px-1">
        {runs.map((run, i) => (
          <div key={run.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-[3px] w-4 rounded-full"
              style={{
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {run.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
