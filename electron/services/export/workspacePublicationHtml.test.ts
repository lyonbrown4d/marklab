import { describe, expect, it } from 'vitest'
import { renderWorkspacePublicationHtml } from '@electron/services/export/workspacePublicationHtml'

describe('renderWorkspacePublicationHtml', () => {
  it('applies publication structure and print settings', async () => {
    const html = await renderWorkspacePublicationHtml(
      [
        {
          markdown: '# Introduction\n\nHello.',
          path: 'intro.md',
          readImage: async () => null,
          title: 'Introduction',
        },
      ],
      {
        cover: true,
        format: 'pdf',
        locale: 'en-US',
        margin: 'wide',
        orientation: 'landscape',
        pageBreaks: true,
        pageNumbers: true,
        pageSize: 'a5',
        tableOfContents: true,
        title: 'Product <Guide>',
      },
    )

    expect(html).toContain('<title>Product &lt;Guide&gt;</title>')
    expect(html).toContain('<html lang="en-US">')
    expect(html).toContain('<h1>Contents</h1>')
    expect(html).toContain('<p>1 chapter</p>')
    expect(html).toContain('@page { size: A5 landscape; margin: 26mm; }')
    expect(html).toContain('publication-cover')
    expect(html).toContain('publication-toc')
    expect(html).toContain('publication-chapter page-break')
    expect(html).toContain('page-number')
  })
})
