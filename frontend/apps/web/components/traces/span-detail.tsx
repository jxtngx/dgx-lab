"use client"

import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface Span {
  span_id?: string
  name: string
  type?: string
  start_time_ms?: number
  start_time?: number
  duration_ms?: number
  duration?: number
  attributes?: Record<string, unknown>
  status?: string
  error?: boolean
}

const TYPE_COLORS: Record<string, string> = {
  agent: "#a78bfa",
  chain: "#8b8993",
  llm: "#22d3ee",
  rag: "#f59e0b",
  embed: "#2dd4bf",
  tool: "#60a5fa",
  rank: "#fb923c",
  parse: "#5a5868",
}

type DetailTab = "io" | "model" | "tokens" | "raw"

const TABS: { key: DetailTab; label: string }[] = [
  { key: "io", label: "I/O" },
  { key: "model", label: "Model" },
  { key: "tokens", label: "Tokens" },
  { key: "raw", label: "Raw" },
]

const TOKEN_SEGMENTS = [
  { key: "system_tokens", label: "System", color: "#a78bfa" },
  { key: "user_tokens", label: "User", color: "#60a5fa" },
  { key: "context_tokens", label: "Context", color: "#f59e0b" },
  { key: "output_tokens", label: "Output", color: "#22d3ee" },
] as const

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 py-1.5 font-mono text-[10px] font-medium text-text-secondary transition-colors hover:text-foreground"
      >
        <span className="text-text-tertiary">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

function MetricCell({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  if (value == null) return null
  return (
    <div className="rounded-md bg-elevated px-2.5 py-2">
      <div className="text-[10px] text-text-tertiary">{label}</div>
      <div className="mt-0.5 font-mono text-xs text-foreground">{value}</div>
    </div>
  )
}

export function SpanDetail({ span }: { span: Span | null }) {
  const [tab, setTab] = useState<DetailTab>("io")

  if (!span) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Select a span to view details
      </div>
    )
  }

  const attrs = span.attributes ?? {}
  const dur = span.duration_ms ?? span.duration ?? 0
  const color = TYPE_COLORS[span.type ?? ""] ?? "#8b8993"

  const tokensIn = attrs.tokens_in as number | undefined
  const tokensOut = attrs.tokens_out as number | undefined
  const tokens = attrs.tokens as number | undefined
  const cost = attrs.cost as number | undefined
  const model = attrs.model as string | undefined
  const ttft = attrs.ttft as number | undefined
  const tokPerSec =
    (tokensOut ?? tokens) && dur > 0
      ? Math.round(((tokensOut ?? tokens ?? 0) / dur) * 1000)
      : null

  const messages = (attrs.messages ?? attrs.input) as
    | Array<{ role: string; content: string }>
    | string
    | undefined
  const output = (attrs.output ?? attrs.response) as string | undefined

  const modelConfig: [string, unknown][] = [
    ["model", model],
    ["temperature", attrs.temperature],
    ["max_tokens", attrs.max_tokens],
    ["top_p", attrs.top_p],
    ["frequency_penalty", attrs.frequency_penalty],
    ["presence_penalty", attrs.presence_penalty],
    ["stop", attrs.stop],
  ].filter(([, v]) => v != null) as [string, unknown][]

  const breakdown = TOKEN_SEGMENTS.map((s) => ({
    ...s,
    count: attrs[s.key] as number | undefined,
  })).filter((s) => s.count != null && s.count > 0)

  const breakdownTotal = breakdown.reduce((s, b) => s + (b.count ?? 0), 0)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="shrink-0 border-0 px-1.5 py-0.5 font-mono text-[10px] font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {span.type ?? "span"}
          </Badge>
          <span className="truncate text-sm font-semibold text-foreground">
            {span.name}
          </span>
        </div>
        {span.span_id && (
          <p className="mt-1 font-mono text-[10px] text-text-tertiary">
            span:{span.span_id}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-b border-border-subtle px-3 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[10px] transition-colors",
              tab === t.key
                ? "bg-cyan-dim text-cyan"
                : "text-text-tertiary hover:bg-elevated hover:text-text-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-3">
          {/* Metrics grid — always visible */}
          <div className="grid grid-cols-3 gap-1.5">
            <MetricCell label="Latency" value={`${dur.toLocaleString()}ms`} />
            <MetricCell
              label="Tokens In"
              value={tokensIn?.toLocaleString()}
            />
            <MetricCell
              label="Tokens Out"
              value={tokensOut?.toLocaleString()}
            />
            <MetricCell
              label="Cost"
              value={cost != null ? `$${cost.toFixed(4)}` : undefined}
            />
            <MetricCell label="Tok/s" value={tokPerSec?.toLocaleString()} />
            <MetricCell
              label="TTFT"
              value={ttft != null ? `${ttft}ms` : undefined}
            />
          </div>

          {/* I/O tab */}
          {tab === "io" && (
            <div className="mt-4 space-y-1">
              <Section title="Input">
                {typeof messages === "string" ? (
                  <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary">
                    {messages}
                  </pre>
                ) : Array.isArray(messages) && messages.length > 0 ? (
                  <div className="space-y-2">
                    {messages.map((msg, i) => (
                      <div key={i}>
                        <div className="mb-0.5 font-mono text-[10px] font-medium text-text-tertiary">
                          {msg.role}
                        </div>
                        <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary">
                          {msg.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary">
                    No input recorded
                  </p>
                )}
              </Section>

              <Section title="Output">
                {output ? (
                  <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary">
                    {output}
                  </pre>
                ) : (
                  <p className="text-xs text-text-tertiary">
                    No output recorded
                  </p>
                )}
              </Section>
            </div>
          )}

          {/* Model tab */}
          {tab === "model" && (
            <div className="mt-4">
              {modelConfig.length > 0 ? (
                <div className="space-y-1">
                  <div className="mb-1.5 font-mono text-[10px] font-medium text-text-secondary">
                    Model Config
                  </div>
                  <div className="rounded-md bg-elevated">
                    {modelConfig.map(([key, val]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 last:border-0"
                      >
                        <span className="font-mono text-[10px] text-text-tertiary">
                          {key}
                        </span>
                        <span className="font-mono text-[10px] text-foreground">
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-tertiary">
                  No model config available
                </p>
              )}
            </div>
          )}

          {/* Tokens tab */}
          {tab === "tokens" && (
            <div className="mt-4 space-y-4">
              {breakdown.length > 0 ? (
                <>
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] font-medium text-text-secondary">
                      Token Breakdown
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-sm">
                      {breakdown.map((seg) => (
                        <div
                          key={seg.key}
                          style={{
                            width: `${((seg.count ?? 0) / breakdownTotal) * 100}%`,
                            backgroundColor: seg.color,
                            opacity: 0.75,
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {breakdown.map((seg) => (
                        <span
                          key={seg.key}
                          className="flex items-center gap-1 font-mono text-[10px] text-text-tertiary"
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ backgroundColor: seg.color }}
                          />
                          {seg.label}: {seg.count?.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                  {(tokensIn != null || tokensOut != null) && (
                    <div className="rounded-md bg-elevated px-3 py-2">
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="text-text-tertiary">Total</span>
                        <span className="text-foreground">
                          {((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : tokens != null ? (
                <div className="rounded-md bg-elevated px-3 py-2">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-text-tertiary">Total tokens</span>
                    <span className="text-foreground">
                      {tokens.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-tertiary">
                  No token data available
                </p>
              )}
            </div>
          )}

          {/* Raw tab */}
          {tab === "raw" && (
            <div className="mt-4">
              <pre className="whitespace-pre-wrap rounded-md bg-elevated p-2.5 font-mono text-[10px] leading-relaxed text-text-secondary">
                {JSON.stringify(attrs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
