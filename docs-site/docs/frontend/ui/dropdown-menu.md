# Dropdown-menu

`frontend/packages/ui/src/components/dropdown-menu.tsx`

## `DropdownMenu` {#dropdownmenu}

**Component**

```typescript
function DropdownMenu({ ...props }: MenuPrimitive.Root.Props)
```

## `DropdownMenuPortal` {#dropdownmenuportal}

**Component**

```typescript
function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props)
```

## `DropdownMenuTrigger` {#dropdownmenutrigger}

**Component**

```typescript
function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props)
```

## `DropdownMenuContent` {#dropdownmenucontent}

**Component**

```typescript
function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >)
```

## `DropdownMenuGroup` {#dropdownmenugroup}

**Component**

```typescript
function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props)
```

## `DropdownMenuLabel` {#dropdownmenulabel}

**Component**

```typescript
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
})
```

## `DropdownMenuItem` {#dropdownmenuitem}

**Component**

```typescript
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
})
```

## `DropdownMenuSub` {#dropdownmenusub}

**Component**

```typescript
function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props)
```

## `DropdownMenuSubTrigger` {#dropdownmenusubtrigger}

**Component**

```typescript
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
})
```

## `DropdownMenuSubContent` {#dropdownmenusubcontent}

**Component**

```typescript
function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>)
```

## `DropdownMenuCheckboxItem` {#dropdownmenucheckboxitem}

**Component**

```typescript
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
})
```

## `DropdownMenuRadioGroup` {#dropdownmenuradiogroup}

**Component**

```typescript
function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props)
```

## `DropdownMenuRadioItem` {#dropdownmenuradioitem}

**Component**

```typescript
function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
})
```

## `DropdownMenuSeparator` {#dropdownmenuseparator}

**Component**

```typescript
function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">)
```

## `DropdownMenuShortcut` {#dropdownmenushortcut}

**Component**

```typescript
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">)
```
