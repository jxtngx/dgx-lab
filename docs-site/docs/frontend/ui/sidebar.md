# Sidebar

`frontend/packages/ui/src/components/sidebar.tsx`

## `useSidebar` {#usesidebar}

**Hook**

```typescript
function useSidebar()
```

## `SidebarProvider` {#sidebarprovider}

**Component**

```typescript
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
})
```

## `Sidebar` {#sidebar}

**Component**

```typescript
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
})
```

## `SidebarTrigger` {#sidebartrigger}

**Component**

```typescript
function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>)
```

## `SidebarRail` {#sidebarrail}

**Component**

```typescript
function SidebarRail({ className, ...props }: React.ComponentProps<"button">)
```

## `SidebarInset` {#sidebarinset}

**Component**

```typescript
function SidebarInset({ className, ...props }: React.ComponentProps<"main">)
```

## `SidebarInput` {#sidebarinput}

**Component**

```typescript
function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>)
```

## `SidebarHeader` {#sidebarheader}

**Component**

```typescript
function SidebarHeader({ className, ...props }: React.ComponentProps<"div">)
```

## `SidebarFooter` {#sidebarfooter}

**Component**

```typescript
function SidebarFooter({ className, ...props }: React.ComponentProps<"div">)
```

## `SidebarSeparator` {#sidebarseparator}

**Component**

```typescript
function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>)
```

## `SidebarContent` {#sidebarcontent}

**Component**

```typescript
function SidebarContent({ className, ...props }: React.ComponentProps<"div">)
```

## `SidebarGroup` {#sidebargroup}

**Component**

```typescript
function SidebarGroup({ className, ...props }: React.ComponentProps<"div">)
```

## `SidebarGroupLabel` {#sidebargrouplabel}

**Component**

```typescript
function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">)
```

## `SidebarGroupAction` {#sidebargroupaction}

**Component**

```typescript
function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">)
```

## `SidebarGroupContent` {#sidebargroupcontent}

**Component**

```typescript
function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">)
```

## `SidebarMenu` {#sidebarmenu}

**Component**

```typescript
function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">)
```

## `SidebarMenuItem` {#sidebarmenuitem}

**Component**

```typescript
function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">)
```

## `SidebarMenuButton` {#sidebarmenubutton}

**Component**

```typescript
function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof sidebarMenuButtonVariants>)
```

## `SidebarMenuAction` {#sidebarmenuaction}

**Component**

```typescript
function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  })
```

## `SidebarMenuBadge` {#sidebarmenubadge}

**Component**

```typescript
function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">)
```

## `SidebarMenuSkeleton` {#sidebarmenuskeleton}

**Component**

```typescript
function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
})
```

## `SidebarMenuSub` {#sidebarmenusub}

**Component**

```typescript
function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">)
```

## `SidebarMenuSubItem` {#sidebarmenusubitem}

**Component**

```typescript
function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">)
```

## `SidebarMenuSubButton` {#sidebarmenusubbutton}

**Component**

```typescript
function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md"
    isActive?: boolean
  })
```
