import { CalendarDays, Link2, List, Tags, ToggleLeft, Type, type LucideIcon } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { FrontmatterField } from '@/components/plate/frontmatter/plateFrontmatterModel'

type FrontmatterFieldControlProps = {
  disabled: boolean
  field: FrontmatterField
  onChange: (value: boolean | string | string[]) => void
}

const fieldPresentation: Record<FrontmatterField['kind'], [LucideIcon, string]> = {
  boolean: [ToggleLeft, 'Boolean'],
  date: [CalendarDays, 'Date'],
  link: [Link2, 'Link'],
  list: [List, 'List'],
  scalar: [Type, 'Text'],
  tag: [Tags, 'Tag'],
  tags: [Tags, 'Tags'],
}

export const FrontmatterFieldControl = ({
  disabled,
  field,
  onChange,
}: FrontmatterFieldControlProps) => {
  const [Icon, typeLabel] = fieldPresentation[field.kind]
  const label = `${field.key} frontmatter value`
  const heading = (
    <div className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium text-foreground">{field.key}</span>
      <span className="text-[11px] text-muted-foreground">{typeLabel}</span>
    </div>
  )

  if (field.kind === 'boolean') {
    return (
      <div className="flex min-h-9 items-center justify-between gap-4 py-1">
        {heading}
        <Switch
          aria-label={label}
          checked={field.value}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
    )
  }

  if (field.kind === 'list' || field.kind === 'tags') {
    const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.currentTarget.value
      onChange(value === '' ? [] : value.split('\n'))
    }
    return (
      <label className="grid gap-1.5 py-1.5">
        {heading}
        <Textarea
          aria-label={label}
          className="min-h-20 resize-y font-mono text-xs leading-5"
          disabled={disabled}
          onChange={handleChange}
          rows={Math.max(2, field.value.length)}
          spellCheck={false}
          value={field.value.join('\n')}
        />
      </label>
    )
  }

  const valueType = 'valueType' in field ? field.valueType : 'string'
  return (
    <label className="grid gap-1.5 py-1.5">
      {heading}
      <Input
        aria-label={label}
        disabled={disabled}
        inputMode={valueType === 'number' ? 'decimal' : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
        spellCheck={field.kind === 'scalar'}
        type={field.kind === 'date' ? 'date' : 'text'}
        value={field.value}
      />
    </label>
  )
}
