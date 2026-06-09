import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

type SettingsRowProps = {
  title: string
  description: string
  control: ReactNode
}

type SettingsSectionProps = {
  title: string
  description: string
  children: ReactNode
  icon?: ElementType
  surface?: boolean
  className?: string
}

type SettingsChoiceGridProps = {
  children: ReactNode
  columns?: 2 | 3
  className?: string
}

type SettingsChoiceButtonProps = ComponentProps<typeof Button> & {
  selected: boolean
  selectedVariant?: ComponentProps<typeof Button>['variant']
  unselectedVariant?: ComponentProps<typeof Button>['variant']
}

type SettingsSwitchRowProps = Omit<SettingsRowProps, 'control'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

const gridColumnClass: Record<NonNullable<SettingsChoiceGridProps['columns']>, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

const joinClassNames = (...classNames: Array<string | false | null | undefined>) => {
  return classNames.filter(Boolean).join(' ')
}

const SettingsRow = ({ title, description, control }: SettingsRowProps) => {
  return (
    <div className="settings-row-surface flex items-start justify-between gap-4 rounded-md p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  )
}

export const SettingsSection = ({
  title,
  description,
  children,
  icon: Icon,
  surface = true,
  className,
}: SettingsSectionProps) => {
  return (
    <section
      className={joinClassNames(surface && 'settings-row-surface rounded-md p-3', className)}
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {title}
      </div>
      <div className="mb-3 text-xs leading-5 text-muted-foreground">{description}</div>
      {children}
    </section>
  )
}

export const SettingsChoiceGrid = ({
  children,
  columns = 2,
  className,
}: SettingsChoiceGridProps) => {
  return (
    <div className={joinClassNames('grid grid-cols-1 gap-2', gridColumnClass[columns], className)}>
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
  return (
    <Button
      {...props}
      type={type}
      variant={selected ? selectedVariant : unselectedVariant}
      data-selected={selected ? 'true' : 'false'}
      className={joinClassNames('h-9 justify-start rounded-md', className)}
    />
  )
}

export const SettingsSwitchRow = ({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: SettingsSwitchRowProps) => {
  return (
    <SettingsRow
      title={title}
      description={description}
      control={<Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />}
    />
  )
}

export default SettingsRow
