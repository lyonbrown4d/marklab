import { AlignmentType, Document, LevelFormat, Packer, Paragraph } from 'docx'
import {
  parseMarkdown,
  plainTextFromInlines,
  type MarkdownBlock,
} from '@electron/services/export/markdown.js'
import { blocksToDocxChildren } from '@electron/services/export/docxContent.js'
import { loadDocxImages } from '@electron/services/export/docxImages.js'
import type { LocalImageOptions } from '@electron/services/export/docxImages.js'

const orderedListReference = 'marklab-ordered-list'
type RenderDocxOptions = LocalImageOptions

export const renderDocx = async (
  markdown: string,
  options: RenderDocxOptions = {},
): Promise<Buffer> => {
  const blocks = parseMarkdown(markdown)
  const images = await loadDocxImages(blocks, options)
  const children = blocksToDocxChildren(blocks, images)
  const document = new Document({
    creator: 'Marklab',
    title: firstDocumentTitle(blocks),
    numbering: {
      config: [
        {
          reference: orderedListReference,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children: children.length > 0 ? children : [new Paragraph('')] }],
  })
  return Packer.toBuffer(document)
}

const firstDocumentTitle = (blocks: MarkdownBlock[]): string => {
  const heading = blocks.find((block) => block.type === 'heading')
  return heading?.type === 'heading' ? plainTextFromInlines(heading.children) : 'Marklab Export'
}
