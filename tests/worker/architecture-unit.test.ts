import { describe, expect, it } from 'vitest'
import {
  isContentDate,
  isDailyContentPayload,
} from '../../worker/content/schema'
import {
  addLocalDays,
  assertIanaTimeZone,
  getBusinessDate,
  getBusinessHour,
  getLocalDate,
} from '../../worker/time/business-date'

describe('architecture unit boundaries', () => {
  it('derives date and hour from the configured IANA zone, not server UTC', () => {
    const timestamp = Date.parse('2026-08-20T16:30:00.000Z')
    expect(getBusinessDate(timestamp, 'Asia/Shanghai')).toBe('2026-08-21')
    expect(getBusinessHour(timestamp, 'Asia/Shanghai')).toBe(0)
  })

  it('handles UTC crossovers in Shanghai and Tokyo', () => {
    expect(
      getLocalDate('Asia/Shanghai', Date.parse('2026-08-20T16:30:00Z')),
    ).toBe('2026-08-21')
    expect(getLocalDate('Asia/Tokyo', Date.parse('2026-08-20T14:59:00Z'))).toBe(
      '2026-08-20',
    )
    expect(getLocalDate('Asia/Tokyo', Date.parse('2026-08-20T15:00:00Z'))).toBe(
      '2026-08-21',
    )
  })

  it('crosses month-end, year-end, and leap-day boundaries', () => {
    expect(addLocalDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addLocalDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('rejects invalid IANA zones and impossible content dates', () => {
    expect(() => assertIanaTimeZone('Not/A_Real_Zone')).toThrow(
      'valid IANA time zone',
    )
    expect(isContentDate('2026-02-29')).toBe(false)
    expect(isContentDate('2026-08-20')).toBe(true)
  })

  it('rejects incomplete external daily-content payloads', () => {
    expect(
      isDailyContentPayload({
        schemaVersion: 1,
        contentDate: '2026-08-20',
        sentence: { english: 'Missing required fields' },
      }),
    ).toBe(false)
  })
})
