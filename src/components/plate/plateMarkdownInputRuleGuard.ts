import {
  type InsertBreakInputRuleContext,
  type InsertTextInputRuleContext,
  KEYS,
  type SelectionInputRuleContext,
  type SlateEditor,
} from 'platejs'

type InputRuleWithTarget = {
  enabled?: (...args: never[]) => boolean
  target: string
}

const composingEditors = new WeakSet<SlateEditor>()

const inputRulesEnabled = ({ editor }: SelectionInputRuleContext) =>
  !composingEditors.has(editor) &&
  !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } })

export const withPlateMarkdownInputRuleGuard = <Rule extends InputRuleWithTarget>(
  rule: Rule,
): Rule => {
  if (rule.target === 'insertText') {
    const originalEnabled = rule.enabled as
      ((context: InsertTextInputRuleContext) => boolean) | undefined
    return {
      ...rule,
      enabled: (context: InsertTextInputRuleContext) =>
        inputRulesEnabled(context) && (originalEnabled?.(context) ?? true),
    } as Rule
  }
  if (rule.target === 'insertBreak') {
    const originalEnabled = rule.enabled as
      ((context: InsertBreakInputRuleContext) => boolean) | undefined
    return {
      ...rule,
      enabled: (context: InsertBreakInputRuleContext) =>
        inputRulesEnabled(context) && (originalEnabled?.(context) ?? true),
    } as Rule
  }
  throw new Error(
    `Unsupported Plate Markdown input rule target "${String(rule.target)}". ` +
      'Add an explicit guarded context before enabling this rule.',
  )
}

export const setPlateMarkdownInputRulesComposing = (editor: SlateEditor, composing: boolean) => {
  if (composing) composingEditors.add(editor)
  else composingEditors.delete(editor)
}
