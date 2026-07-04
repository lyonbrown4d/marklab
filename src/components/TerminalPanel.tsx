import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, RotateCcw, Terminal as TerminalIcon, X } from 'lucide-react'
import TerminalSessionPane, {
  type TerminalRuntimeState,
  type TerminalStatus,
} from '@/components/terminal/TerminalSessionPane'
import { shellName } from '@/components/terminal/terminalTheme'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import type { ThemeMode } from '@/store/appTypes'
import { cn } from '@/lib/utils'
import { isDesktopRuntime } from '@/runtime/environment'

type TerminalPanelProps = {
  onClose: () => void
  theme: ThemeMode
  visible: boolean
}

type TerminalTab = TerminalRuntimeState & {
  index: number
  key: string
  restartKey: number
}

const initialTerminalStatus = (): TerminalStatus => {
  return isDesktopRuntime() ? 'connecting' : 'unavailable'
}

const createTerminalTab = (index: number): TerminalTab => {
  return {
    error: null,
    index,
    key: `terminal-tab-${index}`,
    restartKey: 0,
    session: null,
    status: initialTerminalStatus(),
  }
}

const TerminalStatusIcon = ({ status }: { status: TerminalStatus }) => {
  if (status === 'connecting') {
    return (
      <Spinner
        aria-hidden="true"
        role="presentation"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    )
  }
  if (status === 'error') {
    return <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
  }
  return <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
}

const TerminalPanel = ({ onClose, theme, visible }: TerminalPanelProps) => {
  const { t } = useI18n()
  const nextTabIndexRef = useRef(2)
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [createTerminalTab(1)])
  const [activeTabKey, setActiveTabKey] = useState('terminal-tab-1')

  const statusLabel = useCallback(
    (status: TerminalStatus) =>
      status === 'connected'
        ? t('terminal.connected')
        : status === 'connecting'
          ? t('terminal.connecting')
          : status === 'exited'
            ? t('terminal.exited')
            : status === 'unavailable'
              ? t('terminal.unavailable')
              : t('terminal.error'),
    [t],
  )

  const handleTabStateChange = useCallback((tabKey: string, state: TerminalRuntimeState) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.key === tabKey ? { ...tab, ...state } : tab)),
    )
  }, [])

  const addTerminalTab = useCallback(() => {
    const index = nextTabIndexRef.current
    nextTabIndexRef.current += 1
    const tab = createTerminalTab(index)
    setTabs((currentTabs) => [...currentTabs, tab])
    setActiveTabKey(tab.key)
  }, [])

  const closeTerminalTab = useCallback(
    (tabKey: string) => {
      if (tabs.length <= 1) {
        onClose()
        return
      }

      const tabIndex = tabs.findIndex((tab) => tab.key === tabKey)
      const nextTabs = tabs.filter((tab) => tab.key !== tabKey)
      setTabs(nextTabs)
      if (activeTabKey === tabKey) {
        const nextActiveTab = nextTabs[Math.min(Math.max(tabIndex, 0), nextTabs.length - 1)]
        setActiveTabKey(nextActiveTab.key)
      }
    },
    [activeTabKey, onClose, tabs],
  )

  const restartActiveTerminal = useCallback(() => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.key === activeTabKey
          ? {
              ...tab,
              error: null,
              restartKey: tab.restartKey + 1,
              session: null,
              status: initialTerminalStatus(),
            }
          : tab,
      ),
    )
  }, [activeTabKey])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0],
    [activeTabKey, tabs],
  )
  const activeStatusLabel = statusLabel(activeTab.status)
  const activeSessionLabel = activeTab.session
    ? `${shellName(activeTab.session.shell)} · ${activeTab.session.cwd}`
    : activeStatusLabel

  return (
    <TooltipProvider>
      <Tabs
        value={activeTabKey}
        onValueChange={setActiveTabKey}
        aria-hidden={!visible}
        className={cn(
          'terminal-panel flex shrink-0 flex-col overflow-hidden border-t border-border/80',
          !visible && 'hidden',
        )}
      >
        <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 px-2">
          <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
          <TabsList
            aria-label={t('terminal.title')}
            className="terminal-tab-strip h-7 min-w-0 flex-1 justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 text-xs text-muted-foreground"
          >
            {tabs.map((tab) => {
              const title = tab.session
                ? shellName(tab.session.shell)
                : t('terminal.tab', { index: String(tab.index) })

              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  asChild
                  className="group h-7 min-w-28 max-w-52 shrink-0 justify-start gap-0 overflow-hidden rounded-md border px-0 py-0 text-xs font-normal transition-colors data-[state=active]:border-border/90 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:shadow-none data-[state=inactive]:hover:border-border/60 data-[state=inactive]:hover:bg-muted/70 data-[state=inactive]:hover:text-foreground"
                >
                  <div title={title}>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left">
                      <TerminalStatusIcon status={tab.status} />
                      <span className="truncate">{title}</span>
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={t('terminal.closeTab')}
                          className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation()
                            closeTerminalTab(tab.key)
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('terminal.closeTab')}</TooltipContent>
                    </Tooltip>
                  </div>
                </TabsTrigger>
              )
            })}
          </TabsList>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={addTerminalTab}
              >
                <Plus data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('terminal.new')}</TooltipContent>
          </Tooltip>
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            <span className="hidden max-w-[220px] truncate text-[11px] text-muted-foreground lg:inline">
              {activeSessionLabel}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={restartActiveTerminal}
                >
                  <RotateCcw data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('terminal.restart')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={onClose}
                >
                  <X data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('terminal.close')}</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <TerminalSessionPane
              key={tab.key}
              active={tab.key === activeTabKey}
              exitedLabel={t('terminal.exited')}
              restartKey={tab.restartKey}
              statusLabel={statusLabel(tab.status)}
              tabKey={tab.key}
              theme={theme}
              visible={visible}
              onStateChange={handleTabStateChange}
            />
          ))}
        </div>
      </Tabs>
    </TooltipProvider>
  )
}

export default TerminalPanel
