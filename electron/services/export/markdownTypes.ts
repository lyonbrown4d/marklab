export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'emphasis'; children: MarkdownInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; url: string; title?: string; children: MarkdownInline[] }
  | { type: 'image'; url: string; title?: string; alt: string }

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'blockquote'; blocks: MarkdownBlock[] }
  | { type: 'codeBlock'; text: string; language?: string }
  | { type: 'list'; ordered: boolean; items: MarkdownInline[][] }
  | { type: 'thematicBreak' }
  | { type: 'table'; header: MarkdownInline[][]; rows: MarkdownInline[][][] }
