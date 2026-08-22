import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'
import { beforeAll } from 'vitest'

beforeAll(async () => {
  // Platform-generated D1Migration contains a legacy `any` field in the test runtime type.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
