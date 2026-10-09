import type { UpdateInfo } from 'electron-updater'

const MAX_RELEASE_NOTES_LENGTH = 4_000
const MAX_RELEASE_NOTE_ITEMS = 20

const removeControlCharacters = (value: string): string =>
  Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')

export const toPlainTextReleaseNotes = (
  releaseNotes: UpdateInfo['releaseNotes'],
): string | undefined => {
  const combined = Array.isArray(releaseNotes)
    ? releaseNotes
        .slice(0, MAX_RELEASE_NOTE_ITEMS)
        .map((item) =>
          typeof item.note === 'string' ? item.note.slice(0, MAX_RELEASE_NOTES_LENGTH) : '',
        )
        .filter(Boolean)
        .join('\n\n')
    : typeof releaseNotes === 'string'
      ? releaseNotes.slice(0, MAX_RELEASE_NOTES_LENGTH * 4)
      : ''
  if (!combined) return undefined

  const plainText = removeControlCharacters(
    combined
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|h[1-6]|li|p)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_RELEASE_NOTES_LENGTH)

  return plainText || undefined
}
