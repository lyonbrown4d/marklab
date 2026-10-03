import {
  BlockquoteRules,
  BoldRules,
  CodeRules,
  HeadingRules,
  HorizontalRuleRules,
  ItalicRules,
  StrikethroughRules,
} from '@platejs/basic-nodes'
import { CodeBlockRules } from '@platejs/code-block'
import { LinkRules } from '@platejs/link'
import {
  BulletedListRules,
  OrderedListRules,
  toggleBulletedList,
  toggleTaskList,
} from '@platejs/list-classic'
import {
  KEYS,
  createBlockStartInputRule,
  defineInputRule,
  type AnyInputRule,
  type InsertBreakInputRuleContext,
  type InsertDataInputRuleContext,
  type InsertTextInputRuleContext,
  type Path,
  type SelectionInputRuleContext,
  type SlateEditor,
  type TRange,
} from 'platejs'

const composingEditors = new WeakSet<SlateEditor>()

const inputRulesEnabled = ({ editor }: SelectionInputRuleContext) =>
  !composingEditors.has(editor) &&
  !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } })

const withInputRuleGuard = (rule: AnyInputRule): AnyInputRule => {
  if (rule.target === 'insertText') {
    const originalEnabled = rule.enabled
    return {
      ...rule,
      enabled: (context: InsertTextInputRuleContext) =>
        inputRulesEnabled(context) && (originalEnabled?.(context) ?? true),
    }
  }
  if (rule.target === 'insertBreak') {
    const originalEnabled = rule.enabled
    return {
      ...rule,
      enabled: (context: InsertBreakInputRuleContext) =>
        inputRulesEnabled(context) && (originalEnabled?.(context) ?? true),
    }
  }
  const originalEnabled = rule.enabled
  return {
    ...rule,
    enabled: (context: InsertDataInputRuleContext) =>
      inputRulesEnabled(context) && (originalEnabled?.(context) ?? true),
  }
}

const plusListRule = createBlockStartInputRule({
  apply: ({ editor }, match) => {
    editor.tf.delete({ at: match.range })
    toggleBulletedList(editor)
    return true
  },
  enabled: inputRulesEnabled,
  match: '+',
  trigger: ' ',
})

const taskListRule = createBlockStartInputRule<{ checked: boolean }>({
  apply: ({ editor }, match) => {
    editor.tf.delete({ at: match.range })
    toggleTaskList(editor, match.checked)
    editor.tf.setNodes(
      { checked: match.checked },
      { match: { type: editor.getType(KEYS.li) }, mode: 'lowest' },
    )
    return true
  },
  enabled: inputRulesEnabled,
  match: /^\[(?: |x|X)?\]$/,
  resolveMatch: ({ text }) => ({ checked: /x/i.test(text) }),
  trigger: ' ',
})

type LanguageFenceMatch = {
  language: string
  path: Path
  range: TRange
}

const languageFenceRule = defineInputRule<LanguageFenceMatch>({
  apply: ({ editor }, match) => {
    editor.tf.removeNodes({ at: match.path })
    editor.tf.insertNodes(
      {
        children: [{ children: [{ text: '' }], type: editor.getType(KEYS.codeLine) }],
        lang: match.language,
        type: editor.getType(KEYS.codeBlock),
      },
      { at: match.path },
    )
    const start = editor.api.start([...match.path, 0])
    if (start) editor.tf.select(start)
    return true
  },
  enabled: inputRulesEnabled,
  resolve: ({ editor, getBlockEntry, getBlockStartRange, getBlockStartText, isCollapsed }) => {
    if (!isCollapsed || !editor.selection) return
    const entry = getBlockEntry()
    const range = getBlockStartRange()
    const text = getBlockStartText()
    if (!entry || !range || !text || entry[0].type !== editor.getType(KEYS.p)) return
    if (!editor.api.isEnd(editor.selection.focus, entry[1])) return
    const match = /^```([\w+#.-]+)$/.exec(text)
    if (!match) return
    return { language: match[1], path: entry[1], range }
  },
  target: 'insertBreak',
})

export const plateHeadingMarkdownInputRules = [withInputRuleGuard(HeadingRules.markdown())]

export const plateBlockquoteMarkdownInputRules = [withInputRuleGuard(BlockquoteRules.markdown())]

export const plateHorizontalRuleMarkdownInputRules = [
  withInputRuleGuard(HorizontalRuleRules.markdown({ variant: '-' })),
]

export const plateBoldMarkdownInputRules = [
  withInputRuleGuard(BoldRules.markdown({ variant: '*' })),
  withInputRuleGuard(BoldRules.markdown({ variant: '_' })),
]

export const plateItalicMarkdownInputRules = [
  withInputRuleGuard(ItalicRules.markdown({ variant: '*' })),
  withInputRuleGuard(ItalicRules.markdown({ variant: '_' })),
]

export const plateCodeMarkdownInputRules = [withInputRuleGuard(CodeRules.markdown())]

export const plateStrikethroughMarkdownInputRules = [
  withInputRuleGuard(StrikethroughRules.markdown()),
]

export const plateListMarkdownInputRules = [
  withInputRuleGuard(BulletedListRules.markdown({ variant: '-' })),
  withInputRuleGuard(BulletedListRules.markdown({ variant: '*' })),
  plusListRule,
  withInputRuleGuard(OrderedListRules.markdown({ variant: '.' })),
  taskListRule,
]

export const plateCodeBlockMarkdownInputRules = [
  withInputRuleGuard(CodeBlockRules.markdown({ on: 'break' })),
  languageFenceRule,
]

export const plateLinkMarkdownInputRules = [withInputRuleGuard(LinkRules.markdown())]

export const setPlateMarkdownInputRulesComposing = (editor: SlateEditor, composing: boolean) => {
  if (composing) composingEditors.add(editor)
  else composingEditors.delete(editor)
}
