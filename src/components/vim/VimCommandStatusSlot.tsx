import { useCallback } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { setVimCommandHost } from '@/components/vim/vimCommandDock'

type VimCommandStatusSlotProps = { visible: boolean }

export const VimCommandStatusSlot = ({ visible }: VimCommandStatusSlotProps) => {
  const { t } = useI18n()
  const setHost = useCallback(
    (node: HTMLDivElement | null) => {
      setVimCommandHost(visible ? node : null)
    },
    [visible],
  )
  return (
    <div
      ref={setHost}
      data-vim-command-host=""
      role="group"
      aria-label={t('editor.vimStatusLabel')}
      className="min-w-0 flex-1 [&:empty]:hidden [&>div]:w-full [&>div]:border-0 [&>div]:bg-transparent [&>div]:px-1 [&>div]:py-0"
    />
  )
}
