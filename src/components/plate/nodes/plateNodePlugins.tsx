import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
} from '@platejs/basic-nodes/react'
import { CodeBlockPlugin, CodeLinePlugin, CodeSyntaxPlugin } from '@platejs/code-block/react'
import { DndPlugin } from '@platejs/dnd'
import { LinkPlugin } from '@platejs/link/react'
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
  TaskListPlugin,
} from '@platejs/list-classic/react'
import { ImagePlugin } from '@platejs/media/react'
import { all, createLowlight } from 'lowlight'
import {
  onKeyDownTable,
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from '@platejs/table/react'
import { createPlatePlugin, ParagraphPlugin } from 'platejs/react'
import {
  BlockquoteElement,
  BoldLeaf,
  H1Element,
  H2Element,
  H3Element,
  H4Element,
  H5Element,
  H6Element,
  HorizontalRuleElement,
  InlineCodeLeaf,
  ItalicLeaf,
  ParagraphElement,
  StrikethroughLeaf,
} from '@/components/plate/nodes/BasicElements'
import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from '@/components/plate/nodes/CodeElements'
import {
  createImageElement,
  createLinkElement,
  type PlatePreviewOptions,
} from '@/components/plate/nodes/MediaElements'
import {
  ListItemElement,
  NumberedListElement,
  TaskListElement,
} from '@/components/plate/nodes/ListElements'
import {
  TableCellElement,
  TableContainer,
  TableElement,
  TableHeaderCellElement,
  TableRowElement,
} from '@/components/plate/nodes/TableElements'
import { isImeCompositionEvent } from '@/components/plate/nodes/tableOperations'
import {
  HtmlBreakElement,
  HtmlDetailsElement,
  HtmlKbdElement,
  HtmlSummaryElement,
} from '@/components/plate/nodes/HtmlElements'
import {
  PLATE_HTML_BR,
  PLATE_HTML_DETAILS,
  PLATE_HTML_KBD,
  PLATE_HTML_SUMMARY,
} from '@/components/plate/html/plateHtmlTypes'
import {
  plateBlockquoteMarkdownInputRules,
  plateBoldMarkdownInputRules,
  plateCodeBlockMarkdownInputRules,
  plateCodeMarkdownInputRules,
  plateHeadingMarkdownInputRules,
  plateHorizontalRuleMarkdownInputRules,
  plateItalicMarkdownInputRules,
  plateLinkMarkdownInputRules,
  plateListMarkdownInputRules,
  plateStrikethroughMarkdownInputRules,
} from '@/components/plate/plateMarkdownInputRules'
import { plateClassicListCompatibilityPlugin } from '@/components/plate/plateClassicListCompatibility'
import { blockDraggableWrapper } from '@/components/plate/nodes/BlockDraggable'
import { BulletedListElement } from '@/components/ui/list-classic-node'

const codeBlockLowlight = createLowlight({ ...all, shell: all.bash })

const HtmlDetailsPlugin = createPlatePlugin({
  key: PLATE_HTML_DETAILS,
  node: { isElement: true },
}).withComponent(HtmlDetailsElement)

const HtmlSummaryPlugin = createPlatePlugin({
  key: PLATE_HTML_SUMMARY,
  node: { isElement: true },
}).withComponent(HtmlSummaryElement)

const HtmlKbdPlugin = createPlatePlugin({
  key: PLATE_HTML_KBD,
  node: { isElement: true, isInline: true },
}).withComponent(HtmlKbdElement)

const HtmlBreakPlugin = createPlatePlugin({
  key: PLATE_HTML_BR,
  node: { isElement: true, isInline: true, isVoid: true },
}).withComponent(HtmlBreakElement)

export const createPlateNodePlugins = (previewOptions: PlatePreviewOptions = {}) => [
  ParagraphPlugin.withComponent(ParagraphElement),
  HtmlDetailsPlugin,
  HtmlSummaryPlugin,
  HtmlKbdPlugin,
  HtmlBreakPlugin,
  BlockquotePlugin.configure({
    inputRules: plateBlockquoteMarkdownInputRules,
  }).withComponent(BlockquoteElement),
  H1Plugin.configure({ inputRules: plateHeadingMarkdownInputRules }).withComponent(H1Element),
  H2Plugin.configure({ inputRules: plateHeadingMarkdownInputRules }).withComponent(H2Element),
  H3Plugin.configure({ inputRules: plateHeadingMarkdownInputRules }).withComponent(H3Element),
  H4Plugin.configure({ inputRules: plateHeadingMarkdownInputRules }).withComponent(H4Element),
  H5Plugin.configure({ inputRules: plateHeadingMarkdownInputRules }).withComponent(H5Element),
  H6Plugin.configure({ inputRules: plateHeadingMarkdownInputRules }).withComponent(H6Element),
  HorizontalRulePlugin.configure({
    inputRules: plateHorizontalRuleMarkdownInputRules,
  }).withComponent(HorizontalRuleElement),
  BoldPlugin.configure({ inputRules: plateBoldMarkdownInputRules }).withComponent(BoldLeaf),
  ItalicPlugin.configure({ inputRules: plateItalicMarkdownInputRules }).withComponent(ItalicLeaf),
  StrikethroughPlugin.configure({
    inputRules: plateStrikethroughMarkdownInputRules,
  }).withComponent(StrikethroughLeaf),
  CodePlugin.configure({ inputRules: plateCodeMarkdownInputRules }).withComponent(InlineCodeLeaf),
  ListPlugin.configure({ inputRules: plateListMarkdownInputRules }),
  ListItemPlugin.withComponent(ListItemElement),
  ListItemContentPlugin,
  BulletedListPlugin.withComponent(BulletedListElement),
  NumberedListPlugin.withComponent(NumberedListElement),
  TaskListPlugin.withComponent(TaskListElement),
  plateClassicListCompatibilityPlugin,
  CodeBlockPlugin.configure({
    inputRules: plateCodeBlockMarkdownInputRules,
    options: { lowlight: codeBlockLowlight },
  }).withComponent(CodeBlockElement),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
  LinkPlugin.configure({
    inputRules: plateLinkMarkdownInputRules,
    options: {
      allowedSchemes: ['http', 'https', 'mailto', 'tel', 'marklab'],
      defaultLinkAttributes: { rel: 'noreferrer' },
    },
  }).withComponent(createLinkElement(previewOptions)),
  ImagePlugin.withComponent(createImageElement(previewOptions)),
  TablePlugin.configure({
    handlers: {
      onKeyDown: (context) => {
        const { event } = context
        if (
          isImeCompositionEvent({
            isComposing: event.nativeEvent.isComposing,
            key: event.key,
          })
        ) {
          return
        }
        return onKeyDownTable(context as Parameters<typeof onKeyDownTable>[0])
      },
    },
    render: {
      aboveNodes: (props) => {
        if (props.element.type !== TablePlugin.key) return
        return TableContainer
      },
    },
  }).withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableHeaderCellElement),
  DndPlugin.configure({
    options: {
      enableScroller: false,
    },
    render: { aboveNodes: blockDraggableWrapper },
  }),
]
