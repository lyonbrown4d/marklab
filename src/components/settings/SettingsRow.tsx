import type { ReactNode } from 'react'

type SettingsRowProps = {
  title: string
  description: string
  control: ReactNode
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

export default SettingsRow
