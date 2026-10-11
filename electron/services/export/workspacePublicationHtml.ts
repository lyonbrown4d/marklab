import { renderHtmlFragmentWithLocalImages } from '@electron/services/export/html'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'

export type WorkspacePublicationSource = {
  markdown: string
  path: string
  readImage: (url: string) => Promise<Buffer | null>
  title: string
}

export const renderWorkspacePublicationHtml = async (
  chapters: WorkspacePublicationSource[],
  options: WorkspacePublicationOptions,
): Promise<string> => {
  const labels = publicationLabels(options.locale, chapters.length)
  const rendered = await Promise.all(
    chapters.map(async (chapter, index) => ({
      ...chapter,
      body: await renderHtmlFragmentWithLocalImages(chapter.markdown, {
        readImage: chapter.readImage,
        resolveRelativeResources: true,
      }),
      number: index + 1,
    })),
  )
  const chapterHtml = rendered
    .map(
      (chapter) => `
<section class="publication-chapter${options.pageBreaks ? ' page-break' : ''}">
  <div class="chapter-kicker">${String(chapter.number).padStart(2, '0')}</div>
  ${chapter.body}
</section>`,
    )
    .join('\n')
  return `<!DOCTYPE html>
<html lang="${options.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style>${publicationStyles(options)}</style>
</head>
<body>
  ${options.pageNumbers ? '<footer class="page-number"></footer>' : ''}
  ${options.cover ? cover(options.title, chapters.length, labels.chapterCount) : ''}
  ${options.tableOfContents ? tableOfContents(rendered, labels.contents) : ''}
  ${chapterHtml}
</body>
</html>`
}

const cover = (title: string, chapterCount: number, chapterLabel: string): string => `
<section class="publication-cover">
  <div class="cover-mark">MARKLAB</div>
  <div>
    <h1>${escapeHtml(title)}</h1>
    <p>${chapterCount} ${chapterLabel}</p>
  </div>
  <div class="cover-rule"></div>
</section>`

const tableOfContents = (
  chapters: Array<WorkspacePublicationSource & { number: number }>,
  contentsLabel: string,
): string => `
<section class="publication-toc">
  <div class="chapter-kicker">CONTENTS</div>
  <h1>${contentsLabel}</h1>
  <ol>${chapters
    .map(
      (chapter) =>
        `<li><span>${String(chapter.number).padStart(2, '0')} ${escapeHtml(chapter.title)}</span><span>${chapter.number + 2}</span></li>`,
    )
    .join('')}</ol>
</section>`

const publicationStyles = (options: WorkspacePublicationOptions): string => {
  const pageSize = options.pageSize === 'letter' ? 'Letter' : options.pageSize.toUpperCase()
  const margin = options.margin === 'narrow' ? '12mm' : options.margin === 'wide' ? '26mm' : '18mm'
  return `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    @page { size: ${pageSize} ${options.orientation}; margin: ${margin}; }
    html, body { margin: 0; background: #fff; color: #111827; }
    body { font: 15px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    .publication-cover, .publication-toc { min-height: 86vh; break-after: page; }
    .publication-cover { display: flex; flex-direction: column; justify-content: space-between; padding: 12vh 4vw 7vh; }
    .cover-mark, .chapter-kicker { color: #2563eb; font-size: 11px; font-weight: 700; letter-spacing: .14em; }
    .publication-cover h1 { max-width: 14em; margin: 0 0 18px; font-size: 42px; line-height: 1.12; }
    .publication-cover p { color: #64748b; }
    .cover-rule { height: 5px; width: 80px; background: #2563eb; }
    .publication-toc { padding-top: 4vh; }
    .publication-toc h1 { margin: 14px 0 30px; font-size: 34px; }
    .publication-toc ol { list-style: none; margin: 0; padding: 0; }
    .publication-toc li { display: flex; justify-content: space-between; gap: 20px; padding: 9px 0; border-bottom: 1px dotted #cbd5e1; }
    .publication-chapter { max-width: 820px; margin: 0 auto; padding-top: 4mm; }
    .publication-chapter.page-break { break-before: page; }
    h1, h2, h3, h4, h5, h6 { color: #0f172a; line-height: 1.24; break-after: avoid; }
    h1 { margin: .25em 0 .8em; font-size: 30px; }
    h2 { margin: 1.5em 0 .55em; font-size: 22px; }
    h3 { margin: 1.35em 0 .5em; font-size: 18px; }
    p { margin: .7em 0; }
    a { color: #1d4ed8; text-underline-offset: .15em; }
    blockquote { margin: 1em 0; padding: .2em 1em; color: #475569; border-left: 3px solid #94a3b8; background: #f8fafc; }
    pre { padding: 14px; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid #e2e8f0; border-radius: 5px; background: #f8fafc; break-inside: avoid; }
    code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .9em; }
    img { display: block; max-width: 100%; height: auto; margin: 1em 0; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; break-inside: avoid; }
    th, td { padding: 7px 9px; border: 1px solid #cbd5e1; text-align: left; }
    .page-number { position: fixed; right: 0; bottom: -9mm; left: 0; color: #64748b; font-size: 10px; text-align: center; }
    .page-number::after { content: counter(page); }
  `
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const publicationLabels = (locale: WorkspacePublicationOptions['locale'], chapterCount: number) =>
  locale === 'zh-CN'
    ? { chapterCount: '章', contents: '目录' }
    : { chapterCount: chapterCount === 1 ? 'chapter' : 'chapters', contents: 'Contents' }
