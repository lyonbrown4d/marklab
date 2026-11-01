import { useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { Focus, LayoutGrid, List, Minus, Plus, Shuffle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { graphNodeLocation } from '@/logic/graph'
import { useI18n } from '@/i18n/useI18n'
import { KnowledgeGraphNodeList } from '@/features/knowledge-graph/KnowledgeGraphNodeList'
import { useSigmaGraph } from '@/features/knowledge-graph/useSigmaGraph'
import { graphViewCache } from '@/features/knowledge-graph/graphViewCache'
import { graphLayoutKinds } from '@/features/knowledge-graph/graphLayoutTypes'
import type { GraphFocusRequest, KnowledgeGraphCanvasProps } from '@/features/knowledge-graph/types'

export const KnowledgeGraphCanvas = (props: KnowledgeGraphCanvasProps) => {
  const { t } = useI18n()
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [localFocus, setLocalFocus] = useState<GraphFocusRequest | null>(null)
  const layout = useStore(
    graphViewCache,
    (state) =>
      state.entries.find(
        (entry) =>
          entry.workspaceKey === props.workspaceKey &&
          entry.viewKey === (props.viewKey ?? 'workspace'),
      )?.layout ?? 'forceatlas2',
  )
  const { renderer, unavailable } = useSigmaGraph(container, {
    ...props,
    focusRequest: props.focusRequest ?? localFocus,
    onFocusConsumed: () => {
      if (props.focusRequest) props.onFocusConsumed?.()
      setLocalFocus(null)
    },
  })
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle
      ? props.graph.nodes.filter((node) =>
          `${node.label} ${graphNodeLocation(node)}`.toLocaleLowerCase().includes(needle),
        )
      : props.graph.nodes
  }, [props.graph.nodes, query])
  const select = (id: string) => {
    props.onSelectNode(id)
    setLocalFocus({ nodeId: id })
  }
  const showList = unavailable || listOpen || query.trim().length > 0
  return (
    <div
      className="relative size-full min-h-48 overflow-hidden bg-background"
      data-testid="knowledge-graph"
      data-graph-renderer={unavailable ? 'unavailable' : renderer ? 'sigma' : 'loading'}
      data-graph-node-count={props.graph.nodes.length}
      data-graph-edge-count={props.graph.edges.length}
    >
      <div
        aria-label={t('knowledgeGraph.canvas')}
        className="absolute inset-x-0 top-16 bottom-14 overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            props.onSelectNode(null)
            setQuery('')
            setListOpen(false)
          }
          if (event.key === 'Enter' && props.selectedNodeId) props.onOpenNode(props.selectedNodeId)
        }}
        ref={setContainer}
        role="region"
        tabIndex={0}
      />
      <div
        aria-label={t('knowledgeGraph.toolbar')}
        className="absolute left-3 right-3 top-3 flex items-center gap-1 rounded-lg border bg-card/95 p-1.5 shadow-sm backdrop-blur"
        role="toolbar"
      >
        <Input
          aria-label={t('knowledgeGraph.search')}
          className="h-8 min-w-0 flex-1"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('knowledgeGraph.searchPlaceholder')}
          value={query}
        />
        <Button
          aria-label={t('knowledgeGraph.nodeList')}
          aria-pressed={listOpen}
          onClick={() => setListOpen(!listOpen)}
          size="icon"
          variant="ghost"
        >
          <List className="size-4" />
        </Button>
        <Button
          aria-label={t('knowledgeGraph.clearSelection')}
          disabled={!props.selectedNodeId}
          onClick={() => props.onSelectNode(null)}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
        <Button
          aria-label={t('knowledgeGraph.arrange')}
          disabled={!renderer}
          onClick={() => renderer?.arrange()}
          size="icon"
          variant="ghost"
        >
          <Shuffle className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t('knowledgeGraph.layout')}
              disabled={!renderer}
              size="icon"
              title={t(`knowledgeGraph.layout.${layout}`)}
              variant="ghost"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('knowledgeGraph.layout')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={layout}
              onValueChange={(value) => {
                const next = graphLayoutKinds.find((kind) => kind === value)
                if (next) renderer?.arrange(next)
              }}
            >
              {graphLayoutKinds.map((kind) => (
                <DropdownMenuRadioItem key={kind} value={kind}>
                  {t(`knowledgeGraph.layout.${kind}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          aria-label={t('knowledgeGraph.fit')}
          disabled={!renderer}
          onClick={() => renderer?.fit()}
          size="icon"
          variant="ghost"
        >
          <Focus className="size-4" />
        </Button>
      </div>
      {props.active !== false && !renderer && !unavailable ? (
        <p
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 text-sm text-muted-foreground"
          role="status"
        >
          {t('knowledgeGraph.loading')}
        </p>
      ) : null}
      {showList ? (
        <div className="absolute bottom-14 left-3 top-16 flex w-72 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border bg-card/95 shadow-md backdrop-blur">
          {unavailable ? (
            <p className="px-3 pt-3 text-xs text-muted-foreground" role="status">
              {t('knowledgeGraph.unavailable')}
            </p>
          ) : null}
          {results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground" role="status">
              {t('knowledgeGraph.empty')}
            </p>
          ) : null}
          {results.length > 100 ? (
            <p className="px-3 pt-3 text-xs text-muted-foreground" role="status">
              {t('knowledgeGraph.resultLimit', { count: 100, total: results.length })}
            </p>
          ) : null}
          <KnowledgeGraphNodeList
            nodes={results.slice(0, 100)}
            onOpenNode={props.onOpenNode}
            onSelectNode={select}
            selectedNodeId={props.selectedNodeId}
          />
        </div>
      ) : null}
      {!props.graph.truncated && (
        <p className="pointer-events-none absolute bottom-3 left-3 hidden max-w-[65%] rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground sm:block">
          {t('knowledgeGraph.gestures')}
        </p>
      )}
      <div className="absolute bottom-3 right-3 flex rounded-md border bg-card/95 p-1 shadow-sm">
        <Button
          aria-label={t('knowledgeGraph.zoomOut')}
          disabled={!renderer}
          onClick={() => renderer?.zoom(1.4)}
          size="icon"
          variant="ghost"
        >
          <Minus className="size-4" />
        </Button>
        <Button
          aria-label={t('knowledgeGraph.zoomIn')}
          disabled={!renderer}
          onClick={() => renderer?.zoom(1 / 1.4)}
          size="icon"
          variant="ghost"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {props.graph.truncated ? (
        <p
          className="pointer-events-none absolute bottom-3 left-3 max-w-[65%] rounded-md border bg-card/95 px-2 py-1 text-xs text-muted-foreground"
          role="status"
        >
          {t('knowledgeGraph.truncated', {
            count: props.graph.nodes.length,
            total: props.graph.total_nodes,
          })}
        </p>
      ) : null}
    </div>
  )
}
