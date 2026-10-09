import { FootnoteReferencePlugin } from '@platejs/footnote/react'
import { useEquationElement, useEquationInput } from '@platejs/math/react'
import type { TElement, TEquationElement } from 'platejs'
import { PlateElement, type PlateElementProps, useEditorRef, useReadOnly } from 'platejs/react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n/useI18n'
import { isImeKeyboardEvent } from '@/logic/ime'

type FootnoteElement = TElement & { identifier?: string }

const equationExpression = (element: TEquationElement) =>
  typeof element.texExpression === 'string' ||
  typeof element.texExpression === 'number' ||
  typeof element.texExpression === 'boolean'
    ? String(element.texExpression)
    : ''

const footnoteTarget = (editorId: string, identifier: string) =>
  `footnote-${encodeURIComponent(editorId)}-${encodeURIComponent(identifier)}`

type EquationViewProps = {
  displayMode: boolean
  element: TEquationElement
}

const EquationView = ({ displayMode, element }: EquationViewProps) => {
  const katexRef = useRef<HTMLDivElement | null>(null)
  const expression = equationExpression(element)
  useEquationElement({
    element,
    katexRef,
    options: { displayMode, output: 'htmlAndMathml', throwOnError: false, trust: false },
  })
  useEffect(() => {
    katexRef.current?.querySelector('math')?.setAttribute('aria-label', expression)
  }, [expression])

  return (
    <span
      ref={katexRef}
      className={displayMode ? 'min-w-fit text-foreground' : 'text-foreground'}
      contentEditable={false}
    />
  )
}

type EditableEquationProps = EquationViewProps & {
  isInline: boolean
}

const EditableEquation = ({ displayMode, element, isInline }: EditableEquationProps) => {
  const { t } = useI18n()
  const editor = useEditorRef()
  const [open, setOpen] = useState(false)
  const {
    onDismiss: dismissEquationInput,
    onSubmit,
    props: equationInputProps,
    ref: equationInputRef,
  } = useEquationInput({
    isInline,
    onClose: () => setOpen(false),
    open,
  })
  const expression = equationExpression(element)
  const initialExpressionRef = useRef(expression)
  const isFirstChangeRef = useRef(true)
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      initialExpressionRef.current = expression
      isFirstChangeRef.current = true
    }
    setOpen(nextOpen)
  }
  const restoreInitialExpression = () => {
    editor.tf.setNodes({ texExpression: initialExpressionRef.current }, { at: element })
  }
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextExpression = event.currentTarget.value
    if (isInline) {
      const setExpression = () => {
        editor.tf.setNodes({ texExpression: nextExpression }, { at: element })
      }
      if (isFirstChangeRef.current) editor.tf.withNewBatch(setExpression)
      else editor.tf.withMerging(setExpression)
      isFirstChangeRef.current = false
    }
    equationInputProps.onChange(event)
  }
  const handleDismiss = () => {
    if (!isInline) restoreInitialExpression()
    dismissEquationInput()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isImeKeyboardEvent(event.nativeEvent)) return
    equationInputProps.onKeyDown(event)
    if (!isInline && event.key === 'Escape') restoreInitialExpression()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`LaTeX: ${expression}`}
          className="h-auto max-w-full p-0 font-normal"
          contentEditable={false}
          type="button"
          variant="ghost"
        >
          <EquationView displayMode={displayMode} element={element} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" contentEditable={false}>
        <PopoverTitle className="mb-2">LaTeX</PopoverTitle>
        <Textarea
          {...equationInputProps}
          ref={equationInputRef}
          aria-label="LaTeX"
          className="min-h-24 resize-y font-mono"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleDismiss}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onSubmit}>
            {t('common.save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const EquationElement = (props: PlateElementProps<TEquationElement>) => {
  const readOnly = useReadOnly()

  return (
    <PlateElement {...props} as="div" className="my-4 overflow-x-auto py-2 text-center">
      {readOnly ? (
        <EquationView displayMode element={props.element} />
      ) : (
        <EditableEquation displayMode element={props.element} isInline={false} />
      )}
      <span className="sr-only">{props.children}</span>
    </PlateElement>
  )
}

export const InlineEquationElement = (props: PlateElementProps<TEquationElement>) => {
  const readOnly = useReadOnly()

  return (
    <PlateElement {...props} as="span" className="mx-0.5 inline-block align-baseline">
      {readOnly ? (
        <EquationView displayMode={false} element={props.element} />
      ) : (
        <EditableEquation displayMode={false} element={props.element} isInline />
      )}
      <span className="sr-only">{props.children}</span>
    </PlateElement>
  )
}

export const FootnoteReferenceElement = (props: PlateElementProps<FootnoteElement>) => {
  const editor = useEditorRef()
  const readOnly = useReadOnly()
  const identifier = props.element.identifier ?? ''
  const label = `[^${identifier}]`
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (readOnly) return
    event.preventDefault()
    event.stopPropagation()
    editor.getTransforms(FootnoteReferencePlugin).footnote.focusDefinition({ identifier })
  }

  return (
    <PlateElement {...props} as="sup" className="align-super text-xs">
      <a
        aria-label={label}
        className="rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        contentEditable={false}
        href={`#${footnoteTarget(editor.id, identifier)}`}
        onClick={handleClick}
      >
        [{identifier}]
      </a>
      <span className="sr-only">{props.children}</span>
    </PlateElement>
  )
}

export const FootnoteDefinitionElement = (props: PlateElementProps<FootnoteElement>) => {
  const editor = useEditorRef()
  const identifier = props.element.identifier ?? ''

  return (
    <PlateElement
      {...props}
      as="aside"
      attributes={{
        ...props.attributes,
        'aria-label': `[^${identifier}]`,
        id: footnoteTarget(editor.id, identifier),
        role: 'doc-footnote',
      }}
      className="my-3 grid grid-cols-[auto_1fr] gap-2 border-t border-border/60 pt-3 text-sm text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="select-none font-medium text-primary"
        contentEditable={false}
      >
        [{identifier}]
      </span>
      <div className="min-w-0">{props.children}</div>
    </PlateElement>
  )
}
