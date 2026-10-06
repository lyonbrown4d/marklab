import type { TCodeSyntaxLeaf, TElement } from 'platejs'
import {
  PlateElement,
  PlateLeaf,
  usePath,
  useReadOnly,
  type PlateElementProps,
  type PlateLeafProps,
} from 'platejs/react'
import { lazy, Suspense, useId, useState } from 'react'
import { PlateCodeCompletionMenu } from '@/components/plate/code/PlateCodeCompletionMenu'
import { replacePlateCodeSource } from '@/components/plate/code/plateCodeCompletionEdits'
import { usePlateCodeCompletion } from '@/components/plate/code/usePlateCodeCompletion'
import { isMermaidLanguage } from '@/components/plate/nodes/previewAdapters'
import MermaidPreview from '@/components/previews/MermaidPreview'
import { useI18n } from '@/i18n/useI18n'

const MermaidCodeEditor = lazy(() => import('@/components/previews/MermaidCodeEditor'))

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
  const readOnly = useReadOnly()
  const [editingMermaid, setEditingMermaid] = useState(false)
  const editorId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const language = props.element.lang?.trim() ?? ''
  const source = props.element.children.map(nodeText).join('\n')
  const mermaidLanguage = isMermaidLanguage(language)
  const showMermaidPreview = mermaidLanguage && Boolean(source.trim())
  const showMermaidEditor = mermaidLanguage && editingMermaid && !readOnly
  const completion = usePlateCodeCompletion({
    editor: props.editor,
    language: showMermaidEditor ? '' : language,
    path,
    source,
  })
  const activateMermaidSource = () => {
    if (readOnly) return
    setEditingMermaid(true)
  }

  return (
    <PlateElement {...props} as="div" className="relative my-4">
      {showMermaidPreview ? (
        <MermaidPreview
          onActivateEdit={readOnly ? undefined : activateMermaidSource}
          source={source}
        />
      ) : null}
      {showMermaidEditor ? (
        <Suspense
          fallback={
            <div
              aria-label={t('editor.sourceLoading')}
              className="mt-2 rounded-lg border border-border p-4 text-sm text-muted-foreground"
              contentEditable={false}
              role="status"
            >
              {t('editor.sourceLoading')}
            </div>
          }
        >
          <MermaidCodeEditor
            onBlur={() => setEditingMermaid(false)}
            onChange={(nextSource) => replacePlateCodeSource(props.editor, path, nextSource)}
            uri={`marklab-embedded://plate/${editorId}.mermaid`}
            value={source}
          />
        </Suspense>
      ) : null}
      <pre
        className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm"
        hidden={showMermaidPreview || showMermaidEditor}
        onCompositionEnd={completion.onCompositionEnd}
        onCompositionStart={completion.onCompositionStart}
        onInput={completion.onInput}
        onKeyDownCapture={completion.onKeyDown}
        onPointerUp={completion.onPointerUp}
      >
        <code data-language={language || undefined}>{props.children}</code>
      </pre>
      <PlateCodeCompletionMenu {...completion} label={t('editor.codeSuggestions')} />
    </PlateElement>
  )
}

export const CodeLineElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="div" className="min-h-[1.25rem]" />
)

export const CodeSyntaxLeaf = (props: PlateLeafProps<TCodeSyntaxLeaf>) => (
  <PlateLeaf {...props} as="span" className={props.leaf.className as string} />
)
