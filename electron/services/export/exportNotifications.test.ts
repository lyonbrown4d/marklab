import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  notifyExportFailed,
  notifyExportFinished,
} from '@electron/services/export/exportNotifications'
import type { DesktopNotificationRequest } from '@electron/services/desktopNotificationService'

const desktopNotifications = {
  show: vi.fn<(request: DesktopNotificationRequest) => boolean>(() => true),
}

describe('export notifications', () => {
  beforeEach(() => desktopNotifications.show.mockClear())

  it('routes completion through the shared policy without exposing the parent path', () => {
    const onClick = vi.fn()

    notifyExportFinished(
      'export:task-one',
      'pdf',
      'C:/Users/Alice/Private/report.pdf',
      7,
      onClick,
      desktopNotifications,
    )

    expect(desktopNotifications.show).toHaveBeenCalledWith({
      body: 'PDF saved to report.pdf',
      category: 'export',
      id: 'export:task-one',
      onClick,
      ownerWebContentsId: 7,
      title: 'Export finished',
    })
  })

  it('keeps detailed failure paths inside renderer feedback', () => {
    notifyExportFailed(
      'export:task-two',
      'docx',
      'C:/Users/Alice/Private/report.docx',
      'EACCES: C:/Users/Alice/Private/report.docx',
      7,
      desktopNotifications,
    )

    const request = desktopNotifications.show.mock.calls[0]?.[0]
    expect(request?.body).toBe('DOCX report.docx failed')
    expect(request?.body).not.toContain('C:/Users/Alice/Private')
  })

  it('does nothing when no desktop notification service is configured', () => {
    expect(() =>
      notifyExportFinished('export:task-three', 'html', '/tmp/report.html', undefined),
    ).not.toThrow()
  })
})
