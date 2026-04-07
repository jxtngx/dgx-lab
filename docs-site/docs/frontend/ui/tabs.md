# Tabs

`frontend/packages/ui/src/components/tabs.tsx`

## `Tabs` {#tabs}

**Component**

```typescript
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props)
```

## `TabsList` {#tabslist}

**Component**

```typescript
function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>)
```

## `TabsTrigger` {#tabstrigger}

**Component**

```typescript
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props)
```

## `TabsContent` {#tabscontent}

**Component**

```typescript
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props)
```
