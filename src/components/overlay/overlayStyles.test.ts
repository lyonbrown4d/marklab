import { describe, expect, it } from 'vitest'
import {
  menuItemStyles,
  menuSeparatorStyles,
  menuShortcutStyles,
  menuSurfaceStyles,
} from '@/components/overlay/overlayStyles'

describe('application overlay styles', () => {
  it('uses one semantic surface treatment for dropdown and context menus', () => {
    const surface = menuSurfaceStyles()

    expect(surface).toContain('rounded-xl')
    expect(surface).toContain('border-border/80')
    expect(surface).toContain('bg-popover/98')
    expect(surface).toContain('shadow-foreground/10')
    expect(surface).toContain('backdrop-blur-[var(--menu-surface-blur)]')
    expect(surface).not.toContain('backdrop-blur-xl')
    expect(surface).not.toContain('dark:')
  })

  it('keeps menu items compact and provides semantic interaction states', () => {
    const defaultItem = menuItemStyles()
    const destructiveItem = menuItemStyles({ tone: 'destructive' })

    expect(defaultItem).toContain('min-h-8')
    expect(defaultItem).toContain('text-[13px]')
    expect(defaultItem).toContain('data-[highlighted]:bg-accent/80')
    expect(defaultItem).toContain('focus-visible:ring-1')
    expect(defaultItem).not.toContain('before:')
    expect(destructiveItem).toContain('text-destructive')
    expect(destructiveItem).toContain('data-[highlighted]:bg-destructive/10')
  })

  it('reserves leading space for radio item selection indicators', () => {
    const radioItem = menuItemStyles({ inset: true })

    expect(radioItem).toContain('pl-8')
    expect(radioItem).toContain('pr-2.5')
    expect(radioItem).not.toContain('px-2.5')
  })

  it('shares separator and shortcut typography without raw theme colors', () => {
    expect(menuSeparatorStyles).toContain('bg-border/70')
    expect(menuShortcutStyles).toContain('text-muted-foreground')
    expect(`${menuSeparatorStyles} ${menuShortcutStyles}`).not.toContain('dark:')
  })
})
