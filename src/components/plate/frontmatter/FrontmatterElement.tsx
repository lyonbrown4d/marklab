import { Braces, Code2, ListTree } from 'lucide-react'
import type { TElement } from 'platejs'
import { PlateElement, type PlateElementProps, useEditorRef, useReadOnly } from 'platejs/react'
import { useMemo, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FrontmatterFieldControl } from '@/components/plate/frontmatter/FrontmatterFieldControl'
import {
  parseFrontmatter,
  updateFrontmatterField,
  type FrontmatterField,
} from '@/components/plate/frontmatter/plateFrontmatterModel'

type FrontmatterElementNode = TElement & { preservedMarkdownKind?: string }
type FrontmatterMode = 'source' | 'structured'

const nodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(nodeText).join('')
}

export const FrontmatterElement = (props: PlateElementProps<FrontmatterElementNode>) => {
  const editor = useEditorRef()
  const readOnly = useReadOnly()
  const source = nodeText(props.element)
  const model = useMemo(() => parseFrontmatter(source), [source])
  const [mode, setMode] = useState<FrontmatterMode>(() =>
    model.error || model.fields.length === 0 ? 'source' : 'structured',
  )
  const visibleMode = model.error ? 'source' : mode

  const replaceSource = (currentSource: string, nextSource: string) => {
    const path = editor.api.findPath(props.element)
    const range = path ? editor.api.range(path) : null
    if (!range || nextSource === currentSource) return
    editor.tf.withNewBatch(() => editor.tf.insertText(nextSource, { at: range }))
  }
  const updateField = (field: FrontmatterField, value: boolean | string | string[]) => {
    const path = editor.api.findPath(props.element)
    const currentSource = path ? editor.api.string(path) : source
    const currentField = parseFrontmatter(currentSource).fields.find(({ key }) => key === field.key)
    if (!currentField) return
    replaceSource(currentSource, updateFrontmatterField(currentSource, currentField, value))
  }

  return (
    <PlateElement
      {...props}
      as="section"
      attributes={{
        ...props.attributes,
        'aria-label': 'Frontmatter',
        'data-frontmatter-mode': visibleMode,
      }}
      className="my-4 overflow-hidden rounded-md border border-border bg-muted/20"
    >
      <div
        className="flex h-9 items-center justify-between gap-3 border-b border-border bg-muted/40 px-2.5"
        contentEditable={false}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Braces aria-hidden="true" className="size-3.5" />
          <span>Frontmatter</span>
          {model.unsupportedCount > 0 && (
            <span className="truncate text-[11px] font-normal">
              {model.unsupportedCount} source-only
            </span>
          )}
        </div>
        <TooltipProvider>
          <ToggleGroup
            aria-label="Frontmatter view"
            onValueChange={(value) => value && setMode(value as FrontmatterMode)}
            size="sm"
            type="single"
            value={visibleMode}
            variant="outline"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  aria-label="Structured frontmatter"
                  className="size-6 px-0"
                  disabled={Boolean(model.error)}
                  value="structured"
                >
                  <ListTree aria-hidden="true" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>Structured fields</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  aria-label="Frontmatter source"
                  className="size-6 px-0"
                  value="source"
                >
                  <Code2 aria-hidden="true" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>YAML source</TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </TooltipProvider>
      </div>
      {visibleMode === 'structured' ? (
        <div className="grid gap-1 px-3 py-2" contentEditable={false}>
          {model.fields.map((field) => (
            <FrontmatterFieldControl
              disabled={readOnly}
              field={field}
              key={field.key}
              onChange={(value) => updateField(field, value)}
            />
          ))}
          {model.fields.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">No structured fields</p>
          )}
        </div>
      ) : (
        <pre
          aria-label="Frontmatter YAML source"
          className="m-0 min-h-12 overflow-x-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-5 outline-none"
          spellCheck={false}
        >
          {props.children}
        </pre>
      )}
      {visibleMode === 'structured' && <span className="sr-only">{props.children}</span>}
    </PlateElement>
  )
}
