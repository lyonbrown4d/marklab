import { useState, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { ContextMenuItem, ContextMenuShortcut } from '@/components/ui/context-menu'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

type IconComponent = ComponentType<{ className?: string }>

const MenuShortcut = ({ children }: { children: ReactNode }) => (
  <ContextMenuShortcut className="ml-3 tracking-normal">
    <Kbd className="h-4 min-w-4 px-1 text-[10px]">{children}</Kbd>
  </ContextMenuShortcut>
)

export const FileTreeContextMenuItem = ({
  children,
  destructive,
  icon: Icon,
  shortcutLabel,
  ...props
}: ComponentProps<typeof ContextMenuItem> & {
  icon: IconComponent
  shortcutLabel?: ReactNode
  destructive?: boolean
}) => {
  const [active, setActive] = useState(false)
  const activeStyle = active
    ? {
        backgroundColor: destructive ? 'hsl(var(--destructive) / 0.12)' : 'hsl(var(--accent))',
        color: destructive ? 'hsl(var(--destructive))' : 'hsl(var(--accent-foreground))',
      }
    : undefined

  return (
    <ContextMenuItem
      {...props}
      data-active={active ? 'true' : undefined}
      style={{ ...props.style, ...activeStyle }}
      onBlur={(event) => {
        setActive(false)
        props.onBlur?.(event)
      }}
      onFocus={(event) => {
        setActive(true)
        props.onFocus?.(event)
      }}
      onMouseEnter={(event) => {
        setActive(true)
        props.onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        setActive(false)
        props.onMouseLeave?.(event)
      }}
      onPointerMove={(event) => {
        setActive(true)
        props.onPointerMove?.(event)
      }}
      className={cn(
        'group/file-tree-menu relative gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
        'before:absolute before:left-0 before:top-1 before:h-5 before:w-0.5 before:rounded-full before:bg-transparent before:transition-colors',
        'hover:bg-accent hover:text-accent-foreground hover:before:bg-primary',
        'data-[active=true]:before:bg-primary data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:before:bg-primary',
        destructive &&
          'text-destructive hover:bg-destructive/10 hover:text-destructive hover:before:bg-destructive data-[active=true]:before:bg-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive data-[highlighted]:before:bg-destructive',
        props.className,
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-colors group-hover/file-tree-menu:text-accent-foreground group-data-[active=true]/file-tree-menu:text-accent-foreground group-data-[highlighted]/file-tree-menu:text-accent-foreground',
          destructive &&
            'text-destructive/80 group-hover/file-tree-menu:text-destructive group-data-[active=true]/file-tree-menu:text-destructive group-data-[highlighted]/file-tree-menu:text-destructive',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcutLabel ? <MenuShortcut>{shortcutLabel}</MenuShortcut> : null}
    </ContextMenuItem>
  )
}
