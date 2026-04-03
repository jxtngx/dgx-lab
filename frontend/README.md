# DGX Lab — Frontend

Bun + Turborepo monorepo powering the DGX Lab dashboard.

## Structure

```
apps/web        Next.js 16 app (standalone output, Turbopack dev)
packages/ui     Shared component library (Base UI primitives, Tailwind v4)
packages/eslint-config    Shared ESLint flat configs
packages/typescript-config  Shared tsconfig presets
```

## Quick start

```bash
bun install
bun run dev
```

The dev server starts on `http://localhost:3000` and proxies `/api/*` requests to the backend at `http://localhost:8000`.

## Adding UI components

```bash
bunx shadcn@latest add button -c apps/web
```

Components are placed in `packages/ui/src/components/` and imported as:

```tsx
import { Button } from "@workspace/ui/components/button";
```
