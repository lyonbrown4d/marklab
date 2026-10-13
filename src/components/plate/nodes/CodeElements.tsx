import type { TCodeSyntaxLeaf, TElement } from 'platejs'
import {
  PlateElement,
  PlateLeaf,
  usePath,
  useReadOnly,
  type PlateElementProps,
  type PlateLeafProps,
} from 'platejs/react'
import { lazy, Suspense, useEffect, useId, useState } from 'react'
import { CodeBlockToolbar, type CodeCopyStatus } from '@/components/plate/code/CodeBlockToolbar'
import { PlateCodeCompletionMenu } from '@/components/plate/code/PlateCodeCompletionMenu'
import { replacePlateCodeSource } from '@/components/plate/code/plateCodeCompletionEdits'
import { usePlateCodeCompletion } from '@/components/plate/code/usePlateCodeCompletion'
import { isMermaidLanguage } from '@/components/plate/nodes/previewAdapters'
import MermaidPreview from '@/components/previews/MermaidPreview'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { writeClipboardText } from '@/runtime/clipboard'

const MermaidCodeEditor = lazy(() => import('@/components/previews/MermaidCodeEditor'))
const CodeBlockMonacoDialog = lazy(() => import('@/components/plate/code/CodeBlockMonacoDialog'))

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
  const [editingExpanded, setEditingExpanded] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CodeCopyStatus>('idle')
  const [lineNumbers, setLineNumbers] = useState(false)
  const [wrap, setWrap] = useState(false)
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
  const handleCopy = async () => {
    try {
      await writeClipboardText(source)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }
  const handleLanguageChange = (nextLanguage: string) => {
    props.editor.tf.setNodes({ lang: nextLanguage }, { at: path })
    props.editor.tf.focus()
  }
  useEffect(() => {
    if (copyStatus === 'idle') return
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 2_000)
    return () => window.clearTimeout(timeout)
  }, [copyStatus])

  return (
    <PlateElement {...props} as="div" className="group/code relative my-4">
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
        className={cn(
          'rounded-lg border border-border bg-muted/50 p-4 pt-11 font-mono text-sm',
          wrap
            ? 'overflow-x-hidden whitespace-pre-wrap break-words [&_code]:whitespace-pre-wrap'
            : 'overflow-x-auto',
          lineNumbers &&
            '[&>code]:[counter-reset:code-line] [&>code>div]:relative [&>code>div]:pl-10 [&>code>div]:[counter-increment:code-line] [&>code>div]:before:absolute [&>code>div]:before:left-0 [&>code>div]:before:w-7 [&>code>div]:before:text-right [&>code>div]:before:text-muted-foreground/60 [&>code>div]:before:content-[counter(code-line)]',
        )}
        data-line-numbers={lineNumbers}
        data-wrap={wrap}
        hidden={showMermaidPreview || showMermaidEditor}
        onCompositionEnd={completion.onCompositionEnd}
        onCompositionStart={completion.onCompositionStart}
        onInput={completion.onInput}
        onKeyDownCapture={completion.onKeyDown}
        onPointerUp={completion.onPointerUp}
      >
        <code data-language={language || undefined}>{props.children}</code>
      </pre>
      {!mermaidLanguage ? (
        <CodeBlockToolbar
          copyStatus={copyStatus}
          labels={{
            copied: t('editor.codeCopied'),
            copy: t('editor.copyCode'),
            copyFailed: t('editor.codeCopyFailed'),
            expand: t('editor.expandCodeEditor'),
            hideLineNumbers: t('editor.hideCodeLineNumbers'),
            languageEmpty: t('editor.codeLanguageEmpty'),
            languageSearch: t('editor.codeLanguageSearch'),
            showLineNumbers: t('editor.showCodeLineNumbers'),
            unwrap: t('editor.unwrapCodeLines'),
            wrap: t('editor.wrapCodeLines'),
          }}
          language={language}
          lineNumbers={lineNumbers}
          readOnly={readOnly}
          wrap={wrap}
          onCopy={() => void handleCopy()}
          onExpand={() => setEditingExpanded(true)}
          onLanguageChange={handleLanguageChange}
          onLineNumbersChange={() => setLineNumbers((value) => !value)}
          onWrapChange={() => setWrap((value) => !value)}
        />
      ) : null}
      {editingExpanded && !readOnly ? (
        <Suspense
          fallback={
            <div
              className="py-2 text-sm text-muted-foreground"
              contentEditable={false}
              role="status"
            >
              {t('editor.sourceLoading')}
            </div>
          }
        >
          <CodeBlockMonacoDialog
            applyLabel={t('editor.codeEditorApply')}
            cancelLabel={t('common.cancel')}
            description={t('editor.codeEditorDescription')}
            language={language}
            loadingLabel={t('editor.sourceLoading')}
            source={source}
            title={t('editor.codeEditorTitle')}
            onApply={(nextSource) => {
              props.editor.tf.withNewBatch(() =>
                replacePlateCodeSource(props.editor, path, nextSource),
              )
              setEditingExpanded(false)
            }}
            onWrite={(nextSource) => {
              props.editor.tf.withNewBatch(() =>
                replacePlateCodeSource(props.editor, path, nextSource),
              )
            }}
            onCancel={() => setEditingExpanded(false)}
          />
        </Suspense>
      ) : null}
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
