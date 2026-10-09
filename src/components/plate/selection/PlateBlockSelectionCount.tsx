import { BlockSelectionPlugin } from '@platejs/selection/react'
import { usePluginOption } from 'platejs/react'
import { useI18n } from '@/i18n/useI18n'

export const PlateBlockSelectionCount = () => {
  const { t } = useI18n()
  const selectedIds = usePluginOption(BlockSelectionPlugin, 'selectedIds')
  const count = selectedIds?.size ?? 0
  if (count < 2) return null

  return (
    <div
      aria-label={t('plate.blockSelection.count', { count })}
      aria-live="polite"
      className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-primary/25 bg-background/90 px-2.5 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur motion-reduce:transition-none"
      data-testid="plate-block-selection-count"
      role="status"
    >
      {count}
    </div>
  )
}
