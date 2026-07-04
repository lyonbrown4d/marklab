import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CalendarFilePage from '@/pages/CalendarFilePage'

const calendarEvents = vi.hoisted(() => [
  {
    allDay: true,
    description: 'Prepare roadmap notes',
    location: 'Studio',
    start: new Date(2026, 6, 3),
    summary: 'Planning review',
    uid: 'event-1',
  },
  {
    allDay: true,
    description: '',
    location: '',
    start: new Date(2026, 6, 4),
    summary: 'Design QA',
    uid: 'event-2',
  },
])

const translations = vi.hoisted(() => ({
  'calendar.allDay': 'All day',
  'calendar.dayEvents': 'Day events',
  'calendar.eventCount': '{{count}} events',
  'calendar.mode': 'Calendar view',
  'calendar.noEvents': 'No events on this day',
  'calendar.openSource': 'Open source',
  'calendar.totalEvents': '{{count}} events total',
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { count?: number }) => {
      const value = translations[key as keyof typeof translations] ?? key

      return typeof params?.count === 'number'
        ? value.replace('{{count}}', String(params.count))
        : value
    },
  }),
}))

vi.mock('@/logic/ics', () => {
  const toDateKey = (date: Date) =>
    [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
      .join('-')

  return {
    dateKey: toDateKey,
    parseIcsCalendar: () => ({ events: calendarEvents }),
  }
})

type CalendarProps = {
  modifiers?: {
    event?: Date[]
  }
  onSelect?: (date?: Date) => void
  selected?: Date
}

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ modifiers, onSelect, selected }: CalendarProps) => (
    <section
      aria-label="Calendar picker"
      data-event-count={modifiers?.event?.length ?? 0}
      data-selected-day={selected?.getDate()}
    >
      <button type="button" onClick={() => onSelect?.(new Date(2026, 6, 4))}>
        Select Design QA
      </button>
      <button type="button" onClick={() => onSelect?.(new Date(2026, 6, 5))}>
        Select empty day
      </button>
    </section>
  ),
}))

describe('CalendarFilePage', () => {
  it('renders calendar metadata, events, icon sizing, and source action', () => {
    const onOpenSource = vi.fn()
    const { container } = render(
      <CalendarFilePage
        activePath="notes/calendar.ics"
        value="BEGIN:VCALENDAR"
        showStatusBar
        onOpenSource={onOpenSource}
      />,
    )

    expect(screen.getByText('notes/calendar.ics')).toBeInTheDocument()
    expect(screen.getByLabelText('Calendar picker')).toHaveAttribute('data-event-count', '2')
    expect(screen.getByText('Planning review')).toBeInTheDocument()
    expect(screen.getByText('All day')).toBeInTheDocument()
    expect(screen.getByText('Studio')).toBeInTheDocument()
    expect(screen.getByText('Prepare roadmap notes')).toBeInTheDocument()
    expect(screen.getByText('1 events')).toBeInTheDocument()
    expect(screen.getByText('Calendar view')).toBeInTheDocument()
    expect(screen.getByText('2 events total')).toBeInTheDocument()

    expect(container.querySelector('[class~="size-10"]')).not.toBeNull()
    expect(container.querySelector('svg.lucide-calendar-days')).toHaveClass('size-5')
    expect(container.querySelector('svg.lucide-clock')).toHaveClass('size-3.5')
    expect(container.querySelector('svg.lucide-map-pin')).toHaveClass('size-3.5')

    const openSourceButton = screen.getByRole('button', { name: 'Open source' })
    expect(openSourceButton.querySelector('svg')).toHaveAttribute('data-icon', 'inline-start')

    fireEvent.click(openSourceButton)

    expect(onOpenSource).toHaveBeenCalledTimes(1)
  })

  it('updates the selected date and renders the empty state', () => {
    render(
      <CalendarFilePage
        activePath="notes/calendar.ics"
        value="BEGIN:VCALENDAR"
        showStatusBar={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select Design QA' }))

    expect(screen.getByText('Design QA')).toBeInTheDocument()
    expect(screen.queryByText('Planning review')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select empty day' }))

    expect(screen.getByRole('status')).toHaveAttribute('data-slot', 'empty')
    expect(
      screen.getByRole('heading', { level: 3, name: 'No events on this day' }),
    ).toBeInTheDocument()
    expect(screen.getByText('0 events')).toBeInTheDocument()
    expect(screen.queryByText('Calendar view')).not.toBeInTheDocument()
  })
})
