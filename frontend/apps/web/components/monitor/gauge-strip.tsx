"use client"

interface GpuStatus {
  available: boolean
  gpu_name?: string
  gpu_util?: number
  memory_used_gb?: number
  memory_total_gb?: number
  temperature_c?: number
  power_draw_w?: number
  power_limit_w?: number
  memory_bandwidth_gbs?: number | null
  memory_bandwidth_max_gbs?: number
  tensor_tops?: number
  tensor_max_tops?: number
}

interface Gauge {
  label: string
  value: number
  max: number
  unit: string
  sublabel?: string
}

function tierColor(pct: number): { text: string; bar: string; glow: string } {
  if (pct > 90)
    return {
      text: "#ef4444",
      bar: "#ef4444",
      glow: "0 0 6px rgba(239,68,68,0.3)",
    }
  if (pct > 75)
    return {
      text: "#f59e0b",
      bar: "#f59e0b",
      glow: "0 0 6px rgba(245,158,11,0.3)",
    }
  return {
    text: "#22d3ee",
    bar: "#22d3ee",
    glow: "0 0 6px rgba(34,211,238,0.25)",
  }
}

function fmt(v: number) {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

function GaugeCard({ label, value, max, unit, sublabel }: Gauge) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const tier = tierColor(pct)

  return (
    <div className="rounded-md border border-border-subtle bg-elevated p-3 transition-colors hover:bg-hover">
      <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-text-tertiary">
        {label}
      </p>

      <p
        className="mt-2 font-mono leading-none tabular-nums"
        style={{ fontSize: 26, fontWeight: 700, color: tier.text }}
      >
        {fmt(value)}
        <span className="ml-1 text-xs font-normal text-text-secondary">
          {unit}
        </span>
      </p>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-active">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: tier.bar,
            boxShadow: tier.glow,
          }}
        />
      </div>

      {sublabel && (
        <p className="mt-1.5 font-mono text-[10px] leading-none text-text-tertiary">
          {sublabel}
        </p>
      )}
    </div>
  )
}

export function GaugeStrip({ status }: { status: GpuStatus | null }) {
  if (!status || !status.available) {
    return (
      <div className="py-8 text-center text-sm text-text-secondary">
        GPU not available — nvidia-smi not found or not responding.
      </div>
    )
  }

  const gauges: Gauge[] = [
    {
      label: "GPU Compute",
      value: status.gpu_util ?? 0,
      max: 100,
      unit: "%",
      sublabel: "Blackwell SM",
    },
    {
      label: "Unified Memory",
      value: status.memory_used_gb ?? 0,
      max: status.memory_total_gb ?? 128,
      unit: "GB",
      sublabel: `/ ${status.memory_total_gb ?? 128} GB`,
    },
    {
      label: "Mem Bandwidth",
      value: status.memory_bandwidth_gbs ?? 0,
      max: status.memory_bandwidth_max_gbs ?? 273,
      unit: "GB/s",
      sublabel: `/ ${status.memory_bandwidth_max_gbs ?? 273} GB/s`,
    },
    {
      label: "GPU Temperature",
      value: status.temperature_c ?? 0,
      max: 95,
      unit: "°C",
      sublabel: "throttle: 95°C",
    },
    {
      label: "Power Draw",
      value: status.power_draw_w ?? 0,
      max: status.power_limit_w ?? 120,
      unit: "W",
      sublabel: `TDP: ${status.power_limit_w ?? 120}W`,
    },
    {
      label: "Tensor Core · FP4",
      value: status.tensor_tops ?? 0,
      max: status.tensor_max_tops ?? 1000,
      unit: "TOPS",
      sublabel: "/ 1000 TOPS",
    },
  ]

  return (
    <div className="grid grid-cols-6 gap-3">
      {gauges.map((g) => (
        <GaugeCard key={g.label} {...g} />
      ))}
    </div>
  )
}
