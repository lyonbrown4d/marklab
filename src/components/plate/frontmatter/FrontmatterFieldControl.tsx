import { CalendarDays, Link2, List, Tags, ToggleLeft, Type, type LucideIcon } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { useI18n } from '@/i18n/useI18n'
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
  boolean: [ToggleLeft, 'editor.frontmatter.types.boolean'],
  date: [CalendarDays, 'editor.frontmatter.types.date'],
  link: [Link2, 'editor.frontmatter.types.link'],
  list: [List, 'editor.frontmatter.types.list'],
  scalar: [Type, 'editor.frontmatter.types.scalar'],
  tag: [Tags, 'editor.frontmatter.types.tag'],
  tags: [Tags, 'editor.frontmatter.types.tags'],
}

export const FrontmatterFieldControl = ({
  disabled,
  field,
  onChange,
}: FrontmatterFieldControlProps) => {
  const { t } = useI18n()
  const savedValue = Array.isArray(field.value) ? field.value.join('\n') : String(field.value)
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null)
  const value = draft?.base === savedValue ? draft.value : savedValue
  const commit = () => {
    if (!disabled && value !== savedValue) {
      onChange(
        field.kind === 'list' || field.kind === 'tags'
          ? value === ''
            ? []
            : value.split('\n')
          : value,
      )
    }
    setDraft(null)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setDraft(null)
    } else if (
      event.key === 'Enter' &&
      (event.currentTarget.tagName === 'INPUT' || event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault()
      event.stopPropagation()
      commit()
    }
  }
  const [Icon, typeLabel] = fieldPresentation[field.kind]
  const label = t('editor.frontmatter.fieldValue', { key: field.key })
  const heading = (
    <div className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-medium text-foreground">{field.key}</span>
      <span className="text-[11px] text-muted-foreground">{t(typeLabel)}</span>
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
    return (
      <label className="grid gap-1.5 py-1.5">
        {heading}
        <Textarea
          aria-label={label}
          className="min-h-20 resize-y font-mono text-xs leading-5"
          disabled={disabled}
          onChange={(event) => setDraft({ base: savedValue, value: event.currentTarget.value })}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={Math.max(2, field.value.length)}
          spellCheck={false}
          value={value}
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
        onChange={(event) => setDraft({ base: savedValue, value: event.currentTarget.value })}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        spellCheck={field.kind === 'scalar'}
        type={field.kind === 'date' ? 'date' : 'text'}
        value={value}
      />
    </label>
  )
}
