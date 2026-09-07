import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createSeedCandidates } from '../../worker/content/seeds'
import { tryInsertProfileDailyContent } from '../../worker/repository/profile-daily-content'
import { ensureAppProfile } from '../../worker/services/learning'
import { ensureProfileDailyContent } from '../../worker/services/profile-daily-content'

describe('profile daily content seed reserve', () => {
  it('treats a concurrent cross-account fingerprint collision as a resampling opportunity', async () => {
    const contentDate = '2026-09-29'
    const candidate = createSeedCandidates(contentDate)[0]
    for (const profileId of ['collision-a', 'collision-b'])
      await ensureAppProfile({
        db: env.DB,
        profileId,
        timeZone: 'Asia/Shanghai',
      })
    const results = await Promise.all(
      ['collision-a', 'collision-b'].map((profileId) =>
        tryInsertProfileDailyContent({
          db: env.DB,
          profileId,
          contentDate,
          candidate,
          source: 'seed',
        }),
      ),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.filter((value) => value === undefined)).toHaveLength(1)
  })
  it('does not disguise a D1 insert failure as content exhaustion', async () => {
    const profileId = 'profile-insert-failure'
    const contentDate = '2026-09-30'
    await ensureAppProfile({
      db: env.DB,
      profileId,
      timeZone: 'Asia/Shanghai',
    })
    const databaseError = new Error('simulated D1 write failure')
    const failingDb = {
      prepare: env.DB.prepare.bind(env.DB),
      batch: () => Promise.reject(databaseError),
    } as unknown as D1Database

    await expect(
      tryInsertProfileDailyContent({
        db: failingDb,
        profileId,
        contentDate,
        candidate: createSeedCandidates(contentDate)[0],
        source: 'seed',
      }),
    ).rejects.toBe(databaseError)
  })

  it('uses every exact-novel seed before reporting exhaustion', async () => {
    const profileId = 'profile-seed-reserve'
    await ensureAppProfile({
      db: env.DB,
      profileId,
      timeZone: 'Asia/Shanghai',
    })

    const availableSeeds = createSeedCandidates('2026-10-01').length
    const expressionReserve = Array.from(
      { length: availableSeeds },
      (_, offset) =>
        createSeedCandidates('2026-10-01', offset)[0].payload
          .practicalExpressions ?? [],
    ).flat()
    expect(
      new Set(expressionReserve.map((item) => item.expression)),
    ).toHaveLength(availableSeeds * 3)
    const generated = []
    for (let day = 1; day <= availableSeeds; day += 1) {
      try {
        generated.push(
          await ensureProfileDailyContent({
            db: env.DB,
            profileId,
            contentDate: `2026-10-${String(day).padStart(2, '0')}`,
            timeZone: 'Asia/Shanghai',
          }),
        )
      } catch (error) {
        throw new Error(`Seed reserve exhausted on day ${day}`, {
          cause: error,
        })
      }
    }

    expect(new Set(generated.map((item) => item.fingerprint))).toHaveLength(
      availableSeeds,
    )
    expect(
      new Set(generated.map((item) => item.payload.sentence.english)),
    ).toHaveLength(availableSeeds)
    expect(
      new Set(
        generated.flatMap((item) =>
          item.payload.vocabulary.map((word) => word.term),
        ),
      ),
    ).toHaveLength(availableSeeds * 3)
    expect(
      new Set(
        generated.flatMap((item) =>
          (item.payload.practicalExpressions ?? []).map(
            (expression) => expression.expression,
          ),
        ),
      ),
    ).toHaveLength(availableSeeds * 3)
  })
})
