import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'

type SettingsPanelProps = {
  estimatedPages: number
  exporting: boolean
  onCancel: () => void
  onExport: () => void
  onOptionChange: <Key extends keyof WorkspacePublicationOptions>(
    key: Key,
    value: WorkspacePublicationOptions[Key],
  ) => void
  options: WorkspacePublicationOptions
  selectedCount: number
  totalWords: number
}

export const WorkspacePublicationSettingsPanel = ({
  estimatedPages,
  exporting,
  onCancel,
  onExport,
  onOptionChange,
  options,
  selectedCount,
  totalWords,
}: SettingsPanelProps) => {
  const { t } = useI18n()
  const paginated = options.format === 'pdf' || options.format === 'docx'
  return (
    <aside className="flex min-h-0 flex-col border-l bg-muted/10">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <h2 className="text-sm font-semibold">{t('workspaceExport.printSettings')}</h2>
        <SettingsGroup label={t('workspaceExport.outputFormat')}>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border p-1">
            {(['pdf', 'docx', 'epub', 'txt'] as const).map((format) => (
              <Button
                className="h-8 rounded-sm text-xs"
                key={format}
                onClick={() => onOptionChange('format', format)}
                type="button"
                variant={options.format === format ? 'secondary' : 'ghost'}
              >
                {format === 'docx' ? 'Word' : format.toUpperCase()}
              </Button>
            ))}
          </div>
        </SettingsGroup>
        {paginated && (
          <SettingsGroup label={t('workspaceExport.pageSettings')}>
            <SettingSelect
              label={t('workspaceExport.pageSize')}
              onChange={(value) =>
                onOptionChange('pageSize', value as WorkspacePublicationOptions['pageSize'])
              }
              value={options.pageSize}
              values={[
                ['a4', 'A4 (210 × 297 mm)'],
                ['a5', 'A5 (148 × 210 mm)'],
                ['letter', 'Letter (8.5 × 11 in)'],
              ]}
            />
            <SettingSelect
              label={t('workspaceExport.orientation')}
              onChange={(value) =>
                onOptionChange('orientation', value as WorkspacePublicationOptions['orientation'])
              }
              value={options.orientation}
              values={[
                ['portrait', t('workspaceExport.portrait')],
                ['landscape', t('workspaceExport.landscape')],
              ]}
            />
            <SettingSelect
              label={t('workspaceExport.margin')}
              onChange={(value) =>
                onOptionChange('margin', value as WorkspacePublicationOptions['margin'])
              }
              value={options.margin}
              values={[
                ['normal', t('workspaceExport.marginNormal')],
                ['narrow', t('workspaceExport.marginNarrow')],
                ['wide', t('workspaceExport.marginWide')],
              ]}
            />
          </SettingsGroup>
        )}
        <SettingsGroup label={t('workspaceExport.includeContent')}>
          <ToggleSetting
            checked={options.cover}
            label={t('workspaceExport.cover')}
            onChange={(value) => onOptionChange('cover', value)}
          />
          <ToggleSetting
            checked={options.tableOfContents}
            label={t('workspaceExport.tableOfContents')}
            onChange={(value) => onOptionChange('tableOfContents', value)}
          />
          {paginated && (
            <>
              <ToggleSetting
                checked={options.pageBreaks}
                label={t('workspaceExport.chapterBreaks')}
                onChange={(value) => onOptionChange('pageBreaks', value)}
              />
              <ToggleSetting
                checked={options.pageNumbers}
                label={t('workspaceExport.pageNumbers')}
                onChange={(value) => onOptionChange('pageNumbers', value)}
              />
            </>
          )}
        </SettingsGroup>
      </div>
      <div className="space-y-3 border-t p-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t('workspaceExport.estimatedOutput')}
          </div>
          {paginated && (
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {t('workspaceExport.pageCount', { count: estimatedPages })}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            {t('workspaceExport.wordCount', { count: totalWords.toLocaleString() })}
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button disabled={exporting} onClick={onCancel} type="button" variant="outline">
            {t('workspaceExport.cancel')}
          </Button>
          <Button disabled={exporting || selectedCount === 0} onClick={onExport} type="button">
            {exporting
              ? t('workspaceExport.exporting')
              : t('workspaceExport.export', {
                  format: options.format === 'docx' ? 'Word' : options.format.toUpperCase(),
                })}
          </Button>
        </div>
      </div>
    </aside>
  )
}

const SettingsGroup = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <section className="space-y-2.5">
    <h3 className="text-xs font-medium text-foreground">{label}</h3>
    {children}
  </section>
)

const SettingSelect = ({
  label,
  onChange,
  value,
  values,
}: {
  label: string
  onChange: (value: string) => void
  value: string
  values: Array<[string, string]>
}) => (
  <div className="space-y-1.5">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map(([itemValue, itemLabel]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {itemLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

const ToggleSetting = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (value: boolean) => void
}) => (
  <Label className="flex h-8 cursor-pointer items-center justify-between gap-3 text-xs font-normal">
    <span>{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </Label>
)
