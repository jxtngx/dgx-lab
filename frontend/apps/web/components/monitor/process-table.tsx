"use client"

interface GpuProcess {
  pid: number
  name: string
  memory_mib: number
  memory_gb: number
  gpu_util?: number
  throughput_toks?: number
  type?: string
}

function utilColor(pct: number): string {
  if (pct > 90) return "#ef4444"
  if (pct > 75) return "#f59e0b"
  return "#22d3ee"
}

function fmtMem(gb: number) {
  return gb % 1 === 0 ? `${gb}` : gb.toFixed(1)
}

const COL_GRID = "grid-cols-[minmax(0,1fr)_4rem_3.5rem_4rem_4rem]"

export function ProcessTable({ processes }: { processes: GpuProcess[] }) {
  const count = processes.length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-tight text-foreground">
          GPU Processes
        </h2>
        <span className="rounded-full bg-cyan/10 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-cyan ring-1 ring-cyan/25">
          {count} active
        </span>
      </div>

      {count === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-elevated py-8 text-center text-sm text-text-secondary">
          No GPU processes running.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-elevated">
          <div
            className={`grid ${COL_GRID} gap-x-2 border-b border-border-subtle px-3 py-1.5`}
            role="row"
          >
            {["Process", "PID", "GPU %", "Memory", "Tok/s"].map((h) => (
              <span
                key={h}
                className={`text-[10px] font-bold uppercase tracking-wide text-text-tertiary ${
                  h !== "Process" ? "text-right" : ""
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          <div className="divide-y divide-border-subtle">
            {processes.map((p) => {
              const gpu = p.gpu_util ?? 0
              return (
                <div
                  key={p.pid}
                  className={`grid ${COL_GRID} items-center gap-x-2 px-3 py-1.5 transition-colors hover:bg-hover/60`}
                  role="row"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px] leading-tight text-foreground">
                      {p.name}
                    </p>
                    {p.type && (
                      <p className="mt-0.5 font-mono text-[10px] leading-tight text-text-tertiary">
                        {p.type}
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums text-text-secondary">
                    {p.pid}
                  </div>
                  <div
                    className="text-right font-mono text-xs tabular-nums"
                    style={{ color: utilColor(gpu) }}
                  >
                    {gpu}%
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums text-text-secondary">
                    {fmtMem(p.memory_gb)} GB
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums text-text-secondary">
                    {p.throughput_toks != null ? p.throughput_toks : "—"}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
