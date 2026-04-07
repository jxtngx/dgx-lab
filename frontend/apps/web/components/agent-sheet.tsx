"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"

interface AgentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  sources?: string[]
  trace_id?: string
  timestamp_ms?: number
}

interface ChatResponse {
  conversation_id: string
  answer: string
  sources: string[]
  trace_id: string
  duration_ms: number
}

export function AgentSheet({ open, onOpenChange }: AgentSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setError(null)

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp_ms: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await api<ChatResponse>("/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
        }),
      })

      setConversationId(res.conversation_id)

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        trace_id: res.trace_id,
        timestamp_ms: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get response")
    } finally {
      setLoading(false)
    }
  }, [input, loading, conversationId])

  const handleNewChat = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setError(null)
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="!w-[480px] !max-w-[480px] !bg-[var(--surface)] flex flex-col"
      >
        <SheetHeader className="border-b px-5 pb-4 pt-5" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-[15px] font-semibold text-foreground">
                DGX Lab Agent
              </SheetTitle>
              <SheetDescription className="font-mono text-[10px] text-text-tertiary">
                Bedrock Haiku 3.5 · RAG over codebase
              </SheetDescription>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                className="rounded-md px-2 py-1 font-mono text-[10px] font-medium transition-colors"
                style={{
                  color: "var(--text-tertiary)",
                  background: "var(--elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                New chat
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-auto px-5 py-4">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: "var(--color-purple-dim)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4ZM9 11.5A5.5 5.5 0 0 0 3.5 17v1.5A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5V17A5.5 5.5 0 0 0 15 11.5h-6Z"
                      stroke="var(--color-purple)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="font-sans text-[13px] font-medium text-foreground">
                  Ask about DGX Lab
                </p>
                <p className="mt-1 text-center font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
                  Codebase-aware assistant with RAG
                  <br />
                  over the full repo, agent personas, and skills.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[380px] rounded-lg px-3 py-2.5"
                  style={{
                    background: msg.role === "user" ? "var(--elevated)" : "var(--surface)",
                    border: msg.role === "assistant" ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  {msg.role === "assistant" && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span
                        className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase"
                        style={{ background: "var(--color-purple-dim)", color: "var(--color-purple)" }}
                      >
                        agent
                      </span>
                    </div>
                  )}
                  <p
                    className="whitespace-pre-wrap font-sans text-[12px] leading-[1.6]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {msg.content}
                  </p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
                      {msg.sources.map((src, j) => (
                        <span
                          key={j}
                          className="rounded px-1.5 py-0.5 font-mono text-[9px]"
                          style={{ background: "var(--elevated)", color: "var(--text-tertiary)" }}
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mb-3 flex justify-start">
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="rounded-full px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase"
                      style={{ background: "var(--color-purple-dim)", color: "var(--color-purple)" }}
                    >
                      agent
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-purple)", animation: "pulse-dot 1.5s ease infinite" }} />
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-purple)", animation: "pulse-dot 1.5s ease infinite 0.3s" }} />
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-purple)", animation: "pulse-dot 1.5s ease infinite 0.6s" }} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div
                className="mb-3 rounded-lg px-3 py-2.5"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid var(--color-red)" }}
              >
                <p className="font-mono text-[11px]" style={{ color: "var(--color-red)" }}>
                  {error}
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Ask about DGX Lab..."
                disabled={loading}
                className="flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-text-dim outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="shrink-0 rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors disabled:opacity-30"
                style={{ background: "var(--color-cyan)", color: "#000" }}
              >
                {loading ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
