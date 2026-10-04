import type { TCodeSyntaxLeaf, TElement } from 'platejs'
import {
  PlateElement,
  PlateLeaf,
  usePath,
  type PlateElementProps,
  type PlateLeafProps,
} from 'platejs/react'
import { PlateCodeCompletionMenu } from '@/components/plate/code/PlateCodeCompletionMenu'
import { usePlateCodeCompletion } from '@/components/plate/code/usePlateCodeCompletion'
import { isMermaidLanguage } from '@/components/plate/nodes/previewAdapters'
import MermaidPreview from '@/components/previews/MermaidPreview'
import { useI18n } from '@/i18n/useI18n'

type CodeBlockNode = TElement & { lang?: string }

const nodeText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  if ('text' in node && typeof node.text === 'string') return node.text
  if (!('children' in node) || !Array.isArray(node.children)) return ''
  return node.children.map(nodeText).join('')
}

export const CodeBlockElement = (props: PlateElementProps<CodeBlockNode>) => {
  const { t } = useI18n()
  const path = usePath()
  const language = props.element.lang?.trim() ?? ''
  const source = props.element.children.map(nodeText).join('\n')
  const completion = usePlateCodeCompletion({
    editor: props.editor,
    language,
    path,
    source,
  })

  return (
    <PlateElement {...props} as="div" className="relative my-4">
      <pre
        className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm"
        onCompositionEnd={completion.onCompositionEnd}
        onCompositionStart={completion.onCompositionStart}
        onInput={completion.onInput}
        onKeyDownCapture={completion.onKeyDown}
        onPointerUp={completion.onPointerUp}
      >
        <code data-language={language || undefined}>{props.children}</code>
      </pre>
      <PlateCodeCompletionMenu {...completion} label={t('editor.codeSuggestions')} />
      {isMermaidLanguage(language) && source.trim() ? <MermaidPreview source={source} /> : null}
    </PlateElement>
  )
}

export const CodeLineElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="div" className="min-h-[1.25rem]" />
)

export const CodeSyntaxLeaf = (props: PlateLeafProps<TCodeSyntaxLeaf>) => (
  <PlateLeaf {...props} as="span" className={props.leaf.className as string} />
)
