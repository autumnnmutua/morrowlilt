import { isContentDate } from '../content/schema'

export function assertIanaTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
  } catch {
    throw new Error('APP_TIME_ZONE must be a valid IANA time zone')
  }
}

export function getLocalDate(
  timeZone: string,
  timestamp: number | Date = Date.now(),
): string {
  assertIanaTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const date = `${values.year}-${values.month}-${values.day}`
  if (!isContentDate(date)) throw new Error('Unable to derive business date')
  return date
}

export function getBusinessDate(
  timestamp: number | Date,
  timeZone: string,
): string {
  return getLocalDate(timeZone, timestamp)
}

export function addLocalDays(date: string, days: number): string {
  if (!isContentDate(date) || !Number.isInteger(days)) {
    throw new Error('addLocalDays requires an ISO local date and integer days')
  }
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  const result = [
    value.getUTCFullYear().toString().padStart(4, '0'),
    (value.getUTCMonth() + 1).toString().padStart(2, '0'),
    value.getUTCDate().toString().padStart(2, '0'),
  ].join('-')
  if (!isContentDate(result)) throw new Error('Date arithmetic overflowed')
  return result
}

export function listLocalDatesExclusiveInclusive(
  startExclusive: string,
  endInclusive: string,
): string[] {
  if (!isContentDate(startExclusive) || !isContentDate(endInclusive)) {
    throw new Error('Date range requires ISO local dates')
  }
  if (startExclusive >= endInclusive) return []
  const dates: string[] = []
  for (
    let date = addLocalDays(startExclusive, 1);
    date <= endInclusive;
    date = addLocalDays(date, 1)
  ) {
    dates.push(date)
  }
  return dates
}

export function getBusinessHour(timestamp: number, timeZone: string): number {
  assertIanaTimeZone(timeZone)
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  }).format(timestamp)
  const parsed = Number(hour)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new Error('Unable to derive business hour')
  }
  return parsed
}
