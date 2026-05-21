import { getElectronRuntime } from '@/runtime/electron'

export async function readClipboardText() {
  const electron = getElectronRuntime()
  if (electron) return electron.clipboard.readText()

  if (typeof navigator === 'undefined' || !navigator.clipboard) return ''
  return navigator.clipboard.readText()
}

export async function writeClipboardText(text: string) {
  const electron = getElectronRuntime()
  if (electron) {
    await electron.clipboard.writeText(text)
    return
  }

  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  await navigator.clipboard.writeText(text)
}

export async function readClipboardImagePng(): Promise<Blob | null> {
  const electron = getElectronRuntime()
  if (electron) {
    const image = await electron.clipboard.readImage()
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
