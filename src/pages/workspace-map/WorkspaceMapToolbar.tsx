import { useState } from 'react'
import type { Node } from '@xyflow/react'
import { Globe2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/i18n/useI18n'
import type { GraphNodeData } from '@/logic/graph'

type WorkspaceMapToolbarProps = {
  externalCount: number
  nodes: Node<GraphNodeData>[]
  onFocusNode: (node: Node<GraphNodeData>) => void
  onToggleExternalResources: () => void
  showExternalResources: boolean
}

export const WorkspaceMapToolbar = ({
  externalCount,
  nodes,
  onFocusNode,
  onToggleExternalResources,
  showExternalResources,
}: WorkspaceMapToolbarProps) => {
  const { t } = useI18n()
  const [searchOpen, setSearchOpen] = useState(false)
  const externalLabel = showExternalResources
    ? t('workspaceMap.hideExternalResources')
    : t('workspaceMap.showExternalResources')

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
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
          <Command label={t('workspaceMap.searchNodes')}>
            <CommandInput
              aria-label={t('workspaceMap.searchNodes')}
              placeholder={t('workspaceMap.searchPlaceholder')}
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
                        setSearchOpen(false)
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
