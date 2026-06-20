import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SettingsChoiceGridProps = {
  children: ReactNode
  columns?: 1 | 2 | 3
  className?: string
}

type SettingsChoiceButtonProps = ComponentProps<typeof Button> & {
  selected: boolean
  selectedVariant?: ComponentProps<typeof Button>['variant']
  unselectedVariant?: ComponentProps<typeof Button>['variant']
}

const gridColumnClass: Record<NonNullable<SettingsChoiceGridProps['columns']>, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

export const SettingsChoiceGrid = ({
  children,
  columns = 2,
  className,
}: SettingsChoiceGridProps) => {
  return (
    <div
      role="group"
      className={cn(
        'settings-choice-grid grid grid-cols-1 gap-2',
        gridColumnClass[columns],
        className,
      )}
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
  ...props
}: SettingsChoiceButtonProps) => {
  const isDisabled = props.disabled === true
  return (
    <Button
      {...props}
      type={type}
      variant={selected ? selectedVariant : unselectedVariant}
      data-selected={selected ? 'true' : 'false'}
      aria-pressed={selected ? 'true' : 'false'}
      className={cn(
        'settings-choice-button h-9 justify-start rounded-md',
        selected && 'settings-choice-button-selected',
        isDisabled && 'settings-choice-button-disabled',
        className,
      )}
    />
  )
}
