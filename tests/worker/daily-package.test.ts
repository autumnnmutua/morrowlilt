import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ensureDailyContent } from '../../worker/services/daily-content'
import { ensureDailyLearningPackage } from '../../worker/services/daily-package'

describe('DailyLearningPackage', () => {
  it('persists one stable package with every production email field', async () => {
    const contentDate = '2027-03-18'
    const content = await ensureDailyContent({
      db: env.DB,
      contentDate,
      timeZone: 'Asia/Shanghai',
    })
    const first = await ensureDailyLearningPackage({
      db: env.DB,
      content,
    })
    const second = await ensureDailyLearningPackage({
      db: env.DB,
      content,
    })

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      date: contentDate,
      title: `每日英语学习包 · ${contentDate}`,
    })
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.vocabulary.length).toBeGreaterThanOrEqual(3)
    expect(first.phrases.length).toBeGreaterThanOrEqual(2)
    expect(first.examples.length).toBeGreaterThanOrEqual(4)
    expect(first.grammarNotes.length).toBeGreaterThan(0)
    expect(first.reviewWords.length).toBeGreaterThanOrEqual(3)
    expect(first.phrases[0].expression).toBeTruthy()
  })
})
