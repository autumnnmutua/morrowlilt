import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ADMIN_API_KEY: ['local', 'admin', 'fixture'].join('-'),
          RESEND_API_KEY: ['local', 'resend', 'fixture'].join('-'),
          USER_SECRET_ENCRYPTION_KEY:
            'local-test-encryption-key-32-chars-minimum',
          RECIPIENT_EMAIL: ['learner', 'example.invalid'].join('@'),
          MAIL_FROM: ['MorrowLilt <learn', 'example.invalid>'].join('@'),
          ACCESS_TEAM_DOMAIN: 'local-team.cloudflareaccess.com',
          ACCESS_AUD: 'local-test-access-audience',
          PUBLIC_SITE_URL: 'https://study.example.invalid',
          MAIL_SEND_HOUR_LOCAL: '8',
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./migrations', import.meta.url)),
          ),
        },
      },
    })),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
    setupFiles: ['./tests/worker/apply-migrations.ts'],
  },
})
