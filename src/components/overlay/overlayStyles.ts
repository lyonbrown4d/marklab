import { cva } from 'class-variance-authority'

export const menuSurfaceStyles = cva(
  'rounded-xl border border-border/80 bg-popover/98 p-1.5 text-popover-foreground shadow-xl shadow-foreground/10 backdrop-blur-xl',
)

export const menuItemStyles = cva(
  [
    'min-h-8 gap-2.5 rounded-lg py-1.5 text-[13px]',
    'hover:bg-accent/80 hover:text-accent-foreground',
    'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50',
    'active:bg-accent active:text-accent-foreground',
    'data-[highlighted]:bg-accent/80 data-[highlighted]:text-accent-foreground',
    'data-[active=true]:bg-accent/80 data-[active=true]:text-accent-foreground',
    'data-[state=open]:bg-accent/80 data-[state=open]:text-accent-foreground',
  ],
  {
    variants: {
      inset: {
        false: 'px-2.5',
        true: 'pl-8 pr-2.5',
      },
      tone: {
        default: '',
        destructive:
          'text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15 active:text-destructive data-[active=true]:bg-destructive/10 data-[active=true]:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive',
      },
    },
    defaultVariants: {
      inset: false,
      tone: 'default',
    },
  },
)

export const menuSeparatorStyles = 'mx-1 my-1.5 bg-border/70'

export const menuShortcutStyles =
  'ml-auto pl-5 font-mono text-[10px] tracking-normal text-muted-foreground'
