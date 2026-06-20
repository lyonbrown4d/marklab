import type { ComponentProps, ElementType, ReactNode } from 'react'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import SettingsSwitch from '@/components/settings/SettingsSwitch'

type SettingsRowProps = {
  title: ReactNode
  description: ReactNode
  control: ReactNode
  disabled?: boolean
  className?: string
}

type SettingsSectionProps = {
  title: ReactNode
  description: ReactNode
  children: ReactNode
  icon?: ElementType
  surface?: boolean
  className?: string
  bodyClassName?: string
}

type SettingsSwitchRowProps = Omit<SettingsRowProps, 'control'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

type SettingsSelectOption = {
  value: string
  label: ReactNode
}

type SettingsSelectFieldProps = Omit<SettingsRowProps, 'control'> & {
  value: string
  onValueChange: (value: string) => void
  options: SettingsSelectOption[]
  placeholder?: string
}

export const SettingsPageStack = ({ className, ...props }: ComponentProps<'div'>) => {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />
}

export const SettingsFieldGroup = ({ className, ...props }: ComponentProps<typeof FieldGroup>) => {
  return <FieldGroup className={cn('gap-3', className)} {...props} />
}

export const SettingsSubsection = ({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}) => {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-1">
        <div className="text-xs font-medium">{title}</div>
        {description && (
          <div className="text-xs leading-5 text-muted-foreground">{description}</div>
        )}
      </div>
      {children}
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
  bodyClassName,
}: SettingsSectionProps) => {
  return (
    <section
      className={cn(
        'flex flex-col gap-3',
        surface && 'rounded-md border border-border/80 bg-card/70 p-3',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
      </header>
      <div className={cn('flex flex-col gap-3', bodyClassName)}>{children}</div>
    </section>
  )
}

export const SettingsField = ({
  title,
  description,
  control,
  disabled,
  className,
}: SettingsRowProps) => {
  return (
    <Field
      orientation="horizontal"
      data-disabled={disabled ? 'true' : undefined}
      className={cn(
        'items-start justify-between rounded-md border border-border/70 bg-background/60 p-3 data-[disabled=true]:opacity-60',
        className,
      )}
    >
      <FieldContent className="min-w-0 gap-1">
        <FieldTitle>{title}</FieldTitle>
        <FieldDescription className="text-xs leading-5">{description}</FieldDescription>
      </FieldContent>
      <div className="shrink-0 pt-0.5">{control}</div>
    </Field>
  )
}

const SettingsRow = SettingsField

export const SettingsSwitchField = ({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: SettingsSwitchRowProps) => {
  return (
    <SettingsField
      title={title}
      description={description}
      disabled={disabled}
      className={className}
      control={
        <SettingsSwitch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      }
    />
  )
}

export const SettingsSwitchRow = SettingsSwitchField

export const SettingsSelectField = ({
  title,
  description,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: SettingsSelectFieldProps) => {
  return (
    <SettingsField
      title={title}
      description={description}
      disabled={disabled}
      className={className}
      control={
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger className="min-w-40">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    />
  )
}

export { SettingsChoiceButton, SettingsChoiceGrid } from '@/components/settings/SettingsChoice'
export {
  SettingsActionButton,
  SettingsEmptyState,
  SettingsIconButton,
} from '@/components/settings/SettingsButtons'

export default SettingsRow
