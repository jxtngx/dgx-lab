# Tooltip

`frontend/packages/ui/src/components/tooltip.tsx`

## `TooltipProvider` {#tooltipprovider}

**Component**

```typescript
function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props)
```

## `Tooltip` {#tooltip}

**Component**

```typescript
function Tooltip({ ...props }: TooltipPrimitive.Root.Props)
```

## `TooltipTrigger` {#tooltiptrigger}

**Component**

```typescript
function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props)
```

## `TooltipContent` {#tooltipcontent}

**Component**

```typescript
function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >)
```
