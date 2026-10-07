import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import { openDialog } from '@/runtime/dialog'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { SettingsField, SettingsSection } from '@/components/settings/SettingsRow'

const TerminalSettingsSection = () => {
  const { t } = useI18n()
  const shellPath = usePreferencesStore((state) => state.terminalShellPath)
  const setShellPath = usePreferencesStore((state) => state.setTerminalShellPath)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)
  const pendingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [])

  const chooseShell = async () => {
    if (pendingRef.current) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      const selected = await openDialog({
        file: true,
        multiple: false,
        title: t('settings.terminalShellDialogTitle'),
      })
      if (!mountedRef.current || requestIdRef.current !== requestId) return
      if (typeof selected === 'string') setShellPath(selected)
    } catch (reason) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        pendingRef.current = false
        setPending(false)
      }
    }
  }

  const resetShell = () => {
    requestIdRef.current += 1
    pendingRef.current = false
    setPending(false)
    setError(null)
    setShellPath(null)
  }

  return (
    <SettingsSection targetId="settings-terminal" title={t('settings.terminal')} icon={Terminal}>
      <SettingsField
        title={t('settings.terminalShell')}
        description={t('settings.terminalShellDescription')}
        control={
          <div className="flex w-full max-w-md flex-col gap-2 sm:w-96">
            <Input
              aria-label={t('settings.terminalShell')}
              readOnly
              value={shellPath ?? t('settings.terminalShellAutomatic')}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void chooseShell()}
              >
                {pending && <Spinner aria-hidden="true" className="size-3.5" />}
                {t('settings.terminalShellChoose')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || shellPath === null}
                onClick={resetShell}
              >
                {t('settings.terminalShellReset')}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        }
      />
    </SettingsSection>
  )
}

export default TerminalSettingsSection
