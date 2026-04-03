"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

interface DgxLabSettings {
  enabledTools: Record<string, boolean>
}

const STORAGE_KEY = "dgx-lab-settings"

const DEFAULTS: DgxLabSettings = {
  enabledTools: {
    "agent-viewer": false,
    "claude-traces": false,
  },
}

interface SettingsContextValue {
  settings: DgxLabSettings
  isToolEnabled: (key: string) => boolean
  setToolEnabled: (key: string, enabled: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function loadSettings(): DgxLabSettings {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<DgxLabSettings>
    return {
      enabledTools: { ...DEFAULTS.enabledTools, ...parsed.enabledTools },
    }
  } catch {
    return DEFAULTS
  }
}

function saveSettings(settings: DgxLabSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage unavailable
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DgxLabSettings>(DEFAULTS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setSettings(loadSettings())
    setMounted(true)
  }, [])

  const isToolEnabled = useCallback(
    (key: string) => settings.enabledTools[key] ?? true,
    [settings],
  )

  const setToolEnabled = useCallback(
    (key: string, enabled: boolean) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          enabledTools: { ...prev.enabledTools, [key]: enabled },
        }
        saveSettings(next)
        return next
      })
    },
    [],
  )

  if (!mounted) {
    return <SettingsContext.Provider value={{ settings: DEFAULTS, isToolEnabled: () => true, setToolEnabled: () => {} }}>{children}</SettingsContext.Provider>
  }

  return (
    <SettingsContext.Provider value={{ settings, isToolEnabled, setToolEnabled }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider")
  return ctx
}
