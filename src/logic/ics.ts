export type IcsEvent = {
  uid?: string
  summary: string
  description?: string
  location?: string
  start: Date | null
  end: Date | null
  allDay: boolean
}

export type IcsCalendar = {
  events: IcsEvent[]
}

type IcsProperty = {
  name: string
  params: string[]
  value: string
}

const unfoldLines = (content: string) => {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const unfolded: string[] = []

  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] = `${unfolded[unfolded.length - 1]}${line.slice(1)}`
      continue
    }

    unfolded.push(line.trimEnd())
  }

  return unfolded
}

const unescapeIcsText = (value: string) =>
  value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

const parseProperty = (line: string): IcsProperty | null => {
  const separatorIndex = line.indexOf(':')
  if (separatorIndex < 1) {
    return null
  }

  const header = line.slice(0, separatorIndex)
  const value = line.slice(separatorIndex + 1)
  const [name = '', ...params] = header.split(';')

  return {
    name: name.toUpperCase(),
    params: params.map((param) => param.toUpperCase()),
    value: unescapeIcsText(value),
  }
}

const hasDateValueParam = (property: IcsProperty) =>
  property.params.some((param) => param === 'VALUE=DATE')

const parseIcsDate = (property: IcsProperty | undefined) => {
  if (!property) {
    return { date: null, allDay: false }
  }

  const value = property.value.trim()
  if (/^\d{8}$/.test(value) || hasDateValueParam(property)) {
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(4, 6)) - 1
    const day = Number(value.slice(6, 8))
    return { date: new Date(year, month, day), allDay: true }
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value)
  if (!match) {
    return { date: null, allDay: false }
  }

  const [, year, month, day, hour, minute, second, utc] = match
  const parts = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ] as const

  if (utc === 'Z') {
    return { date: new Date(Date.UTC(...parts)), allDay: false }
  }

  return { date: new Date(...parts), allDay: false }
}

const eventFromProperties = (properties: IcsProperty[]): IcsEvent | null => {
  const byName = new Map<string, IcsProperty>()
  for (const property of properties) {
    byName.set(property.name, property)
  }

  const start = parseIcsDate(byName.get('DTSTART'))
  const end = parseIcsDate(byName.get('DTEND'))
  const summary = byName.get('SUMMARY')?.value.trim() || 'Untitled event'

  if (!start.date && !summary) {
    return null
  }

  return {
    uid: byName.get('UID')?.value,
    summary,
    description: byName.get('DESCRIPTION')?.value,
    location: byName.get('LOCATION')?.value,
    start: start.date,
    end: end.date,
    allDay: start.allDay,
  }
}

export const parseIcsCalendar = (content: string): IcsCalendar => {
  const events: IcsEvent[] = []
  let currentEvent: IcsProperty[] | null = null

  for (const line of unfoldLines(content)) {
    const upperLine = line.toUpperCase()
    if (upperLine === 'BEGIN:VEVENT') {
      currentEvent = []
      continue
    }

    if (upperLine === 'END:VEVENT') {
      if (currentEvent) {
        const event = eventFromProperties(currentEvent)
        if (event) {
          events.push(event)
        }
      }

      currentEvent = null
      continue
    }

    if (!currentEvent) {
      continue
    }

    const property = parseProperty(line)
    if (property) {
      currentEvent.push(property)
    }
  }

  return {
    events: events.sort((left, right) => {
      const leftTime = left.start?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightTime = right.start?.getTime() ?? Number.MAX_SAFE_INTEGER
      return leftTime - rightTime
    }),
  }
}

export const isCalendarFilePath = (path: string) => /\.ics$/i.test(path)

export const dateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
