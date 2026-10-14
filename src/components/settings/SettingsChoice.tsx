import type { ComponentProps, KeyboardEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SettingsChoiceGridProps = ComponentProps<'div'> & {
  children: ReactNode
  columns?: 1 | 2 | 3
}

type SettingsChoiceButtonProps = ComponentProps<typeof Button> & {
  selected: boolean
  selectedVariant?: ComponentProps<typeof Button>['variant']
  unselectedVariant?: ComponentProps<typeof Button>['variant']
}

const gridColumnClass: Record<NonNullable<SettingsChoiceGridProps['columns']>, string> = {
  1: 'flex-col items-start',
  2: 'flex-row flex-wrap',
  3: 'flex-row flex-wrap',
}

const choiceButtonSelector = '[role="radio"]:not(:disabled):not([aria-disabled="true"])'

const handleChoiceGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  const isForwardKey = event.key === 'ArrowRight' || event.key === 'ArrowDown'
  const isBackwardKey = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
  const isBoundaryKey = event.key === 'Home' || event.key === 'End'

  if (!isForwardKey && !isBackwardKey && !isBoundaryKey) {
    return
  }

  const choices = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(choiceButtonSelector),
  )

  if (choices.length === 0) {
    return
  }

  event.preventDefault()

  const activeIndex = choices.findIndex((choice) => choice === document.activeElement)
  const checkedIndex = choices.findIndex((choice) => choice.getAttribute('aria-checked') === 'true')
  const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(checkedIndex, 0)
  const lastIndex = choices.length - 1
  let nextIndex: number

  if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = lastIndex
  } else if (isForwardKey) {
    nextIndex = (currentIndex + 1) % choices.length
  } else {
    nextIndex = (currentIndex - 1 + choices.length) % choices.length
  }

  const nextChoice = choices[nextIndex]

  nextChoice.focus()
  nextChoice.click()
}

export const SettingsChoiceGrid = ({
  children,
  columns = 2,
  className,
  onKeyDown,
  ...props
}: SettingsChoiceGridProps) => {
  return (
    <div
      role="radiogroup"
      className={cn('flex max-w-full gap-1.5', gridColumnClass[columns], className)}
      onKeyDown={(event) => {
        onKeyDown?.(event)

        if (!event.defaultPrevented) {
          handleChoiceGridKeyDown(event)
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export const SettingsChoiceButton = ({
  selected,
  selectedVariant = 'secondary',
  unselectedVariant = 'outline',
  className,
  type = 'button',
  tabIndex,
  ...props
}: SettingsChoiceButtonProps) => {
  const isDisabled = props.disabled === true
  return (
    <Button
      {...props}
      type={type}
      role="radio"
      variant={selected ? selectedVariant : unselectedVariant}
      tabIndex={tabIndex ?? (selected ? 0 : -1)}
      data-selected={selected ? 'true' : 'false'}
      aria-checked={selected}
      className={cn(
        'h-8 max-w-full justify-start rounded-md border border-border/60 px-2.5 text-xs text-foreground shadow-none transition-colors motion-reduce:transition-none',
        'hover:border-border hover:bg-accent hover:text-accent-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1',
        'data-[selected=true]:border-primary/50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        isDisabled && 'opacity-[0.55]',
        className,
      )}
    />
  )
}
