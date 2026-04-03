"use client"

import { usePoll } from "@/lib/use-poll"

interface GpuStatus {
  available: boolean
  gpu_util?: number
  memory_used_gb?: number
  memory_total_gb?: number
  temperature_c?: number
  power_draw_w?: number
}

export function StatusBar() {
  const { data: status } = usePoll<GpuStatus>("/monitor/status", 5000)
  const temp = status?.temperature_c ?? 0
  const tempPct = Math.min((temp / 95) * 100, 100)

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-4 px-4 font-mono text-[10px]"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", color: "var(--text-tertiary)" }}
    >
      {status?.available ? (
        <>
          <span>
            MEM{" "}
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
              {status.memory_used_gb ?? 0} / {status.memory_total_gb ?? 128} GB
            </span>
          </span>
          <span className="h-3 w-px" style={{ background: "var(--border)" }} />
          <div className="flex items-center gap-1">
            <span>{temp}°C</span>
            <div className="h-1 w-10 overflow-hidden rounded-sm" style={{ background: "var(--active)" }}>
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${tempPct}%`,
                  background: "linear-gradient(90deg, var(--color-cyan), var(--color-amber))",
                }}
              />
            </div>
          </div>
          <span className="h-3 w-px" style={{ background: "var(--border)" }} />
          {/* GPU mini chart */}
          <div className="flex items-end gap-px" style={{ height: 14 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-t-sm"
                style={{
                  height: `${4 + Math.random() * 10}px`,
                  background: "var(--color-cyan)",
                  opacity: 0.5 + Math.random() * 0.4,
                }}
              />
            ))}
          </div>
          <span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{status.gpu_util ?? 0}%</span> GPU
          </span>
        </>
      ) : (
        <span>GPU not detected</span>
      )}
      <span className="ml-auto">DGX Lab v0.1.0</span>
    </div>
  )
}
