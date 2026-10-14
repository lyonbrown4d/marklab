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
  description?: ReactNode
  control: ReactNode
  disabled?: boolean
  className?: string
}

type SettingsSectionProps = {
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  targetId?: string
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
  return <div className={cn('flex flex-col gap-5', className)} {...props} />
}

export const SettingsFieldGroup = ({ className, ...props }: ComponentProps<typeof FieldGroup>) => {
  return (
    <FieldGroup
      className={cn(
        'gap-0 [&>[data-slot=field]+[data-slot=field]]:border-t [&>[data-slot=field]+[data-slot=field]]:border-border/50',
        className,
      )}
      {...props}
    />
  )
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
  targetId,
  icon: Icon,
  surface = false,
  className,
  bodyClassName,
}: SettingsSectionProps) => {
  return (
    <section
      id={targetId}
      tabIndex={targetId ? -1 : undefined}
      className={cn('flex flex-col gap-2', surface && 'rounded-lg bg-muted/30 p-3', className)}
    >
      {(title || description) && (
        <header className="flex items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-sm font-medium">{title}</h2>}
            {description && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            )}
          </div>
        </header>
      )}
      <div className={cn('flex flex-col gap-0', bodyClassName)}>{children}</div>
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
      orientation="vertical"
      data-disabled={disabled ? 'true' : undefined}
      className={cn(
        'items-start justify-between gap-2 py-2.5 data-[disabled=true]:opacity-60 sm:flex-row sm:items-center sm:gap-4 sm:[&>*]:w-auto',
        className,
      )}
    >
      <FieldContent className="min-w-0 gap-1">
        <FieldTitle>{title}</FieldTitle>
        {description && (
          <FieldDescription className="text-xs leading-5">{description}</FieldDescription>
        )}
      </FieldContent>
      <div className="flex w-full max-w-full shrink-0 justify-start sm:w-auto sm:justify-end">
        {control}
      </div>
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
      className={cn('flex-row items-center gap-4 [&>*]:w-auto', className)}
      control={
        <SettingsSwitch
          aria-label={typeof title === 'string' ? title : undefined}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
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
          <SelectTrigger
            aria-label={typeof title === 'string' ? title : undefined}
            className="h-8 min-w-36 max-w-full"
          >
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
