import {
  defaultRules,
  type DeserializeMdOptions,
  type MdDecoration,
  type MdRules,
  type MdTable,
  type SerializeMdOptions,
} from '@platejs/markdown'
import type { TElement } from 'platejs'

type GfmTableAlignment = Exclude<NonNullable<MdTable['align']>[number], null>
type AlignedTableCell = TElement & { align?: GfmTableAlignment }

const deserializeTable = defaultRules.table?.deserialize
const serializeTable = defaultRules.table?.serialize

const isTableAlignment = (value: unknown): value is GfmTableAlignment =>
  value === 'left' || value === 'center' || value === 'right'

const applyColumnAlignment = (table: TElement, align: MdTable['align']): TElement => ({
  ...table,
  children: table.children.map((row) => {
    const rowElement = row as TElement
    return {
      ...rowElement,
      children: rowElement.children.map((cell, columnIndex) => {
        const columnAlignment = align?.[columnIndex]
        if (!isTableAlignment(columnAlignment)) return cell
        return { ...(cell as TElement), align: columnAlignment }
      }),
    }
  }),
})

const readColumnAlignment = (table: TElement): NonNullable<MdTable['align']> => {
  const rows = table.children as TElement[]
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.children.length), 0)

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    for (const row of rows) {
      const cell = row.children[columnIndex] as AlignedTableCell | undefined
      if (isTableAlignment(cell?.align)) return cell.align
    }
    return null
  })
}

export const tableMarkdownAlignmentRules = {
  table: {
    deserialize: (node: MdTable, decoration: MdDecoration, options: DeserializeMdOptions) => {
      if (!deserializeTable) throw new Error('Plate table Markdown deserializer is unavailable.')
      return applyColumnAlignment(deserializeTable(node, decoration, options), node.align)
    },
    serialize: (node: TElement, options: SerializeMdOptions) => {
      if (!serializeTable) throw new Error('Plate table Markdown serializer is unavailable.')
      return { ...serializeTable(node, options), align: readColumnAlignment(node) }
    },
  },
} satisfies MdRules
