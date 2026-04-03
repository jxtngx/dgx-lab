"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFetch } from "@/lib/use-fetch"
import { usePoll } from "@/lib/use-poll"
import { api } from "@/lib/api"
import { PullDatasetSheet } from "@/components/datasets/pull-dataset-sheet"
import { cn } from "@workspace/ui/lib/utils"

interface Dataset {
  id: string
  source: "local" | "huggingface"
  path: string
  num_files: number
  size_mb: number
  formats: string[]
  num_rows?: number | null
  num_columns?: number | null
  column_names?: string[]
  file_names?: string[]
}

interface DatasetsResponse {
  datasets: Dataset[]
  total: number
}

interface DownloadEntry {
  status: "downloading" | "complete" | "error"
  elapsed_s?: number
  error?: string | null
}

interface Column {
  name: string
  type: string
}

interface PreviewResponse {
  columns: Column[]
  rows: Record<string, unknown>[]
  total: number
}

interface DataFile {
  name: string
  format: string
  size_mb: number
  path: string
}

interface QueryResponse {
  type: "rows" | "aggregation"
  columns?: Column[]
  rows?: Record<string, unknown>[]
  total: number
  matched: number
  offset?: number
  limit?: number
  agg?: string
  column?: string
  group_by?: string
  result?: unknown
  results?: { group: unknown; result: unknown }[]
}

const PAGE_SIZE = 50

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, { border: string; bg: string; fg: string }> = {
    parquet: { border: "rgba(96,165,250,0.35)", bg: "var(--color-blue-dim)", fg: "var(--color-blue)" },
    jsonl: { border: "rgba(34,211,238,0.35)", bg: "var(--color-cyan-dim)", fg: "var(--color-cyan)" },
    csv: { border: "rgba(167,139,250,0.35)", bg: "var(--color-purple-dim)", fg: "var(--color-purple)" },
    json: { border: "rgba(45,212,191,0.35)", bg: "var(--color-teal-dim)", fg: "var(--color-teal)" },
    arrow: { border: "rgba(245,158,11,0.35)", bg: "var(--color-amber-dim)", fg: "var(--color-amber)" },
  }
  const c = colors[format] ?? { border: "var(--border-subtle)", bg: "var(--elevated)", fg: "var(--text-secondary)" }
  return (
    <span
      className="font-mono text-[10px] font-bold leading-none"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 20, borderRadius: 3, padding: "0 6px", border: `1px solid ${c.border}`, background: c.bg, color: c.fg }}
    >
      {format.toUpperCase()}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const isDownloading = status === "downloading"
  const isLocal = status === "local"
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: 5,
        height: 5,
        background: isDownloading ? "var(--color-cyan)" : isLocal ? "var(--color-amber)" : "var(--text-tertiary)",
        boxShadow: isDownloading ? "0 0 10px rgba(34,211,238,0.35)" : "none",
        animation: isDownloading ? "pulse-dot 2s ease infinite" : undefined,
      }}
      aria-hidden
    />
  )
}

function truncateCell(val: unknown, maxLen = 120): string {
  if (val == null) return ""
  const s = typeof val === "object" ? JSON.stringify(val) : String(val)
  if (s.length > maxLen) return s.slice(0, maxLen) + "…"
  return s
}

function datasetIcon(d: Dataset) {
  if (d.formats.includes("parquet"))
    return { bg: "var(--color-blue-dim)", fg: "var(--color-blue)", glyph: "P" }
  if (d.formats.includes("jsonl"))
    return { bg: "var(--color-cyan-dim)", fg: "var(--color-cyan)", glyph: "J" }
  if (d.formats.includes("csv"))
    return { bg: "var(--color-purple-dim)", fg: "var(--color-purple)", glyph: "C" }
  return { bg: "var(--color-cyan-dim)", fg: "var(--color-cyan)", glyph: "D" }
}

function splitId(id: string) {
  const parts = id.split("/")
  if (parts.length >= 2) return { org: parts.slice(0, -1).join("/"), name: parts.at(-1) ?? id }
  return { org: "", name: id }
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function SourceBadge({ source }: { source: "local" | "huggingface" }) {
  const isLocal = source === "local"
  return (
    <span
      className="font-mono text-[10px] font-bold leading-none"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 20,
        borderRadius: 3,
        padding: "0 6px",
        border: isLocal ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(96,165,250,0.3)",
        background: isLocal ? "rgba(251,191,36,0.08)" : "var(--color-blue-dim)",
        color: isLocal ? "var(--color-amber)" : "var(--color-blue)",
      }}
    >
      {isLocal ? "LOCAL" : "HF"}
    </span>
  )
}

/* ── SQL Query Pane ──────────────────────────────────────────── */

function QueryPane({
  datasetId,
  selectedFile,
  columns,
}: {
  datasetId: string
  selectedFile: string | null
  columns: Column[]
}) {
  const [queryText, setQueryText] = useState("")
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function parseQuery(text: string): Record<string, unknown> {
    const t = text.trim()

    // Support raw JSON body for power users
    if (t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t)
        return { dataset_id: datasetId, file: selectedFile, ...parsed }
      } catch {
        // fall through to DSL parsing
      }
    }

    const body: Record<string, unknown> = {
      dataset_id: datasetId,
      file: selectedFile,
      limit: 100,
    }

    // Simple DSL: WHERE col op value | SORT col [DESC] | LIMIT n | SELECT col,col | COUNT/SUM/MEAN/MIN/MAX col [BY col]
    const parts = t.split(/\s*\|\s*/)
    const filters: { column: string; op: string; value: string }[] = []

    for (const part of parts) {
      const p = part.trim()
      if (!p) continue

      const whereMatch = p.match(/^(?:WHERE|FILTER)\s+(\S+)\s+(eq|ne|gt|ge|lt|le|contains|startswith|endswith|=|!=|>|>=|<|<=|~)\s+(.+)$/i)
      if (whereMatch) {
        const opMap: Record<string, string> = { "=": "eq", "!=": "ne", ">": "gt", ">=": "ge", "<": "lt", "<=": "le", "~": "contains" }
        const rawOp = whereMatch[2]!
        filters.push({ column: whereMatch[1]!, op: opMap[rawOp] ?? rawOp, value: whereMatch[3]!.trim() })
        continue
      }

      const sortMatch = p.match(/^SORT\s+(\S+)(?:\s+(ASC|DESC))?$/i)
      if (sortMatch) {
        body.sort_by = sortMatch[1]
        body.sort_desc = sortMatch[2]?.toUpperCase() === "DESC"
        continue
      }

      const limitMatch = p.match(/^LIMIT\s+(\d+)$/i)
      if (limitMatch) {
        body.limit = parseInt(limitMatch[1]!, 10)
        continue
      }

      const selectMatch = p.match(/^SELECT\s+(.+)$/i)
      if (selectMatch) {
        body.columns = selectMatch[1]!.split(",").map((c) => c.trim())
        continue
      }

      const aggMatch = p.match(/^(COUNT|SUM|MEAN|AVG|MIN|MAX|STDDEV|COUNT_DISTINCT)\s+(\S+)(?:\s+BY\s+(\S+))?$/i)
      if (aggMatch) {
        const agg = aggMatch[1]!.toUpperCase()
        body.agg = agg === "AVG" ? "mean" : agg.toLowerCase()
        body.agg_column = aggMatch[2]
        if (aggMatch[3]) body.group_by = aggMatch[3]
        continue
      }
    }

    if (filters.length > 0) body.filters = filters
    return body
  }

  async function runQuery() {
    setRunning(true)
    setError(null)
    try {
      const body = parseQuery(queryText)
      const res = await api<QueryResponse>("/datasets/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ background: "var(--surface)" }}>
      {/* Query input */}
      <div className="flex items-start gap-2 px-3 py-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-cyan)" }}>
            SQL
          </span>
        </div>
        <textarea
          ref={inputRef}
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              runQuery()
            }
          }}
          placeholder={`WHERE ${columns[0]?.name ?? "column"} contains value | SORT ${columns[1]?.name ?? "column"} DESC | LIMIT 50`}
          rows={2}
          className="min-h-[40px] flex-1 resize-none rounded-md px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-text-dim outline-none"
          style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
        />
        <button
          type="button"
          disabled={running || !queryText.trim()}
          onClick={runQuery}
          className="shrink-0 rounded-md px-3 py-1.5 font-mono text-[10px] font-semibold transition-colors disabled:opacity-30"
          style={{ background: "var(--color-cyan)", color: "#000" }}
        >
          {running ? "…" : "Run"}
        </button>
      </div>

      {/* Hint */}
      <div className="px-3 pb-1.5">
        <span className="font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>
          Ctrl+Enter to run · Pipe-separated: WHERE col op value | SORT col DESC | LIMIT n | SELECT col,col | SUM col BY col
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 rounded-md px-3 py-2 font-mono text-[10px]" style={{ background: "var(--color-red-dim, rgba(239,68,68,0.1))", color: "var(--color-red)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="max-h-[240px] overflow-auto" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {result.type === "aggregation" ? (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
                  {result.agg}({result.column})
                </span>
                <span className="font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {result.matched.toLocaleString()} rows matched
                </span>
              </div>
              {result.results ? (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-3 py-1.5 text-left font-mono text-[10px] font-bold" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
                        {result.group_by}
                      </th>
                      <th className="px-3 py-1.5 text-right font-mono text-[10px] font-bold" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
                        {result.agg}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-foreground">{String(r.group)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-[11px] tabular-nums" style={{ color: "var(--color-cyan)" }}>
                          {typeof r.result === "number" ? r.result.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(r.result)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="font-mono text-[22px] font-bold" style={{ color: "var(--color-cyan)" }}>
                  {typeof result.result === "number"
                    ? result.result.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : String(result.result)}
                </div>
              )}
            </div>
          ) : result.rows && result.columns ? (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 px-3 py-1.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-dim)", width: 36 }}>
                    #
                  </th>
                  {result.columns.map((col) => (
                    <th key={col.name} className="sticky top-0 z-10 px-3 py-1.5 text-left font-mono text-[10px] font-bold" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="px-3 py-1.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>{(result.offset ?? 0) + i}</td>
                    {result.columns!.map((col) => (
                      <td key={col.name} className="max-w-[280px] truncate px-3 py-1.5 font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {truncateCell(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="flex items-center gap-3 px-4 py-1.5 font-mono text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid var(--border-subtle)" }}>
            <span>{result.matched.toLocaleString()} matched</span>
            <span>{result.total.toLocaleString()} total</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Agent Pane ──────────────────────────────────────────────── */

interface AgentMessage {
  role: "user" | "assistant"
  text: string
  query?: Record<string, unknown>
  result?: QueryResponse
}

function AgentPane({
  datasetId,
  selectedFile,
  columns,
}: {
  datasetId: string
  selectedFile: string | null
  columns: Column[]
}) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState("")
  const [processing, setProcessing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    setMessages([])
  }, [datasetId, selectedFile])

  function buildQueryFromNL(text: string): Record<string, unknown> {
    const body: Record<string, unknown> = { dataset_id: datasetId, file: selectedFile, limit: 50 }
    const lower = text.toLowerCase()
    const filters: { column: string; op: string; value: string }[] = []

    // Detect aggregations
    const aggPatterns: [RegExp, string][] = [
      [/(?:how many|count)\s+(?:rows|records|entries)/i, "count"],
      [/(?:average|avg|mean)\s+(?:of\s+)?(\S+)/i, "mean"],
      [/(?:sum|total)\s+(?:of\s+)?(\S+)/i, "sum"],
      [/(?:min|minimum|smallest|lowest)\s+(?:of\s+)?(\S+)/i, "min"],
      [/(?:max|maximum|largest|highest|biggest)\s+(?:of\s+)?(\S+)/i, "max"],
    ]

    for (const [pattern, aggType] of aggPatterns) {
      const m = text.match(pattern)
      if (m) {
        body.agg = aggType
        const colName = m[1] ?? columns[0]?.name
        if (colName) {
          const matched = columns.find((c) => c.name.toLowerCase() === colName.toLowerCase())
          body.agg_column = matched?.name ?? colName
        }

        const byMatch = text.match(/(?:by|per|group\s*by|for\s+each)\s+(\S+)/i)
        if (byMatch) {
          const grpCol = columns.find((c) => c.name.toLowerCase() === byMatch[1]!.toLowerCase())
          body.group_by = grpCol?.name ?? byMatch[1]
        }
        return body
      }
    }

    // Detect "where X contains/equals Y"
    const wherePattern = /(?:where|with|having|filter)\s+(\S+)\s+(?:contains?|includes?|has|~)\s+["']?([^"']+)["']?/i
    const wm = text.match(wherePattern)
    if (wm) {
      const col = columns.find((c) => c.name.toLowerCase() === wm[1]!.toLowerCase())
      filters.push({ column: col?.name ?? wm[1]!, op: "contains", value: wm[2]!.trim() })
    }

    const eqPattern = /(?:where|with)\s+(\S+)\s+(?:=|equals?|is)\s+["']?([^"']+)["']?/i
    const em = text.match(eqPattern)
    if (em && !wm) {
      const col = columns.find((c) => c.name.toLowerCase() === em[1]!.toLowerCase())
      filters.push({ column: col?.name ?? em[1]!, op: "eq", value: em[2]!.trim() })
    }

    // Detect sorting
    const sortPattern = /(?:sort|order)\s+(?:by\s+)?(\S+)\s*(asc|desc|ascending|descending)?/i
    const sm = text.match(sortPattern)
    if (sm) {
      const col = columns.find((c) => c.name.toLowerCase() === sm[1]!.toLowerCase())
      body.sort_by = col?.name ?? sm[1]
      body.sort_desc = sm[2]?.toLowerCase().startsWith("desc") ?? false
    }

    // Detect "show me first/top N"
    const limitPattern = /(?:show|first|top|limit)\s+(\d+)/i
    const lm = text.match(limitPattern)
    if (lm) body.limit = parseInt(lm[1]!, 10)

    // Detect column selection
    const showPattern = /(?:show|select|only)\s+(?:columns?\s+)?(\S+(?:\s*,\s*\S+)+)/i
    const shm = text.match(showPattern)
    if (shm) {
      body.columns = shm[1]!.split(",").map((c) => {
        const col = columns.find((cc) => cc.name.toLowerCase() === c.trim().toLowerCase())
        return col?.name ?? c.trim()
      })
    }

    if (filters.length > 0) body.filters = filters

    // Default: if no specific operation detected, just show rows
    if (!body.agg && !body.sort_by && filters.length === 0 && !body.columns) {
      if (lower.includes("all") || lower.includes("show") || lower.includes("list")) {
        body.limit = 100
      }
    }

    return body
  }

  async function send() {
    const text = input.trim()
    if (!text || processing) return
    setInput("")
    setProcessing(true)

    const userMsg: AgentMessage = { role: "user", text }
    setMessages((prev) => [...prev, userMsg])

    try {
      const queryBody = buildQueryFromNL(text)
      const res = await api<QueryResponse>("/datasets/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryBody),
      })

      let summary: string
      if (res.type === "aggregation") {
        if (res.results) {
          const top = res.results.slice(0, 5)
          summary = `${(queryBody.agg as string).toUpperCase()}(${queryBody.agg_column}) by ${queryBody.group_by}:\n` +
            top.map((r) => `  ${r.group}: ${typeof r.result === "number" ? r.result.toLocaleString(undefined, { maximumFractionDigits: 4 }) : r.result}`).join("\n") +
            (res.results.length > 5 ? `\n  …and ${res.results.length - 5} more groups` : "")
        } else {
          summary = `${(queryBody.agg as string).toUpperCase()}(${queryBody.agg_column}) = ${typeof res.result === "number" ? res.result.toLocaleString(undefined, { maximumFractionDigits: 4 }) : res.result}`
        }
        summary += `\n\n${res.matched.toLocaleString()} rows matched out of ${res.total.toLocaleString()}`
      } else {
        summary = `Found ${res.matched.toLocaleString()} rows (showing ${res.rows?.length ?? 0})`
        if (res.rows && res.rows.length > 0 && res.columns) {
          const cols = res.columns.slice(0, 4).map((c) => c.name)
          const preview = res.rows.slice(0, 3).map((r) => cols.map((c) => truncateCell(r[c], 40)).join(" | ")).join("\n")
          summary += `\n\n${cols.join(" | ")}\n${preview}`
          if (res.rows.length > 3) summary += `\n…${res.rows.length - 3} more rows`
        }
      }

      setMessages((prev) => [...prev, { role: "assistant", text: summary, query: queryBody, result: res }])
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : String(e)}` }])
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border-subtle)" }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-purple)" }}>Agent</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-colors"
            style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}
          >
            <span>add agent</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-colors"
            style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}
          >
            <span>add model</span>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2 py-8 text-center">
            <p className="font-sans text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              Ask questions in natural language
            </p>
            <div className="flex flex-col gap-1.5 mx-auto">
              {[
                `How many rows are there?`,
                columns[0] ? `Show top 10 sorted by ${columns[0].name}` : "Show first 10 rows",
                columns.length > 1 ? `Average of ${columns.find((c) => ["int64", "float64", "double", "int32", "float32", "float", "int"].includes(c.type.toLowerCase()))?.name ?? columns[1]?.name}` : "Count rows",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setInput(q); }}
                  className="rounded-md px-2.5 py-1.5 text-left font-mono text-[10px] transition-colors hover:text-foreground"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <div key={i} className={cn("rounded-md px-2.5 py-2", m.role === "user" ? "ml-6" : "mr-2")}>
                <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: m.role === "user" ? "var(--text-tertiary)" : "var(--color-purple)" }}>
                  {m.role === "user" ? "You" : "Agent"}
                </div>
                <div
                  className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed"
                  style={{
                    color: m.role === "user" ? "var(--text-secondary)" : "var(--foreground)",
                    background: m.role === "assistant" ? "var(--elevated)" : undefined,
                    padding: m.role === "assistant" ? "8px 10px" : undefined,
                    borderRadius: m.role === "assistant" ? 6 : undefined,
                    border: m.role === "assistant" ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {processing && (
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="inline-block size-3 animate-pulse rounded-full" style={{ background: "rgba(167,139,250,0.4)" }} />
                <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>Querying…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send() }}
          placeholder="Ask about this dataset…"
          className="h-8 flex-1 rounded-md px-2.5 font-mono text-[11px] text-foreground placeholder:text-text-dim outline-none"
          style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
        />
        <button
          type="button"
          disabled={processing || !input.trim()}
          onClick={send}
          className="shrink-0 rounded-md px-2.5 py-1.5 font-mono text-[10px] font-semibold transition-colors disabled:opacity-30"
          style={{ background: "var(--color-purple)", color: "#fff" }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

/* ── Dataset Viewer (per-tab) ─────────────────────────────────── */

interface DatasetTab {
  id: string
  selectedFile: string | null
  files: DataFile[]
  preview: PreviewResponse | null
  previewLoading: boolean
  page: number
  expandedRow: number | null
}

function DatasetViewer({
  tab,
  onUpdate,
  showAgent,
  onToggleAgent,
}: {
  tab: DatasetTab
  onUpdate: (partial: Partial<DatasetTab>) => void
  showAgent: boolean
  onToggleAgent: () => void
}) {
  const { files, selectedFile, preview, previewLoading, page, expandedRow } = tab
  const totalPages = preview ? Math.ceil(preview.total / PAGE_SIZE) : 0
  const [showQuery, setShowQuery] = useState(false)

  const loadPreview = useCallback(() => {
    onUpdate({ previewLoading: true })
    const params = new URLSearchParams({ offset: String(page * PAGE_SIZE), limit: String(PAGE_SIZE) })
    if (selectedFile) params.set("file", selectedFile)
    api<PreviewResponse>(`/datasets/${tab.id}/preview?${params}`)
      .then((p) => onUpdate({ preview: p, previewLoading: false }))
      .catch(() => onUpdate({ preview: null, previewLoading: false }))
  }, [tab.id, selectedFile, page, onUpdate])

  useEffect(() => { loadPreview() }, [loadPreview])

  useEffect(() => {
    onUpdate({ page: 0, expandedRow: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile])

  return (
    <>
      {/* File tabs + stats */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex shrink-0 items-center gap-2">
          {preview && (
            <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
              {preview.total.toLocaleString()} rows · {preview.columns.length} cols
            </span>
          )}
          {files.length > 0 && files[0] && (
            <FormatBadge format={files.find((f) => f.name === selectedFile)?.format ?? files[0].format} />
          )}
        </div>

        {files.length > 1 ? (
          <div className="relative min-w-0 flex-1">
            <select
              value={selectedFile ?? ""}
              onChange={(e) => onUpdate({ selectedFile: e.target.value })}
              className="h-7 w-full appearance-none truncate rounded-md pl-2.5 pr-7 font-mono text-[11px] text-foreground outline-none text-right"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {files.map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-dim)" }}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : files.length === 1 && (
          <span className="truncate font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {files[0]!.name}
          </span>
        )}
      </div>

      {/* Column strip + Agent toggle */}
      {preview && preview.columns.length > 0 && (
        <div className="flex shrink-0 items-center px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {preview.columns.map((col) => (
              <div
                key={col.name}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5"
                style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
              >
                <span className="font-mono text-[10px] font-semibold text-foreground">{col.name}</span>
                <span className="font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>{col.type}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onToggleAgent()}
            className="ml-2 shrink-0 rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors"
            style={{
              background: showAgent ? "var(--color-purple-dim, rgba(167,139,250,0.12))" : "rgba(167,139,250,0.06)",
              color: "var(--color-purple)",
              border: showAgent ? "1px solid rgba(167,139,250,0.3)" : "1px solid rgba(167,139,250,0.15)",
            }}
          >
            AGENT
          </button>
        </div>
      )}

      {/* Data viewer + agent side-by-side */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <span className="inline-block size-4 animate-pulse rounded-full" style={{ background: "rgba(34,211,238,0.4)" }} />
              </div>
            ) : preview && preview.rows.length > 0 ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 px-3 py-1.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider" style={{ background: "var(--background)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-dim)", width: 36 }}>
                      #
                    </th>
                    {preview.columns.map((col) => (
                      <th key={col.name} className="sticky top-0 z-10 px-3 py-1.5 text-left font-mono text-[10px] font-bold" style={{ background: "var(--background)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", maxWidth: 300 }}>
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => {
                    const rowIdx = page * PAGE_SIZE + i
                    const isExpanded = expandedRow === rowIdx
                    return (
                      <tr
                        key={rowIdx}
                        className="transition-colors"
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                          background: isExpanded ? "var(--elevated)" : undefined,
                          cursor: "pointer",
                        }}
                        onClick={() => onUpdate({ expandedRow: isExpanded ? null : rowIdx })}
                      >
                        <td className="px-3 py-1.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                          {rowIdx}
                        </td>
                        {preview.columns.map((col) => (
                          <td
                            key={col.name}
                            className="px-3 py-1.5 font-mono text-[11px]"
                            style={{
                              color: "var(--text-secondary)",
                              maxWidth: isExpanded ? undefined : 300,
                              whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                              overflow: isExpanded ? undefined : "hidden",
                              textOverflow: isExpanded ? undefined : "ellipsis",
                              wordBreak: isExpanded ? "break-word" : undefined,
                            }}
                          >
                            {isExpanded
                              ? typeof row[col.name] === "object"
                                ? JSON.stringify(row[col.name], null, 2)
                                : String(row[col.name] ?? "")
                              : truncateCell(row[col.name])}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="font-sans text-[13px]" style={{ color: "var(--text-tertiary)" }}>No data</p>
              </div>
            )}
          </div>

          {/* Footer: SQL toggle + pagination */}
          <div className="flex shrink-0 items-center px-4 py-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <button
              type="button"
              onClick={() => setShowQuery(!showQuery)}
              className="shrink-0 rounded-md px-2 py-1 font-mono text-[10px] font-semibold transition-colors"
              style={{
                background: showQuery ? "var(--color-purple-dim, rgba(167,139,250,0.12))" : "rgba(167,139,250,0.06)",
                color: "var(--color-purple)",
                border: showQuery ? "1px solid rgba(167,139,250,0.3)" : "1px solid rgba(167,139,250,0.15)",
              }}
            >
              SQL
            </button>
            {preview && totalPages > 1 && (
              <>
                <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {(page * PAGE_SIZE).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, preview.total).toLocaleString()} of {preview.total.toLocaleString()}
                </span>
                <div className="ml-2 flex gap-1">
                  <button type="button" disabled={page === 0} onClick={() => onUpdate({ page: page - 1 })} className="rounded-md px-2 py-1 font-mono text-[10px] transition-colors disabled:opacity-30" style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                    Prev
                  </button>
                  <span className="flex items-center px-2 font-mono text-[9px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {page + 1}/{totalPages}
                  </span>
                  <button type="button" disabled={page >= totalPages - 1} onClick={() => onUpdate({ page: page + 1 })} className="rounded-md px-2 py-1 font-mono text-[10px] transition-colors disabled:opacity-30" style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                    Next
                  </button>
                </div>
              </>
            )}
          </div>

          {showQuery && preview && (
            <QueryPane datasetId={tab.id} selectedFile={selectedFile} columns={preview.columns} />
          )}
        </div>

        {showAgent && preview && (
          <div className="w-[320px] shrink-0">
            <AgentPane datasetId={tab.id} selectedFile={selectedFile} columns={preview.columns} />
          </div>
        )}
      </div>
    </>
  )
}

/* ── Main Page ───────────────────────────────────────────────── */

type ActiveView = "datasets" | "viewer"

export default function DatasetsPage() {
  const { data, loading, refetch } = useFetch<DatasetsResponse>("/datasets")
  const { data: downloads } = usePoll<Record<string, DownloadEntry>>("/datasets/downloads", 2000)
  const [pullOpen, setPullOpen] = useState(false)
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const handlePullComplete = useCallback(() => refetch(), [refetch])

  const [activeView, setActiveView] = useState<ActiveView>("datasets")
  const [viewerTab, setViewerTab] = useState<DatasetTab | null>(null)
  const [showAgent, setShowAgent] = useState(false)

  const hasActiveDownloads = downloads && Object.values(downloads).some((d) => d.status === "downloading")

  useEffect(() => {
    if (!hasActiveDownloads) return
    const id = setInterval(refetch, 5000)
    return () => clearInterval(id)
  }, [hasActiveDownloads, refetch])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const filtered = useMemo(() => {
    const cached = data?.datasets ?? []
    const cachedIds = new Set(cached.map((d) => d.id))
    const downloading: Dataset[] = []
    if (downloads) {
      for (const [id, dl] of Object.entries(downloads)) {
        if (dl.status === "downloading" && !cachedIds.has(id)) {
          downloading.push({ id, source: "huggingface", path: "", num_files: 0, size_mb: 0, formats: [] })
        }
      }
    }
    const list = [...downloading, ...cached]
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((d) => d.id.toLowerCase().includes(q))
  }, [data, query, downloads])

  const selectDataset = useCallback((datasetId: string) => {
    if (viewerTab?.id === datasetId) {
      setActiveView("viewer")
      return
    }
    const newTab: DatasetTab = {
      id: datasetId,
      selectedFile: null,
      files: [],
      preview: null,
      previewLoading: false,
      page: 0,
      expandedRow: null,
    }
    setViewerTab(newTab)
    setActiveView("viewer")
    api<DataFile[]>(`/datasets/${datasetId}/files`)
      .then((f) => {
        setViewerTab((prev) =>
          prev?.id === datasetId
            ? { ...prev, files: f, selectedFile: f.length > 0 ? f[0]!.name : null }
            : prev,
        )
      })
      .catch(() => {})
  }, [viewerTab?.id])

  const updateViewer = useCallback((partial: Partial<DatasetTab>) => {
    setViewerTab((prev) => (prev ? { ...prev, ...partial } : prev))
  }, [])

  function getDatasetStatus(d: Dataset): string {
    const dl = downloads?.[d.id]
    if (dl?.status === "downloading") return "downloading"
    if (d.source === "local") return "local"
    return "cached"
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* ── Top tab bar ───────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface)" }}>
        <button
          type="button"
          onClick={() => setActiveView("datasets")}
          className="px-4 py-2 font-mono text-[11px] font-medium transition-colors"
          style={{
            color: activeView === "datasets" ? "var(--color-cyan)" : "var(--text-secondary)",
            borderBottom: activeView === "datasets" ? "2px solid var(--color-cyan)" : "2px solid transparent",
            background: activeView === "datasets" ? "var(--background)" : undefined,
          }}
        >
          Datasets
        </button>
        <button
          type="button"
          onClick={() => viewerTab && setActiveView("viewer")}
          disabled={!viewerTab}
          className="px-4 py-2 font-mono text-[11px] font-medium transition-colors disabled:opacity-30"
          style={{
            color: activeView === "viewer" ? "var(--color-cyan)" : "var(--text-secondary)",
            borderBottom: activeView === "viewer" ? "2px solid var(--color-cyan)" : "2px solid transparent",
            background: activeView === "viewer" ? "var(--background)" : undefined,
          }}
        >
          Data Viewer
        </button>
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeView === "datasets" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Search + Pull header */}
            <div className="flex shrink-0 items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="relative min-w-0 flex-1" style={{ maxWidth: 420 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }} aria-hidden>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Filter datasets…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-7 w-full rounded-md pl-7 pr-2 font-mono text-[11px] text-foreground placeholder:text-text-dim outline-none"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)" }}
                />
              </div>
              <div className="flex items-center gap-2">
                {hasActiveDownloads && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-cyan)", animation: "pulse-dot 2s ease infinite" }} />
                )}
                <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                  {filtered.length}
                </span>
                <button
                  type="button"
                  onClick={() => setPullOpen(true)}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 font-mono text-[10px] font-semibold transition-colors"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border-subtle)", color: "var(--color-cyan)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Pull
                </button>
              </div>
            </div>

            {/* Dataset list (full width) */}
            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center gap-2 py-12 font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  <span className="inline-block size-3 animate-pulse rounded-full" style={{ background: "rgba(34,211,238,0.4)" }} />
                  Scanning…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-12 text-center">
                  <p className="font-sans text-[12px] text-foreground">No datasets</p>
                  <p className="mt-1 font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>Pull from Hub or add to ~/.dgx-lab/datasets/</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 p-2">
                  {filtered.map((d) => {
                    const { org, name } = splitId(d.id)
                    const ic = datasetIcon(d)
                    const isViewed = viewerTab?.id === d.id
                    const status = getDatasetStatus(d)
                    const isDownloading = status === "downloading"

                    const colPreview = !isDownloading && d.column_names && d.column_names.length > 0
                      ? (d.num_columns && d.num_columns > d.column_names.length
                          ? `${d.column_names.join(", ")}, …`
                          : d.column_names.join(", "))
                      : null

                    return (
                      <button
                        key={`${d.source}-${d.id}`}
                        type="button"
                        onClick={() => !isDownloading && selectDataset(d.id)}
                        className="grid w-full items-center gap-x-3 rounded-lg text-left transition-colors"
                        style={{
                          gridTemplateColumns: "auto 1fr auto auto auto auto auto",
                          padding: "0 12px",
                          minHeight: 56,
                          border: isViewed
                            ? "1px solid rgba(34,211,238,0.15)"
                            : "1px solid transparent",
                          background: isViewed
                            ? "rgba(34,211,238,0.07)"
                            : isDownloading
                              ? "var(--color-cyan-dim)"
                              : undefined,
                          cursor: isDownloading ? "default" : undefined,
                        }}
                      >
                        {/* Name + org */}
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            className="flex shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-bold"
                            style={{
                              width: 36,
                              height: 36,
                              background: isDownloading ? "var(--color-cyan-dim)" : ic.bg,
                              color: isDownloading ? "var(--color-cyan)" : ic.fg,
                            }}
                          >
                            {isDownloading ? "↓" : ic.glyph}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-sans text-[13px] font-semibold text-foreground">
                              {d.source === "huggingface" && org ? `${org}/${name}` : name}
                            </div>
                          </div>
                          {d.source === "huggingface" && !isDownloading && (
                            <a
                              href={`https://huggingface.co/datasets/${d.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex shrink-0 items-center justify-center rounded transition-colors"
                              style={{ color: "var(--text-dim)" }}
                              title="Open on Hugging Face"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </a>
                          )}
                        </div>

                        {/* Column preview */}
                        <div className="truncate font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
                          {colPreview ?? ""}
                        </div>

                        {/* Source + format badges */}
                        <div className="flex items-center gap-1">
                          {!isDownloading && <SourceBadge source={d.source} />}
                          {!isDownloading && d.formats.map((f) => (
                            <FormatBadge key={f} format={f} />
                          ))}
                        </div>

                        {/* Row count */}
                        <div className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {!isDownloading && d.num_rows != null ? `${fmtCount(d.num_rows)} rows` : ""}
                        </div>

                        {/* Col count */}
                        <div className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {!isDownloading && d.num_columns != null ? `${d.num_columns} cols` : ""}
                        </div>

                        {/* Size */}
                        <div className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                          {!isDownloading ? (d.size_mb > 1024 ? `${(d.size_mb / 1024).toFixed(1)} GB` : `${d.size_mb} MB`) : ""}
                        </div>

                        {/* Status */}
                        <div className="flex items-center justify-end gap-1.5">
                          <StatusDot status={status} />
                          {!isDownloading && d.num_files > 0 && (
                            <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                              {d.num_files} {d.num_files === 1 ? "file" : "files"}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : viewerTab ? (
          <DatasetViewer
            key={viewerTab.id}
            tab={viewerTab}
            onUpdate={updateViewer}
            showAgent={showAgent}
            onToggleAgent={() => setShowAgent((v) => !v)}
          />
        ) : null}
      </div>

      <PullDatasetSheet open={pullOpen} onOpenChange={setPullOpen} onPullComplete={handlePullComplete} />
    </div>
  )
}
