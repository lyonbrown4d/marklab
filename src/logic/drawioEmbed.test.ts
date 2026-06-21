import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWIO_EMBED_URL,
  createDrawioLoadMessage,
  createDrawioSaveRequestMessage,
  normalizeDrawioEmbedUrl,
  parseDrawioFrameMessage,
  resolveDrawioEmbedUrl,
} from '@/logic/drawioEmbed'

describe('drawioEmbed', () => {
  it('normalizes remote embed urls for json protocol', () => {
    expect(normalizeDrawioEmbedUrl('')).toBe(DEFAULT_DRAWIO_EMBED_URL)
    expect(normalizeDrawioEmbedUrl('https://embed.diagrams.net/?ui=min')).toBe(
      'https://embed.diagrams.net/?ui=min&embed=1&proto=json',
    )
  })

  it('rejects non-https and credentialed remote urls', () => {
    expect(resolveDrawioEmbedUrl('http://embed.diagrams.net/?embed=1').ok).toBe(false)
    expect(resolveDrawioEmbedUrl('https://user:pass@embed.diagrams.net/?embed=1').ok).toBe(false)
  })

  it('parses iframe messages defensively', () => {
    expect(parseDrawioFrameMessage(JSON.stringify({ event: 'init' }))).toEqual({
      event: 'init',
      message: undefined,
      xml: undefined,
    })
    expect(parseDrawioFrameMessage({ event: 'save', xml: '<mxfile />' })).toEqual({
      event: 'save',
      message: undefined,
      xml: '<mxfile />',
    })
    expect(parseDrawioFrameMessage('not json')).toBeNull()
    expect(parseDrawioFrameMessage({ event: '' })).toBeNull()
  })

  it('creates load messages without autosave to avoid large IPC payloads', () => {
    expect(createDrawioLoadMessage({ title: 'flow.drawio', xml: '<mxfile />' })).toMatchObject({
      action: 'load',
      autosave: 0,
      title: 'flow.drawio',
      xml: '<mxfile />',
    })
  })

  it('requests xml through the export action', () => {
    expect(createDrawioSaveRequestMessage()).toEqual({
      action: 'export',
      format: 'xml',
    })
  })
})
