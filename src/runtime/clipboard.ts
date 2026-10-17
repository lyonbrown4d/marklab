import {
  getDesktopRuntime,
  isDesktopRuntime,
  type DesktopClipboardContent,
} from '@/runtime/desktop'
export const readClipboardText = async () => {
  if (isDesktopRuntime()) return getDesktopRuntime().clipboard.readText()
  if (typeof navigator === 'undefined' || !navigator.clipboard) return ''
  return navigator.clipboard.readText()
}
export const writeClipboardText = async (text: string) => {
  if (isDesktopRuntime()) {
    await getDesktopRuntime().clipboard.writeText(text)
    return
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  await navigator.clipboard.writeText(text)
}
export const writeClipboardContent = async (content: DesktopClipboardContent) => {
  if (isDesktopRuntime()) {
    await getDesktopRuntime().clipboard.write(content)
    return
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  await navigator.clipboard.writeText(content.text)
}
export const readClipboardImagePng = async (): Promise<Blob | null> => {
  if (isDesktopRuntime()) {
    const image = await getDesktopRuntime().clipboard.readImage()
    if (!image) return null
    return dataUrlToBlob(image.dataUrl)
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null
  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<ClipboardItem[]>
  }
  if (!clipboard?.read) return null
  const items = await clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (imageType) return item.getType(imageType)
  }
  return null
}
const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl)
  return response.blob()
}
