---
name: add-tool
description: >-
  Add a new tool to DGX Lab end-to-end: backend router, frontend page,
  sidebar entry, and main.py registration. Use when creating a new tool,
  adding a new dashboard page, or extending the tool inventory.
---

# Add a New Tool to DGX Lab

A DGX Lab tool is a vertical slice: one backend router + one frontend page + one sidebar entry. This skill walks through the full pattern.

## Checklist

Copy and track progress:

```
- [ ] 1. Create backend router
- [ ] 2. Register router in main.py
- [ ] 3. Create frontend page
- [ ] 4. Add sidebar entry
- [ ] 5. Add to tools layout name map
- [ ] 6. Verify build
```

## Step 1: Backend router

Create `backend/app/routers/<tool>.py`:

```python
from __future__ import annotations

from fastapi import APIRouter

from app import config

router = APIRouter()


@router.get("")
async def list_items():
    return []
```

- Import `config` for paths and hardware constants.
- Follow the patterns in existing routers (see `control.py`, `datasets.py`).
- Use `threading.Thread(daemon=True)` for background work.
- Track background job state in a module-level dict.

## Step 2: Register in main.py

Add to `backend/app/main.py`:

```python
from app.routers import newtool

app.include_router(newtool.router, prefix="/api/newtool", tags=["newtool"])
```

Place it with the other `include_router` calls. Prefix is always `/api/<tool-name>`.

## Step 3: Frontend page

Create `frontend/apps/web/app/(tools)/<tool>/page.tsx`:

```typescript
"use client"

import { useFetch } from "@/lib/use-fetch"

export default function NewToolPage() {
  const { data, loading } = useFetch<unknown[]>("/newtool")

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--background)" }}>
      <header
        className="flex shrink-0 items-center px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h1 className="text-[15px] font-semibold tracking-tight">New Tool</h1>
      </header>
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading && <div style={{ color: "var(--text-tertiary)" }}>Loading…</div>}
      </div>
    </div>
  )
}
```

- Use `useFetch` for one-shot data, `usePoll` for live data.
- Style with CSS custom properties for colors, Tailwind for layout.
- Monospace (`font-mono`) for data values, sans for structure.

## Step 4: Sidebar entry

In `frontend/apps/web/components/app-sidebar.tsx`, add to the `items` array inside the "Tools" section:

```typescript
{ href: "/newtool", label: "New Tool", icon: "◇" }
```

Pick an icon glyph that isn't already used. For optional tools, add `optional: true` and `settingsKey: "newtool"`.

## Step 5: Tools layout name map

In `frontend/apps/web/app/(tools)/layout.tsx`, add to the `toolNames` record:

```typescript
"/newtool": "New Tool",
```

This controls the title shown in the top bar.

## Step 6: Verify

```bash
cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
cd frontend && bun run dev
```

Confirm:
- `http://localhost:8000/api/newtool` returns data
- `http://localhost:3000/newtool` renders the page
- Sidebar shows the new entry
- Top bar shows the tool name
