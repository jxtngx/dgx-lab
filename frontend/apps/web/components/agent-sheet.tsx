"use client"

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

export function AgentSheet({ open, onOpenChange }: AgentSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="!w-[480px] !max-w-[480px] !bg-[var(--surface)]"
      >
        <SheetHeader className="border-b border-border-subtle px-5 pb-4 pt-5">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            DGX Lab Agent
          </SheetTitle>
          <SheetDescription className="font-mono text-[10px] text-text-tertiary">
            Local AI assistant for DGX Spark and NVIDIA NeMo
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col">
          {/* Placeholder chat area */}
          <div className="flex flex-1 items-center justify-center px-5 py-16">
            <div className="text-center">
              <div
                className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: "var(--color-cyan-dim)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4ZM9 11.5A5.5 5.5 0 0 0 3.5 17v1.5A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5V17A5.5 5.5 0 0 0 15 11.5h-6Z"
                    stroke="var(--color-cyan)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="font-sans text-[13px] font-medium text-foreground">
                Agent coming soon
              </p>
              <p className="mt-1 font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>
                A local agent to help manage your DGX Spark,
                <br />
                run NeMo workflows, and more.
              </p>
            </div>
          </div>

          {/* Input area */}
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2.5"
              style={{
                background: "var(--elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <input
                type="text"
                disabled
                placeholder="Coming soon…"
                className="flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-text-dim outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                disabled
                className="shrink-0 rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors disabled:opacity-30"
                style={{ background: "var(--color-cyan)", color: "#000" }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
