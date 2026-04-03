"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { AgentSheet } from "@/components/agent-sheet"
import { StatusBar } from "@/components/status-bar"
import { SettingsProvider } from "@/lib/settings-context"
import { usePoll } from "@/lib/use-poll"

interface GpuStatus {
  available: boolean
  gpu_util?: number
  memory_used_gb?: number
  memory_total_gb?: number
  temperature_c?: number
  power_draw_w?: number
}

const toolNames: Record<string, string> = {
  "/control": "Models",
  "/datasets": "Datasets",
  "/designer": "Data Designer",
  "/curator": "Data Curator",
  "/automodel": "AutoModel",
  "/logger": "Logger",
  "/traces": "Agent Traces",
  "/monitor": "Monitor",
  "/agents": "Cursor Traces",
  "/claude-traces": "Claude Traces",
}

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: status } = usePoll<GpuStatus>("/monitor/status", 5000)
  const toolName = Object.entries(toolNames).find(([k]) => pathname.startsWith(k))?.[1] ?? "DGX Lab"
  const [agentOpen, setAgentOpen] = useState(false)

  return (
    <SettingsProvider>
      <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--background)" }}>
        {/* Titlebar */}
        <div
          className="flex h-[52px] shrink-0 items-center gap-3 px-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <span className="text-[13px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text-secondary)" }}>
            {toolName}
          </span>

          {/* Live badge */}
          {status?.available && (
            <div
              className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{
                background: "var(--color-cyan-dim)",
                border: "1px solid rgba(34,211,238,0.2)",
              }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--color-cyan)",
                  animation: "pulse-dot 2s ease infinite",
                }}
              />
              <span className="font-mono text-[11px] font-medium" style={{ color: "var(--color-cyan)" }}>
                DGX Spark
              </span>
            </div>
          )}

          {/* Stats */}
          {status?.available && (
            <div className="flex gap-4 ml-4 font-mono text-[10.5px]" style={{ color: "var(--text-tertiary)" }}>
              <span>
                GPU <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{status.gpu_util ?? 0}%</span>
              </span>
              <span>
                MEM{" "}
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                  {status.memory_used_gb ?? 0} / {status.memory_total_gb ?? 128} GB
                </span>
              </span>
              <span>
                TEMP <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{status.temperature_c ?? 0}°C</span>
              </span>
              <span>
                PWR <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{status.power_draw_w ?? 0}W</span>
              </span>
            </div>
          )}

          {/* Agent button */}
          <button
            type="button"
            onClick={() => setAgentOpen(true)}
            className={`${status?.available ? "" : "ml-auto "}inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-mono text-[11px] font-semibold transition-colors`}
            style={{
              background: "var(--color-purple-dim)",
              border: "1px solid rgba(167,139,250,0.3)",
              color: "var(--color-purple)",
            }}
          >
            AGENT
          </button>
        </div>

        <AgentSheet open={agentOpen} onOpenChange={setAgentOpen} />

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-auto">{children}</main>
            <StatusBar />
          </div>
        </div>
      </div>
    </SettingsProvider>
  )
}
