"use client"

import { useEffect, useState } from "react"
import { useFetch } from "@/lib/use-fetch"
import { usePoll } from "@/lib/use-poll"
import { api } from "@/lib/api"

interface RecipeParam {
  key: string
  label: string
  type: "text" | "number" | "boolean"
  default: string | number | boolean
}

interface Recipe {
  id: string
  name: string
  description: string
  params: RecipeParam[]
}

interface Job {
  id: string
  recipe_id: string
  recipe_name: string
  params: Record<string, unknown>
  status: string
  created_at: number
  started_at: number | null
  finished_at: number | null
}

interface InstallStatus {
  installed: boolean
  version: string | null
}

function formatDuration(start: number, end: number): string {
  const s = Math.round(end - start)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

const STATUS_STYLE: Record<string, { dot: string; text: string }> = {
  queued: { dot: "var(--text-tertiary)", text: "var(--text-secondary)" },
  running: { dot: "var(--color-blue)", text: "var(--color-blue)" },
  complete: { dot: "var(--color-cyan)", text: "var(--color-cyan)" },
  failed: { dot: "var(--color-red)", text: "var(--color-red)" },
  timeout: { dot: "var(--color-amber)", text: "var(--color-amber)" },
}

export default function AutoModelPage() {
  const { data: status } = useFetch<InstallStatus>("/automodel/status")
  const { data: recipes } = useFetch<Recipe[]>("/automodel/recipes")
  const { data: jobs } = usePoll<Job[]>("/automodel/jobs", 3000)
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string | number | boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  const recipe = recipes?.find((r) => r.id === selectedRecipe)

  useEffect(() => {
    if (!recipe) return
    const defaults: Record<string, string | number | boolean> = {}
    for (const p of recipe.params) {
      defaults[p.key] = p.default
    }
    setFormValues(defaults)
  }, [recipe])

  async function handleSubmit() {
    if (!selectedRecipe) return
    setSubmitting(true)
    try {
      await api("/automodel/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: selectedRecipe, params: formValues }),
      })
      setSelectedRecipe(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--background)" }}>
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h1 className="font-sans text-[15px] font-semibold tracking-tight text-foreground">
            AutoModel
          </h1>
          <p className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            NeMo AutoModel · PyTorch SPMD training
          </p>
        </div>
        {status && (
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: status.installed ? "var(--color-cyan-dim)" : "var(--color-amber-dim)",
              border: `1px solid ${status.installed ? "rgba(34,211,238,0.2)" : "rgba(245,158,11,0.2)"}`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: status.installed ? "var(--color-cyan)" : "var(--color-amber)" }}
            />
            <span
              className="font-mono text-[10px] font-medium"
              style={{ color: status.installed ? "var(--color-cyan)" : "var(--color-amber)" }}
            >
              {status.installed ? `v${status.version}` : "not installed"}
            </span>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: Recipes */}
        <div
          className="w-[320px] shrink-0 overflow-y-auto p-4"
          style={{ borderRight: "1px solid var(--border-subtle)" }}
        >
          <p
            className="mb-3 font-sans text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            Recipes
          </p>
          <div className="space-y-2">
            {(recipes ?? []).map((r) => {
              const active = selectedRecipe === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRecipe(active ? null : r.id)}
                  className="w-full rounded-lg p-3 text-left transition-colors"
                  style={{
                    background: active ? "rgba(34,211,238,0.07)" : "var(--elevated)",
                    border: active
                      ? "1px solid rgba(34,211,238,0.15)"
                      : "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="font-sans text-[13px] font-semibold text-foreground">
                    {r.name}
                  </div>
                  <div
                    className="mt-1 font-mono text-[10px] leading-relaxed"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {r.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Center: Config form or empty state */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {recipe ? (
            <div className="mx-auto max-w-[600px] space-y-6">
              <div>
                <h2 className="font-sans text-[18px] font-bold text-foreground">
                  {recipe.name}
                </h2>
                <p className="mt-1 font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {recipe.description}
                </p>
              </div>

              <div className="space-y-3">
                {recipe.params.map((p) => (
                  <div key={p.key}>
                    <label
                      className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {p.label}
                    </label>
                    {p.type === "boolean" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((prev) => ({ ...prev, [p.key]: !prev[p.key] }))
                        }
                        className="flex h-8 items-center gap-2 rounded-md px-3 font-mono text-[12px]"
                        style={{
                          background: "var(--elevated)",
                          border: "1px solid var(--border-subtle)",
                          color: formValues[p.key]
                            ? "var(--color-cyan)"
                            : "var(--text-secondary)",
                        }}
                      >
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{
                            background: formValues[p.key]
                              ? "var(--color-cyan)"
                              : "transparent",
                            border: formValues[p.key]
                              ? "none"
                              : "1px solid var(--text-tertiary)",
                          }}
                        />
                        {formValues[p.key] ? "Enabled" : "Disabled"}
                      </button>
                    ) : (
                      <input
                        type={p.type === "number" ? "number" : "text"}
                        value={formValues[p.key] as string | number ?? ""}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [p.key]:
                              p.type === "number"
                                ? parseFloat(e.target.value) || 0
                                : e.target.value,
                          }))
                        }
                        className="h-8 w-full rounded-md px-3 font-mono text-[12px] text-foreground outline-none ring-cyan focus-visible:border-cyan/40 focus-visible:ring-1"
                        style={{
                          background: "var(--elevated)",
                          border: "1px solid var(--border-subtle)",
                        }}
                        placeholder={String(p.default)}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="w-full rounded-md py-2 font-sans text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--color-cyan)", color: "#000" }}
              >
                {submitting ? "Launching…" : "Launch Job"}
              </button>
            </div>
          ) : (
            <div
              className="flex h-full flex-col items-center justify-center gap-3"
              style={{ color: "var(--text-tertiary)" }}
            >
              <p className="font-sans text-[13px] font-medium text-text-secondary">
                Select a recipe to configure
              </p>
              <p className="text-xs">
                NeMo AutoModel recipes for SFT, LoRA, pretraining, distillation, and QAT
              </p>
            </div>
          )}
        </div>

        {/* Right: Jobs */}
        <div
          className="w-[300px] shrink-0 overflow-y-auto p-4"
          style={{
            background: "var(--surface)",
            borderLeft: "1px solid var(--border-subtle)",
          }}
        >
          <p
            className="mb-3 font-sans text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            Jobs
          </p>

          {(!jobs || jobs.length === 0) ? (
            <p
              className="py-8 text-center font-mono text-[11px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              No jobs yet
            </p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => {
                const st = STATUS_STYLE[j.status] ?? { dot: "var(--text-tertiary)", text: "var(--text-secondary)" }
                return (
                  <div
                    key={j.id}
                    className="rounded-lg p-3 transition-colors"
                    style={{
                      background: "var(--elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: st.dot,
                          animation:
                            j.status === "running"
                              ? "pulse-dot 2s ease infinite"
                              : undefined,
                        }}
                      />
                      <span className="truncate font-mono text-[12px] font-semibold text-foreground">
                        {j.recipe_name}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px]">
                      <span style={{ color: st.text }}>{j.status}</span>
                      {j.started_at && (
                        <span style={{ color: "var(--text-tertiary)" }}>
                          {formatTime(j.started_at)}
                        </span>
                      )}
                      {j.started_at && j.finished_at && (
                        <span style={{ color: "var(--text-tertiary)" }}>
                          {formatDuration(j.started_at, j.finished_at)}
                        </span>
                      )}
                    </div>

                    {typeof j.params.model === "string" && (
                      <div className="mt-1">
                        <span
                          className="inline-block rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium"
                          style={{
                            background: "var(--color-blue-dim)",
                            color: "var(--color-blue)",
                          }}
                        >
                          {j.params.model}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
