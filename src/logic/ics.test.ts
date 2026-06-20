import { describe, expect, it } from 'vitest'

import { dateKey, isCalendarFilePath, parseIcsCalendar } from '@/logic/ics'

describe('parseIcsCalendar', () => {
  it('parses all-day events and folded text', () => {
    const calendar = parseIcsCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:event-1',
        'DTSTART;VALUE=DATE:20260620',
        'SUMMARY:Roadmap',
        'DESCRIPTION:First line',
        ' second line',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    )

    expect(calendar.events).toHaveLength(1)
    expect(calendar.events[0]).toMatchObject({
      uid: 'event-1',
      summary: 'Roadmap',
      description: 'First linesecond line',
      allDay: true,
    })
    expect(calendar.events[0].start && dateKey(calendar.events[0].start)).toBe('2026-06-20')
  })

  it('sorts timed events by start time', () => {
    const calendar = parseIcsCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20260620T140000Z',
        'SUMMARY:Later',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART:20260620T120000Z',
        'SUMMARY:Earlier',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n'),
    )

    expect(calendar.events.map((event) => event.summary)).toEqual(['Earlier', 'Later'])
  })
})

describe('isCalendarFilePath', () => {
  it('matches ics files case-insensitively', () => {
    expect(isCalendarFilePath('calendar.ics')).toBe(true)
    expect(isCalendarFilePath('calendar.ICS')).toBe(true)
    expect(isCalendarFilePath('calendar.md')).toBe(false)
  })
})
