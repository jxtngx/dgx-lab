# Sheet

`frontend/packages/ui/src/components/sheet.tsx`

## `Sheet` {#sheet}

**Component**

```typescript
function Sheet({ ...props }: SheetPrimitive.Root.Props)
```

## `SheetTrigger` {#sheettrigger}

**Component**

```typescript
function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props)
```

## `SheetClose` {#sheetclose}

**Component**

```typescript
function SheetClose({ ...props }: SheetPrimitive.Close.Props)
```

## `SheetContent` {#sheetcontent}

**Component**

```typescript
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
})
```

## `SheetHeader` {#sheetheader}

**Component**

```typescript
function SheetHeader({ className, ...props }: React.ComponentProps<"div">)
```

## `SheetFooter` {#sheetfooter}

**Component**

```typescript
function SheetFooter({ className, ...props }: React.ComponentProps<"div">)
```

## `SheetTitle` {#sheettitle}

**Component**

```typescript
function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props)
```

## `SheetDescription` {#sheetdescription}

**Component**

```typescript
function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props)
```
