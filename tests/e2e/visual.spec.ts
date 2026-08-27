import { expect, test } from '@playwright/test'

test('desktop and mobile visual baselines have no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByText('服务正常')).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: 'test-results/visual/morrowlilt-desktop.png',
  })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)

  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(page.getByText('今日地道表达 · 3 条')).toBeVisible()
  await page.screenshot({
    fullPage: false,
    path: 'test-results/visual/morrowlilt-mobile-first-screen.png',
  })
  await page.screenshot({
    fullPage: true,
    path: 'test-results/visual/morrowlilt-mobile.png',
  })
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)
})

test('dark mode and reduced motion render without overflow', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByRole('button', { name: '深色' }).click()
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    window.scrollTo(0, 0)
  })
  await page.screenshot({
    fullPage: true,
    path: 'test-results/visual/morrowlilt-dark-mobile.png',
  })

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true)
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--duration-normal')
        .trim(),
    ),
  ).toBe('1ms')
})

test('360px, 768px and 200% zoom keep every core page usable', async ({
  page,
}) => {
  const pageNames = [
    '今日',
    '每日学习',
    '测试',
    '错题巩固',
    '词典',
    '结果报告',
    '设置',
  ]
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    for (const [index, pageName] of pageNames.entries()) {
      if (index > 0) await page.keyboard.press(`Alt+Digit${index + 1}`)
      await expect(page.locator('main h1:visible').first()).toBeVisible()
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
        `${pageName} overflowed at ${width}px`,
      ).toBe(true)
    }
  }

  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto('/')
  await page.evaluate(async () => {
    document.documentElement.style.zoom = '200%'
    await document.fonts.ready
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  })
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      { timeout: 5_000 },
    )
    .toBe(true)
  await page.screenshot({
    fullPage: false,
    path: 'test-results/visual/morrowlilt-200-percent-zoom.png',
  })
})
