import { describe, expect, it } from 'vitest'
import {
  formatExportLabel,
  upsertRecentExportTask,
} from '@/components/status-center/statusCenterModel'

describe('formatExportLabel', () => {
  it('formats a cancelled export independently from a failure', () => {
    const t = (key: string) => key
    const label = formatExportLabel(
      {
        id: 'export-1',
        format: 'pdf',
        output_path: 'report.pdf',
        status: 'cancelled',
        updatedAt: 1,
      },
      t,
    )

    expect(label).toBe('statusCenter.exportCancelled')
  })
})

describe('upsertRecentExportTask', () => {
  it('keeps only the most recent bounded task entries', () => {
    let tasks = {}
    for (let index = 0; index < 15; index += 1) {
      tasks = upsertRecentExportTask(
        tasks,
        {
          format: 'pdf',
          id: `export-${index}`,
          output_path: `${index}.pdf`,
          status: 'finished',
        },
        index,
      )
    }

    expect(Object.keys(tasks)).toHaveLength(12)
    expect(tasks).not.toHaveProperty('export-0')
    expect(tasks).toHaveProperty('export-14')
  })
})
