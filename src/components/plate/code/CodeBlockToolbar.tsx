import { Check, Copy, Expand, Hash, TextWrap } from 'lucide-react'
import type { ComponentProps } from 'react'
import { CodeLanguagePicker } from '@/components/plate/code/CodeLanguagePicker'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type CodeCopyStatus = 'idle' | 'copied' | 'error'

type CodeBlockToolbarProps = {
  copyStatus: CodeCopyStatus
  labels: {
    copied: string
    copy: string
    copyFailed: string
    expand: string
    hideLineNumbers: string
    languageEmpty: string
    languageSearch: string
    showLineNumbers: string
    unwrap: string
    wrap: string
  }
  language: string
  lineNumbers: boolean
  readOnly: boolean
  wrap: boolean
  onCopy: () => void
  onExpand: () => void
  onLanguageChange: (language: string) => void
  onLineNumbersChange: () => void
  onWrapChange: () => void
}

const IconButton = ({ label, ...props }: ComponentProps<typeof Button> & { label: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button aria-label={label} size="icon-xs" type="button" variant="ghost" {...props} />
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

export const CodeBlockToolbar = ({
  copyStatus,
  labels,
  language,
  lineNumbers,
  readOnly,
  wrap,
  onCopy,
  onExpand,
  onLanguageChange,
  onLineNumbersChange,
  onWrapChange,
}: CodeBlockToolbarProps) => (
  <TooltipProvider>
    <div
      className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/code:opacity-100 group-focus-within/code:opacity-100 motion-reduce:transition-none"
      contentEditable={false}
      data-code-toolbar="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!readOnly ? (
        <>
          <CodeLanguagePicker
            emptyLabel={labels.languageEmpty}
            language={language}
            searchLabel={labels.languageSearch}
            onChange={onLanguageChange}
          />
          <IconButton
            aria-pressed={wrap}
            label={wrap ? labels.unwrap : labels.wrap}
            onClick={onWrapChange}
          >
            <TextWrap aria-hidden="true" />
          </IconButton>
          <IconButton
            aria-pressed={lineNumbers}
            label={lineNumbers ? labels.hideLineNumbers : labels.showLineNumbers}
            onClick={onLineNumbersChange}
          >
            <Hash aria-hidden="true" />
          </IconButton>
          <IconButton label={labels.expand} onClick={onExpand}>
            <Expand aria-hidden="true" />
          </IconButton>
        </>
      ) : null}
      <IconButton label={labels.copy} onClick={onCopy}>
        {copyStatus === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </IconButton>
      <span aria-live="polite" className="sr-only" role="status">
        {copyStatus === 'copied' ? labels.copied : copyStatus === 'error' ? labels.copyFailed : ''}
      </span>
    </div>
  </TooltipProvider>
)
