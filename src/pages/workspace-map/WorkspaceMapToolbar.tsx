import type { Node } from '@xyflow/react'
import { Globe2, LayoutTemplate, Search } from 'lucide-react'
import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRovingToolbar } from '@/components/useRovingToolbar'
import { useI18n } from '@/i18n/useI18n'
import type { GraphNodeData } from '@/logic/graph'
import type { WorkspaceMapMode } from '@/pages/workspace-map/workspaceMapMode'

type WorkspaceMapToolbarProps = {
  externalCount: number
  mode: WorkspaceMapMode
  nodes: Node<GraphNodeData>[]
  onArrange: () => void
  onFocusNode: (node: Node<GraphNodeData>) => void
  onModeChange: (mode: WorkspaceMapMode) => void
  onSearchOpenChange: (open: boolean) => void
  onToggleExternalResources: () => void
  searchOpen: boolean
  showExternalResources: boolean
}

const isFindShortcut = (event: ReactKeyboardEvent) =>
  (event.ctrlKey || event.metaKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'f'

export const WorkspaceMapToolbar = ({
  externalCount,
  mode,
  nodes,
  onArrange,
  onFocusNode,
  onModeChange,
  onSearchOpenChange,
  onToggleExternalResources,
  searchOpen,
  showExternalResources,
}: WorkspaceMapToolbarProps) => {
  const { t } = useI18n()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const {
    ref: toolbarRef,
    onFocusCapture: handleToolbarFocus,
    onKeyDown: handleToolbarKeyDown,
  } = useRovingToolbar(externalCount > 0)
  const externalLabel = showExternalResources
    ? t('workspaceMap.hideExternalResources')
    : t('workspaceMap.showExternalResources')
  const handleSearchKeyDown = (event: ReactKeyboardEvent) => {
    if (!isFindShortcut(event)) return
    event.preventDefault()
    event.stopPropagation()
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }

  return (
    <div
      ref={toolbarRef}
      aria-label={t('workspaceMap.toolbar')}
      className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2"
      onFocusCapture={handleToolbarFocus}
      onKeyDown={handleToolbarKeyDown}
      role="toolbar"
    >
      <Popover open={searchOpen} onOpenChange={onSearchOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            aria-label={t('workspaceMap.searchNodes')}
            className="h-8 gap-2 bg-card/95 px-2.5 shadow-sm backdrop-blur"
            size="sm"
            variant="outline"
          >
            <Search aria-hidden="true" className="size-3.5" />
            <span className="hidden sm:inline">{t('workspaceMap.searchNodes')}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(360px,calc(100vw-24px))] p-0">
          <Command label={t('workspaceMap.searchNodes')} onKeyDown={handleSearchKeyDown}>
            <CommandInput
              aria-label={t('workspaceMap.searchNodes')}
              autoFocus
              placeholder={t('workspaceMap.searchPlaceholder')}
              ref={searchInputRef}
            />
            <CommandList>
              <CommandEmpty>{t('workspaceMap.searchEmpty')}</CommandEmpty>
              {searchOpen
                ? nodes.map((node) => (
                    <CommandItem
                      key={node.id}
                      value={`${node.data.label} ${node.data.path ?? node.data.url ?? ''}`}
                      onSelect={() => {
                        onFocusNode(node)
                        onSearchOpenChange(false)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{node.data.label}</span>
                      <span className="max-w-44 truncate text-xs text-muted-foreground">
                        {node.data.path ?? node.data.url}
                      </span>
                    </CommandItem>
                  ))
                : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div
        aria-label={t('workspaceMap.viewMode')}
        className="flex h-8 items-center rounded-md border border-input bg-card/95 p-0.5 shadow-sm backdrop-blur"
        role="group"
      >
        {(['focus', 'overview'] as const).map((item) => (
          <Button
            key={item}
            type="button"
            aria-label={t(`workspaceMap.${item}Mode`)}
            aria-pressed={mode === item}
            className="h-6 px-2 text-[11px]"
            onClick={() => onModeChange(item)}
            size="sm"
            variant={mode === item ? 'secondary' : 'ghost'}
          >
            {t(`workspaceMap.${item}Mode`)}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        aria-label={t('workspaceMap.autoArrange')}
        className="h-8 gap-2 bg-card/95 px-2.5 shadow-sm backdrop-blur"
        onClick={onArrange}
        size="sm"
        variant="outline"
      >
        <LayoutTemplate aria-hidden="true" className="size-3.5" />
        <span className="hidden md:inline">{t('workspaceMap.autoArrange')}</span>
      </Button>
      {externalCount > 0 ? (
        <Button
          type="button"
          aria-label={externalLabel}
          aria-pressed={showExternalResources}
          className="h-8 gap-2 bg-card/95 px-2.5 shadow-sm backdrop-blur"
          onClick={onToggleExternalResources}
          size="sm"
          variant={showExternalResources ? 'secondary' : 'outline'}
        >
          <Globe2 aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline">{externalLabel}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
            {externalCount}
          </span>
        </Button>
      ) : null}
    </div>
  )
}
