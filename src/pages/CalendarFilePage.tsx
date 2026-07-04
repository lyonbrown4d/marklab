import { memo, useMemo, useState } from 'react'
import { CalendarDays, Clock, Code2, MapPin } from 'lucide-react'

import AppEmptyState from '@/components/AppEmptyState'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { dateKey, parseIcsCalendar } from '@/logic/ics'
import { createFileLabel } from '@/logic/paths'
import { useI18n } from '@/i18n/useI18n'

type CalendarFilePageProps = {
  activePath: string
  value: string
  onOpenSource?: () => void
  showStatusBar: boolean
}

const formatEventTime = (date: Date | null, allDay: boolean, allDayLabel: string) => {
  if (!date) {
    return ''
  }

  if (allDay) {
    return allDayLabel
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const CalendarFilePage = memo(
  ({ activePath, value, onOpenSource, showStatusBar }: CalendarFilePageProps) => {
    const { t } = useI18n()
    const calendar = useMemo(() => parseIcsCalendar(value), [value])
    const eventDates = useMemo(
      () => calendar.events.flatMap((event) => (event.start ? [event.start] : [])),
      [calendar.events],
    )
    const firstEventDate = calendar.events.find((event) => event.start)?.start
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(firstEventDate ?? new Date())
    const selectedDateKey = selectedDate ? dateKey(selectedDate) : null
    const selectedEvents = useMemo(
      () =>
        selectedDateKey
          ? calendar.events.filter(
              (event) => event.start && dateKey(event.start) === selectedDateKey,
            )
          : [],
      [calendar.events, selectedDateKey],
    )

    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex min-h-0 flex-1 overflow-auto p-5">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CalendarDays className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {createFileLabel(activePath)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{activePath}</div>
                </div>
              </div>
              {onOpenSource && (
                <Button variant="outline" size="sm" onClick={onOpenSource}>
                  <Code2 data-icon="inline-start" />
                  {t('calendar.openSource')}
                </Button>
              )}
            </div>

            <div className="grid min-h-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="rounded-lg border border-border bg-card p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  modifiers={{ event: eventDates }}
                  modifiersClassNames={{
                    event:
                      'font-semibold text-primary after:mx-auto after:mt-0.5 after:block after:h-1 after:w-1 after:rounded-full after:bg-primary',
                  }}
                />
              </div>

              <div className="min-h-[320px] rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{t('calendar.dayEvents')}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedDate?.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {t('calendar.eventCount', { count: selectedEvents.length })}
                  </div>
                </div>

                {selectedEvents.length === 0 ? (
                  <AppEmptyState
                    className="min-h-[220px] rounded-md border-border/80 bg-muted/15"
                    compact
                    role="status"
                    title={t('calendar.noEvents')}
                    titleClassName="font-normal text-muted-foreground"
                    titleLevel={3}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedEvents.map((event, index) => (
                      <div
                        key={event.uid ?? `${event.summary}-${index}`}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <div className="font-medium">{event.summary}</div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {event.start && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3.5" />
                              {formatEventTime(event.start, event.allDay, t('calendar.allDay'))}
                            </span>
                          )}
                          {event.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" />
                              {event.location}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {event.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {showStatusBar && (
          <div className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs text-muted-foreground">
            <span>{t('calendar.mode')}</span>
            <span>{t('calendar.totalEvents', { count: calendar.events.length })}</span>
          </div>
        )}
      </div>
    )
  },
)

CalendarFilePage.displayName = 'CalendarFilePage'

export default CalendarFilePage
