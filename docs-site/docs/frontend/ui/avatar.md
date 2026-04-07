# Avatar

`frontend/packages/ui/src/components/avatar.tsx`

## `Avatar` {#avatar}

**Component**

```typescript
function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg"
})
```

## `AvatarImage` {#avatarimage}

**Component**

```typescript
function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props)
```

## `AvatarFallback` {#avatarfallback}

**Component**

```typescript
function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props)
```

## `AvatarBadge` {#avatarbadge}

**Component**

```typescript
function AvatarBadge({ className, ...props }: React.ComponentProps<"span">)
```

## `AvatarGroup` {#avatargroup}

**Component**

```typescript
function AvatarGroup({ className, ...props }: React.ComponentProps<"div">)
```

## `AvatarGroupCount` {#avatargroupcount}

**Component**

```typescript
function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">)
```
