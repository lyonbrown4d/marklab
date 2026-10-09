import { memo, useEffect, useMemo, useRef } from 'react'
import { getEquationHtml } from '@platejs/math'
import { KEYS, createSlatePlugin, type TElement, type TEquationElement } from 'platejs'
import {
  PlateStatic,
  SlateElement,
  SlateLeaf,
  createStaticEditor,
  type SlateElementProps,
  type SlateLeafProps,
} from 'platejs/static'
import {
  PLATE_HTML_BR,
  PLATE_HTML_DETAILS,
  PLATE_HTML_KBD,
  PLATE_HTML_SUMMARY,
} from '@/components/plate/html/plateHtmlTypes'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import { deserializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'

type WorkspaceMapStaticMarkdownPreviewProps = {
  markdown: string
}

type ImageElement = TElement & {
  caption?: Array<{ text?: string }>
  title?: string | null
  url?: string
}
type FootnoteElement = TElement & { identifier?: string }

const StaticParagraph = (props: SlateElementProps) => (
  <SlateElement {...props} as="p" className="my-2 leading-6" />
)
const StaticBlockquote = (props: SlateElementProps) => (
  <SlateElement
    {...props}
    as="blockquote"
    className="my-3 border-l-2 border-border pl-3 text-muted-foreground"
  />
)
const StaticHorizontalRule = (props: SlateElementProps) => (
  <SlateElement {...props} as="div" className="my-3">
    <hr className="border-border" />
  </SlateElement>
)
const StaticCodeBlock = (props: SlateElementProps) => (
  <SlateElement
    {...props}
    as="pre"
    className="my-3 overflow-hidden rounded border border-border bg-muted/50 p-3 font-mono text-xs"
  >
    <code>{props.children}</code>
  </SlateElement>
)
const StaticTable = (props: SlateElementProps) => (
  <SlateElement {...props} as="table" className="my-3 w-full border-collapse text-xs">
    <tbody>{props.children}</tbody>
  </SlateElement>
)
const StaticTableCell = (props: SlateElementProps) => (
  <SlateElement {...props} as="td" className="border border-border px-2 py-1 align-top" />
)
const StaticTableHeader = (props: SlateElementProps) => (
  <SlateElement
    {...props}
    as="th"
    className="border border-border bg-muted/60 px-2 py-1 text-left font-semibold"
  />
)
const StaticBreak = (props: SlateElementProps) => (
  <SlateElement {...props} as="span">
    <br />
    {props.children}
  </SlateElement>
)

const equationExpression = (element: TEquationElement) => {
  const rawExpression = element.texExpression
  return typeof rawExpression === 'string' ||
    typeof rawExpression === 'number' ||
    typeof rawExpression === 'boolean'
    ? String(rawExpression)
    : ''
}

const equationHtml = (element: TEquationElement, displayMode: boolean) =>
  getEquationHtml({
    element,
    options: { displayMode, output: 'htmlAndMathml', throwOnError: false, trust: false },
  })

const StaticEquationMath = ({
  displayMode,
  element,
}: {
  displayMode: boolean
  element: TEquationElement
}) => {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const expression = equationExpression(element)
  useEffect(() => {
    containerRef.current?.querySelector('math')?.setAttribute('aria-label', expression)
  }, [expression])

  return (
    <span
      ref={containerRef}
      className={displayMode ? 'min-w-fit text-foreground' : 'text-foreground'}
      dangerouslySetInnerHTML={{ __html: equationHtml(element, displayMode) }}
    />
  )
}

const StaticEquation = (props: SlateElementProps<TEquationElement>) => {
  return (
    <SlateElement {...props} as="div" className="my-4 overflow-hidden py-2 text-center">
      <StaticEquationMath displayMode element={props.element} />
      <span className="sr-only">{props.children}</span>
    </SlateElement>
  )
}

const StaticInlineEquation = (props: SlateElementProps<TEquationElement>) => {
  return (
    <SlateElement {...props} as="span" className="mx-0.5 inline-block align-baseline">
      <StaticEquationMath displayMode={false} element={props.element} />
      <span className="sr-only">{props.children}</span>
    </SlateElement>
  )
}

const StaticFootnoteReference = (props: SlateElementProps<FootnoteElement>) => (
  <SlateElement {...props} as="sup" className="text-xs text-primary">
    [{props.element.identifier ?? ''}]{props.children}
  </SlateElement>
)

const StaticFootnoteDefinition = (props: SlateElementProps<FootnoteElement>) => (
  <SlateElement
    {...props}
    as="aside"
    attributes={{
      ...props.attributes,
      'aria-label': `[^${props.element.identifier ?? ''}]`,
      role: 'doc-footnote',
    }}
    className="my-3 grid grid-cols-[auto_1fr] gap-2 border-t border-border/60 pt-2 text-muted-foreground"
  >
    <span aria-hidden="true" className="select-none font-medium text-primary">
      [{props.element.identifier ?? ''}]
    </span>
    <div className="min-w-0">{props.children}</div>
  </SlateElement>
)

const StaticLink = (props: SlateElementProps) => (
  <SlateElement
    {...props}
    as="span"
    className="text-primary underline decoration-primary/40 underline-offset-2"
  />
)

const StaticImage = (props: SlateElementProps<ImageElement>) => {
  const alt =
    props.element.caption
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() || props.element.title?.trim()
  return (
    <SlateElement
      {...props}
      as="span"
      className="my-2 block rounded border border-dashed border-border px-3 py-2 text-muted-foreground"
    >
      {alt || props.element.url || ''}
    </SlateElement>
  )
}

const element =
  (tag: keyof HTMLElementTagNameMap, className?: string) => (props: SlateElementProps) => (
    <SlateElement {...props} as={tag} className={className} />
  )
const leaf = (tag: keyof HTMLElementTagNameMap, className?: string) => (props: SlateLeafProps) => (
  <SlateLeaf {...props} as={tag} className={className} />
)

const staticHtmlPlugins = [
  createSlatePlugin({ key: PLATE_HTML_DETAILS, node: { isElement: true } }),
  createSlatePlugin({ key: PLATE_HTML_SUMMARY, node: { isElement: true } }),
  createSlatePlugin({ key: PLATE_HTML_KBD, node: { isElement: true, isInline: true } }),
  createSlatePlugin({
    key: PLATE_HTML_BR,
    node: { isElement: true, isInline: true, isVoid: true },
  }),
]

const staticComponents = {
  [KEYS.p]: StaticParagraph,
  [KEYS.blockquote]: StaticBlockquote,
  [KEYS.h1]: element('h1', 'mb-2 mt-3 text-xl font-bold tracking-tight'),
  [KEYS.h2]: element('h2', 'mb-2 mt-3 text-lg font-semibold tracking-tight'),
  [KEYS.h3]: element('h3', 'mb-1 mt-2 text-base font-semibold'),
  [KEYS.h4]: element('h4', 'mb-1 mt-2 text-sm font-semibold'),
  [KEYS.h5]: element('h5', 'my-1 text-sm font-semibold'),
  [KEYS.h6]: element('h6', 'my-1 text-xs font-semibold uppercase'),
  [KEYS.hr]: StaticHorizontalRule,
  [KEYS.bold]: leaf('strong'),
  [KEYS.italic]: leaf('em'),
  [KEYS.strikethrough]: leaf('s'),
  [KEYS.code]: leaf('code', 'rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]'),
  [KEYS.ulClassic]: element('ul', 'my-2 list-disc ps-5'),
  [KEYS.olClassic]: element('ol', 'my-2 list-decimal ps-5'),
  [KEYS.taskList]: element('ul', 'my-2 list-none ps-5'),
  [KEYS.li]: element('li'),
  [KEYS.lic]: element('div'),
  [KEYS.codeBlock]: StaticCodeBlock,
  [KEYS.codeLine]: element('div'),
  [KEYS.codeSyntax]: leaf('span'),
  [KEYS.equation]: StaticEquation,
  [KEYS.inlineEquation]: StaticInlineEquation,
  [KEYS.footnoteReference]: StaticFootnoteReference,
  [KEYS.footnoteDefinition]: StaticFootnoteDefinition,
  [KEYS.a]: StaticLink,
  [KEYS.img]: StaticImage,
  [KEYS.table]: StaticTable,
  [KEYS.tr]: element('tr'),
  [KEYS.td]: StaticTableCell,
  [KEYS.th]: StaticTableHeader,
  [PLATE_HTML_DETAILS]: element('details', 'my-3 rounded border border-border px-3 py-2'),
  [PLATE_HTML_SUMMARY]: element('summary', 'font-medium'),
  [PLATE_HTML_KBD]: element('kbd', 'rounded border border-border bg-muted px-1 font-mono'),
  [PLATE_HTML_BR]: StaticBreak,
}

export const WorkspaceMapStaticMarkdownPreview = memo(
  ({ markdown }: WorkspaceMapStaticMarkdownPreviewProps) => {
    const editor = useMemo(
      () =>
        createStaticEditor({
          components: staticComponents,
          plugins: [...plateMarkdownPlugins, ...staticHtmlPlugins],
        }),
      [],
    )
    const value = useMemo(() => deserializePlateMarkdown(editor, markdown), [editor, markdown])

    return (
      <PlateStatic
        className="h-full overflow-hidden break-words"
        data-testid="workspace-map-document-preview"
        editor={editor}
        value={value}
      />
    )
  },
)
