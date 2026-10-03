import { createSlatePlugin, ElementApi, KEYS, type SlateEditor, type TElement } from 'platejs'

type OrderedTaskListElement = TElement & {
  ordered?: boolean
  start?: number
}

const closestTaskList = (editor: SlateEditor) =>
  editor.api.above<OrderedTaskListElement>({
    match: (node) => ElementApi.isElement(node) && node.type === editor.getType(KEYS.taskList),
  })

export const plateClassicListCompatibilityPlugin = createSlatePlugin({
  key: 'plateClassicListCompatibility',
}).overrideEditor(({ editor, tf: { tab } }) => ({
  transforms: {
    tab(options) {
      const before = closestTaskList(editor)
      const orderedBefore = before?.[0].ordered === true ? before : null
      const result = tab(options)
      if (!result || !orderedBefore) return result

      const after = closestTaskList(editor)
      const createdNestedList = after && after[1].length > orderedBefore[1].length
      if (!createdNestedList || after[0].ordered === true) {
        return result
      }

      editor.tf.setNodes(
        {
          ordered: true,
          start: 1,
        },
        { at: after[1] },
      )
      return result
    },
  },
}))
