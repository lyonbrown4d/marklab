import { AlignCenter, AlignLeft, AlignRight, Columns3, Minus, Plus, Rows3 } from 'lucide-react'
import type { TElement } from 'platejs'
import type { PointerEvent } from 'react'
import { useEditorRef } from 'platejs/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  createTableOperations,
  type TableAlignment,
} from '@/components/plate/nodes/tableOperations'
import { useI18n } from '@/i18n/useI18n'

const preserveEditorSelection = (event: PointerEvent<HTMLButtonElement>) => {
  event.preventDefault()
}

const alignmentActions: Array<{
  icon: typeof AlignLeft
  labelKey: string
  value: TableAlignment
}> = [
  { icon: AlignLeft, labelKey: 'editor.tableAlignLeft', value: 'left' },
  { icon: AlignCenter, labelKey: 'editor.tableAlignCenter', value: 'center' },
  { icon: AlignRight, labelKey: 'editor.tableAlignRight', value: 'right' },
]

type TableToolbarProps = { table: TElement }

export const TableToolbar = ({ table }: TableToolbarProps) => {
  const editor = useEditorRef()
  const { t } = useI18n()
  const operations = createTableOperations(editor, table)

  return (
    <div
      aria-label={t('editor.tableEditing')}
      className="mb-2 flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-1"
      contentEditable={false}
      role="toolbar"
    >
      <Button
        aria-label={t('editor.tableAddRow')}
        onClick={operations.addRow}
        onPointerDown={preserveEditorSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Rows3 aria-hidden="true" data-icon="inline-start" />
        <Plus aria-hidden="true" data-icon="inline-end" />
      </Button>
      <Button
        aria-label={t('editor.tableDeleteRow')}
        onClick={operations.removeRow}
        onPointerDown={preserveEditorSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Rows3 aria-hidden="true" data-icon="inline-start" />
        <Minus aria-hidden="true" data-icon="inline-end" />
      </Button>
      <Button
        aria-label={t('editor.tableAddColumn')}
        onClick={operations.addColumn}
        onPointerDown={preserveEditorSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Columns3 aria-hidden="true" data-icon="inline-start" />
        <Plus aria-hidden="true" data-icon="inline-end" />
      </Button>
      <Button
        aria-label={t('editor.tableDeleteColumn')}
        onClick={operations.removeColumn}
        onPointerDown={preserveEditorSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Columns3 aria-hidden="true" data-icon="inline-start" />
        <Minus aria-hidden="true" data-icon="inline-end" />
      </Button>
      <Separator className="mx-1 h-5" orientation="vertical" />
      {alignmentActions.map(({ icon: Icon, labelKey, value }) => (
        <Button
          aria-label={t(labelKey)}
          key={value}
          onClick={() => operations.align(value)}
          onPointerDown={preserveEditorSelection}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon aria-hidden="true" data-icon="inline-start" />
        </Button>
      ))}
    </div>
  )
}
