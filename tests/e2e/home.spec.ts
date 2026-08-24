import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  ['今日', '上午好，今天只做最重要的一包。'],
  ['每日学习', '每日学习'],
  ['测试', null],
  ['错题巩固', '保留历史，逐步提高掌握度'],
  ['词典', '词典'],
  ['结果报告', null],
  ['设置', '设置'],
] as const

test('all core page skeletons are reachable and accessible', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('服务正常')).toBeVisible()

  for (const [navigationLabel, heading] of pages) {
    const navigation = page.getByRole('button', { name: navigationLabel })
    if (navigationLabel !== '今日') await navigation.first().click()

    if (heading) {
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible()
    } else {
      await expect(page.locator('main h1')).toBeVisible()
    }
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations,
      `${navigationLabel} has accessibility violations`,
    ).toEqual([])
  }
})

test('quiz answer is keyboard usable, secret-safe, and resumes after reload', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/quiz/sessions', {
    headers: { 'Idempotency-Key': `e2e-quiz-${crypto.randomUUID()}` },
    data: { count: 6, mode: 'mixed' },
  })
  expect(created.status()).toBe(201)
  const session = (await created.json()) as {
    data: {
      questions: Array<{
        inputMode: 'choice' | 'text'
        options?: Array<{ id: string }>
      }>
    }
  }
  expect(JSON.stringify(session)).not.toMatch(
    /standardAnswer|acceptableAnswers|explanation/i,
  )

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')
  await page.getByRole('button', { name: '测试' }).last().click()
  await expect(page.getByText('完成进度：0 / 6')).toBeVisible()

  const first = session.data.questions[0]
  if (first.inputMode === 'choice') {
    await page.getByRole('radio').first().check()
  } else {
    await page.getByLabel('你的答案').fill('offline-safe-answer')
  }
  await page.getByRole('button', { name: '保存并继续' }).click()
  await expect(page.getByText('完成进度：1 / 6')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: '测试' }).last().click()
  await expect(page.getByText('完成进度：1 / 6')).toBeVisible()
  await expect(page.getByText(/已恢复上次进度：1 \/ 6/)).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: 'test-results/visual/morrowlilt-quiz-mobile.png',
  })

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('learning status is explicit and reversible on the same day', async ({
  page,
}) => {
  await page.goto('/')

  const learnedButton = page
    .getByRole('button', {
      name: '整个待学包已学习',
    })
    .first()
  await expect(learnedButton).toHaveAttribute('aria-pressed', 'false')
  await learnedButton.click()
  await expect(
    page.getByRole('alertdialog', { name: '确认结清整个待学包？' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '确认已学习' }).click()
  await expect(
    page.getByText('已结清截至今天的整个待学包；同一业务日内可以撤销。'),
  ).toBeVisible()

  await page.getByRole('button', { name: '撤销，恢复未学习' }).first().click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(
    page.getByText('当前为未学习状态。今天不完成时，全部内容明天仍会保留。'),
  ).toBeVisible()
})

test('per-user Resend settings keep the API key write-only', async ({
  page,
}) => {
  let submittedKey = ''
  await page.route('**/api/email/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          data: {
            status: 'not_configured',
            timeZone: 'Asia/Tokyo',
            deliveryMode: 'bring_your_own',
            providerConfigured: false,
            sendHourLocal: 21,
          },
        },
      })
      return
    }
    const body = route.request().postDataJSON() as { apiKey?: string }
    submittedKey = body.apiKey ?? ''
    await route.fulfill({
      json: {
        data: {
          status: 'not_configured',
          timeZone: 'Asia/Tokyo',
          deliveryMode: 'bring_your_own',
          providerConfigured: true,
          sendHourLocal: 21,
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '设置' }).first().click()
  const apiKeyInput = page.getByLabel('Resend API Key')
  await expect(apiKeyInput).toHaveAttribute('type', 'password')
  const fixtureKey = ['re', 'browserfixture000000'].join('_')
  await apiKeyInput.fill(fixtureKey)
  await page
    .getByLabel('发件地址')
    .fill(['Study <daily', 'mail.example.invalid>'].join('@'))
  await page.getByLabel('邮件时区').fill('Asia/Tokyo')
  await page.getByLabel('每日发送小时').selectOption('21')
  await page.getByRole('button', { name: '保存邮件 API' }).click()

  expect(submittedKey).toBe(fixtureKey)
  await expect(apiKeyInput).toHaveValue('')
  await expect(
    page.getByText(
      '发送域验证通过，邮件 API 已加密保存，可以继续绑定接收邮箱。',
    ),
  ).toBeVisible()
})

test('mobile navigation, touch targets and backlog summaries remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')

  await expect(
    page.getByRole('navigation', { name: '移动端主要导航' }),
  ).toBeVisible()
  await expect(page.getByText(/^本地日期 · /).first()).toBeVisible()
  await expect(page.getByText(/\d+ 天/).first()).toBeVisible()
  await expect(
    page.getByText('今日学习包', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByText('今日地道表达 · 3 条')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '整个待学包已学习' }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '今天保持未学习' }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: '按日期保留，折叠不等于删除' }),
  ).toBeVisible()
  await expect(page.getByText(/累计 \d+ 天 ·\s*\d+ 项/)).toBeVisible()

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)

  const tooSmall = await page
    .locator(
      'button:visible, summary:visible, input[type="search"]:visible, input[type="text"]:visible, select:visible',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const box = element.getBoundingClientRect()
          return {
            label:
              element.getAttribute('aria-label') ?? element.textContent?.trim(),
            width: box.width,
            height: box.height,
          }
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    )
  expect(tooSmall).toEqual([])
})

test('dictionary renders complete stale-cache results accessibly on a small screen', async ({
  page,
}) => {
  await page.route('**/api/dictionary/suggestions?*', async (route) => {
    await route.fulfill({
      json: {
        data: {
          suggestions: ['resilient', 'resilience', 'resiliency'],
          source: 'mixed',
        },
      },
    })
  })
  await page.route('**/api/dictionary/history', async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            term: 'resilient',
            searchCount: 2,
            lastSearchedAt: '2026-08-20T00:00:00.000Z',
          },
        ],
      },
    })
  })
  const examList = {
    slug: 'ielts',
    name: 'IELTS 备考词典',
    shortName: 'IELTS',
    description: '阅读、听力与写作常见词汇。',
    source: {
      name: 'ECDICT',
      url: 'https://github.com/skywind3000/ECDICT',
      license: 'MIT',
    },
    entryCount: 5038,
    letterCounts: { A: 340, B: 238 },
    updatedAt: '2026-08-24T00:00:00.000Z',
  }
  await page.route('**/api/dictionary/exam-lists', async (route) => {
    await route.fulfill({ json: { data: { lists: [examList] } } })
  })
  await page.route('**/api/dictionary/exam-lists/ielts?*', async (route) => {
    await route.fulfill({
      json: {
        data: {
          list: examList,
          letter: 'A',
          letterEntryCount: 340,
          words: [
            { word: 'abandon', normalizedWord: 'abandon', rank: 1 },
            { word: 'ability', normalizedWord: 'ability', rank: 2 },
          ],
          hasMore: true,
          nextCursor: 'ability',
        },
      },
    })
  })
  await page.route('**/api/dictionary?*', async (route) => {
    await route.fulfill({
      json: {
        data: {
          normalizedTerm: 'resilient',
          cacheStatus: 'stale',
          warningCode: 'DICTIONARY_TIMEOUT',
          requestUrl:
            'https://api.dictionaryapi.dev/api/v2/entries/en/resilient',
          attribution: 'Definitions via Free Dictionary API.',
          licenses: [{ name: 'CC BY-SA 3.0' }],
          entries: [
            {
              headword: 'resilient',
              phonetic: '/rɪˈzɪliənt/',
              pronunciations: [],
              forms: [],
              inflections: [{ form: 'resilient', label: '原形' }],
              partsOfSpeech: [
                {
                  label: 'adjective',
                  synonyms: ['robust'],
                  antonyms: ['fragile'],
                  senses: [
                    {
                      definition: 'Able to recover after difficulty.',
                      definitionSourceType: 'dictionary',
                      examples: [],
                      synonyms: ['adaptable'],
                      antonyms: [],
                    },
                    {
                      definition: 'Returning to shape after bending.',
                      definitionSourceType: 'dictionary',
                      examples: [
                        {
                          text: 'The material is resilient.',
                          sourceType: 'dictionary',
                        },
                      ],
                      synonyms: [],
                      antonyms: [],
                    },
                  ],
                },
              ],
              sourceUrls: ['https://en.wiktionary.org/wiki/resilient'],
              license: { name: 'CC BY-SA 3.0' },
            },
            {
              headword: 'resilient',
              pronunciations: [],
              forms: ['resilience'],
              inflections: [{ form: 'resilience', label: '词典收录词形' }],
              partsOfSpeech: [
                {
                  label: 'noun',
                  synonyms: [],
                  antonyms: [],
                  senses: [
                    {
                      definition: 'A resilient person.',
                      definitionSourceType: 'dictionary',
                      examples: [],
                      synonyms: [],
                      antonyms: [],
                    },
                  ],
                },
              ],
              sourceUrls: [],
            },
          ],
        },
      },
    })
  })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')
  await page.getByRole('button', { name: '词典' }).last().click()
  await page.getByRole('button', { name: /IELTS.*5,038 词/ }).click()
  await expect(
    page.getByRole('navigation', { name: 'IELTS 字母索引' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'A，340 词' })).toBeVisible()
  await expect(page.getByRole('button', { name: /abandon/ })).toBeVisible()
  await page.getByRole('button', { name: '返回词典列表' }).click()
  const searchInput = page.getByRole('combobox', {
    name: '搜索英语单词或短语',
  })
  await searchInput.fill('resi')
  await expect(page.getByRole('option', { name: 'resilience' })).toBeVisible()
  await searchInput.press('Escape')
  await searchInput.fill('resilient')
  await page.getByRole('button', { name: '搜索' }).click()

  await expect(
    page.locator('.status-tag').filter({ hasText: '离线缓存' }),
  ).toBeVisible()
  await expect(page.getByText('Entry 1 / 2')).toBeVisible()
  await expect(page.getByText('Entry 2 / 2')).toBeVisible()
  await expect(page.getByText('暂无来源例句').first()).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
  await page.screenshot({
    fullPage: true,
    path: 'test-results/visual/morrowlilt-dictionary-mobile.png',
  })
})
