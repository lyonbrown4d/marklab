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
import { MathRules } from '@platejs/math'
import {
  BulletedListRules,
  OrderedListRules,
  toggleBulletedList,
  toggleTaskList,
} from '@platejs/list-classic'
import { KEYS, createBlockStartInputRule, defineInputRule, type Path, type TRange } from 'platejs'
import {
  setPlateMarkdownInputRulesComposing,
  withPlateMarkdownInputRuleGuard,
} from '@/components/plate/plateMarkdownInputRuleGuard'

export { setPlateMarkdownInputRulesComposing }

const plusListRule = createBlockStartInputRule({
  apply: ({ editor }, match) => {
    editor.tf.delete({ at: match.range })
    toggleBulletedList(editor)
    return true
  },
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

export const plateHeadingMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(HeadingRules.markdown()),
]

export const plateBlockquoteMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(BlockquoteRules.markdown()),
]

export const plateHorizontalRuleMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(HorizontalRuleRules.markdown({ variant: '-' })),
]

export const plateBoldMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(BoldRules.markdown({ variant: '*' })),
  withPlateMarkdownInputRuleGuard(BoldRules.markdown({ variant: '_' })),
]

export const plateItalicMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(ItalicRules.markdown({ variant: '*' })),
  withPlateMarkdownInputRuleGuard(ItalicRules.markdown({ variant: '_' })),
]

export const plateCodeMarkdownInputRules = [withPlateMarkdownInputRuleGuard(CodeRules.markdown())]

export const plateStrikethroughMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(StrikethroughRules.markdown()),
]

export const plateListMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(BulletedListRules.markdown({ variant: '-' })),
  withPlateMarkdownInputRuleGuard(BulletedListRules.markdown({ variant: '*' })),
  withPlateMarkdownInputRuleGuard(plusListRule),
  withPlateMarkdownInputRuleGuard(OrderedListRules.markdown({ variant: '.' })),
  withPlateMarkdownInputRuleGuard(taskListRule),
]

export const plateCodeBlockMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(CodeBlockRules.markdown({ on: 'break' })),
  withPlateMarkdownInputRuleGuard(languageFenceRule),
]

export const plateLinkMarkdownInputRules = [withPlateMarkdownInputRuleGuard(LinkRules.markdown())]

export const plateInlineMathMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(MathRules.markdown({ variant: '$' })),
]

export const plateBlockMathMarkdownInputRules = [
  withPlateMarkdownInputRuleGuard(MathRules.markdown({ on: 'break', variant: '$$' })),
]
