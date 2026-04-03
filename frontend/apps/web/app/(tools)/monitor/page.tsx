"use client"

import { usePoll } from "@/lib/use-poll"
import { useFetch } from "@/lib/use-fetch"
import { GaugeStrip } from "@/components/monitor/gauge-strip"
import { SystemTimeline } from "@/components/monitor/system-timeline"
import { ProcessTable } from "@/components/monitor/process-table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

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

interface GpuProcess {
  pid: number
  name: string
  memory_mib: number
  memory_gb: number
  gpu_util?: number
  throughput_toks?: number
  type?: string
}

interface TimelinePoint {
  timestamp: number
  gpu_util?: number
  memory_used_gb?: number
  memory_bandwidth_gbs?: number | null
  throughput_toks?: number
}

interface SystemInfo {
  hostname?: string
  gpu_name?: string
  chip?: string
  driver_version?: string
  os_version?: string
  memory_total_gb?: number
  memory_bandwidth_max_gbs?: number
  uptime_s?: number
  disk_used_gb?: number
  disk_total_gb?: number
  network?: string
  poll_interval_ms?: number
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

function CudaKernelTimeline() {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-tight text-foreground">
          CUDA Kernel Timeline
        </h2>
      </div>
      <div className="rounded-lg border border-border-subtle bg-elevated px-4 py-8 text-center">
        <p className="text-[12px] text-text-secondary">
          Kernel timeline requires an nsys profile export.
        </p>
        <p className="mt-1 font-mono text-[10px] text-text-tertiary">
          nsys profile --output report.nsys-rep your_command
        </p>
      </div>
    </div>
  )
}

function FooterInfoBar({ info }: { info: SystemInfo }) {
  const items = [
    { label: "Host", value: info.hostname ?? "—" },
    { label: "Chip", value: info.chip ?? info.gpu_name ?? "—" },
    { label: "OS", value: info.os_version ?? "—" },
    {
      label: "Uptime",
      value: info.uptime_s ? formatUptime(info.uptime_s) : "—",
    },
    {
      label: "SSD",
      value:
        info.disk_used_gb != null && info.disk_total_gb != null
          ? `${info.disk_used_gb} / ${info.disk_total_gb} TB`
          : "—",
    },
    { label: "Network", value: info.network ?? "—" },
    {
      label: "Poll",
      value:
        info.poll_interval_ms != null
          ? `${info.poll_interval_ms}ms`
          : "2000ms",
    },
  ]

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border-subtle bg-elevated px-3 py-2 font-mono text-[10px] text-text-tertiary">
      {items.map((item) => (
        <div key={item.label}>
          <span className="text-text-dim">{item.label}</span>{" "}
          <span>{item.value}</span>
        </div>
      ))}
      <span className="ml-auto text-text-dim">DGX Lab v0.1.0</span>
    </div>
  )
}

const TAB_TRIGGER_CLASS =
  "text-[11.5px] data-active:!text-cyan after:!bg-cyan dark:data-active:!text-cyan"

export default function MonitorPage() {
  const { data: status } = usePoll<GpuStatus>("/monitor/status", 2000)
  const { data: processes } = usePoll<GpuProcess[]>("/monitor/processes", 3000)
  const { data: timeline } = usePoll<TimelinePoint[]>("/monitor/timeline", 2000)
  const { data: sysInfo } = useFetch<SystemInfo>("/monitor/system")

  const subtitleHost = sysInfo?.hostname ?? "spark-hostname"

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="monitor">
        <header className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Monitor
              </h1>
              <p className="font-mono text-[10px] text-text-tertiary">
                {subtitleHost} · GB10
              </p>
            </div>
            <TabsList variant="line" className="h-9 shrink-0">
              <TabsTrigger value="monitor" className={TAB_TRIGGER_CLASS}>
                Monitor
              </TabsTrigger>
              <TabsTrigger value="profiler" className={TAB_TRIGGER_CLASS}>
                Profiler
              </TabsTrigger>
              <TabsTrigger value="memory" className={TAB_TRIGGER_CLASS}>
                Memory
              </TabsTrigger>
              <TabsTrigger value="bandwidth" className={TAB_TRIGGER_CLASS}>
                Bandwidth
              </TabsTrigger>
              <TabsTrigger value="thermals" className={TAB_TRIGGER_CLASS}>
                Thermals
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        <TabsContent value="monitor" className="mt-6 space-y-6">
          <GaugeStrip status={status} />

          <SystemTimeline data={timeline ?? []} />

          <ProcessTable processes={processes ?? []} />

          <CudaKernelTimeline />

          {sysInfo && <FooterInfoBar info={sysInfo} />}
        </TabsContent>

        <TabsContent value="profiler">
          <div className="mt-6 py-12 text-center text-sm text-text-secondary">
            Kernel profiler data will appear here during active inference.
          </div>
        </TabsContent>

        <TabsContent value="memory">
          <div className="mt-6 py-12 text-center text-sm text-text-secondary">
            Per-process memory breakdown will appear here when GPU processes are
            active.
          </div>
        </TabsContent>

        <TabsContent value="bandwidth">
          <div className="mt-6 py-12 text-center text-sm text-text-secondary">
            Memory bandwidth analysis will appear here as data accumulates.
          </div>
        </TabsContent>

        <TabsContent value="thermals">
          <div className="mt-6 py-12 text-center text-sm text-text-secondary">
            Temperature and power history will appear here as data accumulates.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
