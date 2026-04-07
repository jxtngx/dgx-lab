"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSettings } from "@/lib/settings-context"
import { SidebarAccount } from "@/components/sidebar-account"

interface SidebarItem {
  href: string
  label: string
  icon: string
  optional?: boolean
  settingsKey?: string
}

const sections: { title: string; items: SidebarItem[] }[] = [
  {
    title: "Model Ops",
    items: [
      { href: "/control", label: "Models", icon: "⊞" },
      { href: "/automodel", label: "AutoModel", icon: "△" },
      { href: "/logger", label: "Logger", icon: "◈" },
    ],
  },
  {
    title: "Data Ops",
    items: [
      { href: "/datasets", label: "Datasets", icon: "◆" },
      { href: "/designer", label: "Data Designer", icon: "◇" },
      { href: "/curator", label: "Data Curator", icon: "▣" },
    ],
  },
  {
    title: "Traces",
    items: [
      { href: "/traces", label: "Traces", icon: "⬡" },
      { href: "/agents", label: "Cursor Traces", icon: "◎", optional: true, settingsKey: "agent-viewer" },
      { href: "/claude-traces", label: "Claude Traces", icon: "◎", optional: true, settingsKey: "claude-traces" },
      { href: "/langsmith", label: "LangSmith", icon: "◎", optional: true, settingsKey: "langsmith-traces" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/monitor", label: "Monitor", icon: "◉" },
      { href: "/docs", label: "Docs", icon: "⎘" },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { isToolEnabled } = useSettings()

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r bg-[var(--surface)]" style={{ borderColor: "var(--border)" }}>
      {sections.map((section, i) => {
        const visibleItems = section.items.filter(
          (item) => !item.optional || isToolEnabled(item.settingsKey ?? ""),
        )
        if (visibleItems.length === 0) return null
        return (
          <div key={section.title}>
            {i > 0 && (
              <div className="mx-3 h-px" style={{ background: "var(--border-subtle)" }} />
            )}
            <div className={`px-3 pb-1 ${i === 0 ? "pt-4" : "pt-3"}`}>
              <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
                {section.title}
              </div>
              <nav className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const active = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all"
                      style={{
                        background: active ? "var(--color-cyan-dim)" : undefined,
                        color: active ? "var(--color-cyan)" : "var(--text-secondary)",
                      }}
                    >
                      <span className="flex h-[18px] w-[18px] items-center justify-center text-sm" style={{ opacity: active ? 1 : 0.7 }}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        )
      })}

      <div className="mt-auto">
        <SidebarAccount />
      </div>
    </aside>
  )
}
