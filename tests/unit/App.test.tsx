import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import type { TodayData } from '../../src/types'

function getShanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(now)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

function addUtcDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

const fixtureToday = getShanghaiDate()
const fixturePreviousDate = addUtcDays(fixtureToday, -1)

function createTodayData(
  today = fixtureToday,
  settledThroughDate = fixturePreviousDate,
): TodayData {
  const content = {
    id: `today-content-${today}`,
    contentDate: today,
    payload: {
      schemaVersion: 2 as const,
      contentDate: today,
      difficulty: 'C1' as const,
      theme: 'learning' as const,
      originType: 'original' as const,
      generatorVersion: 'test-v2',
      sentence: {
        english: 'Small steps compound into confident progress.',
        chinese: '微小的步伐会累积成自信的进步。',
        grammarNotes: ['compound 在此作动词。'],
        usageNotes: ['适合描述长期积累产生的结果。'],
        collocations: [
          { expression: 'compound progress', meaning: '累积进步' },
          { expression: 'confident progress', meaning: '有信心的进展' },
        ],
        alternatives: [
          { expression: 'gradual gains', note: '强调渐进收益。' },
          { expression: 'steady improvement', note: '强调稳定改善。' },
        ],
        microExercise: 'Write one sentence with compound.',
      },
      vocabulary: [
        {
          kind: 'word' as const,
          term: 'resilient',
          partOfSpeech: '形容词',
          meaningGroups: [
            {
              partOfSpeech: 'adj.',
              meaningsZh: ['有韧性的', '能迅速恢复的'],
            },
            {
              partOfSpeech: 'n.',
              meaningsZh: ['恢复力强的人或事物'],
            },
          ],
          definition: 'able to recover from difficulty',
          definitionZh: '有韧性的；能够从困难中恢复的',
          example: 'A resilient learner returns after a difficult day.',
          exampleZh: '有韧性的学习者会在艰难的一天后重新开始。',
          usageNote: '常用于人、群体或系统。',
        },
      ],
      practicalExpressions: Array.from({ length: 3 }, (_, index) => ({
        expression:
          index === 0 ? 'Fair enough.' : `Useful phrase ${index + 1}.`,
        expressionType: 'response' as const,
        partOfSpeech: '回应语',
        chineseMeanings: ['倒也在理', '行吧，我理解'],
        coreMeaning: '表示理解对方经过解释后成立的理由。',
        usageNotes: ['比 OK 更有态度。'],
        scenarios: [
          {
            label: '朋友聊天',
            description: '对方给出了合理解释。',
            example: 'I need some rest. — Fair enough, take it easy.',
            exampleZh: '我需要休息。——行吧，好好放松。',
          },
          {
            label: '游戏讨论',
            description: '认可队友的战术理由。',
            example: 'We need a safer route. — Fair enough, lead the way.',
            exampleZh: '我们要走安全点的路线。——有道理，你带路吧。',
          },
        ],
        pitfalls: ['不要逐字翻成足够公平。'],
        alternatives: [
          { expression: 'I see your point.', nuance: '更明确地理解观点。' },
        ],
        ieltsUse: '正式表达可换成 this is a valid point。',
      })),
      topic: {
        kind: 'speaking' as const,
        prompt: '描述一个帮助你坚持学习的习惯。',
        preparationPoints: ['说明习惯', '举例', '解释效果'],
      },
    },
    source: 'seed' as const,
    attribution: '内置种子内容',
    provider: 'test-provider',
    fingerprint: 'fixture-fingerprint',
    generatorVersion: 'test-v2',
    createdAt: `${today}T00:00:00.000Z`,
  }
  return {
    profile: {
      id: 'default',
      timeZone: 'Asia/Shanghai',
      learningTrack: 'academic',
      createdDate: today,
    },
    progress: {
      profileId: 'default',
      settledThroughDate,
      version: 0,
    },
    today,
    learningState: 'unsettled',
    pendingDayCount: 1,
    totalItemCount: 3,
    days: [content],
    todayContent: content,
  }
}

let today: TodayData

beforeEach(() => {
  today = createTodayData()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url === '/api/health') {
        return Promise.resolve(Response.json({ status: 'ok', service: 'test' }))
      }
      if (url === '/api/quiz/sessions') {
        return Promise.resolve(Response.json({ data: null }))
      }
      if (url === '/api/quiz/reports/latest') {
        return Promise.resolve(Response.json({ data: null }))
      }
      if (url === '/api/mistakes') {
        return Promise.resolve(Response.json({ data: [] }))
      }
      if (url === '/api/dictionary/history') {
        return Promise.resolve(Response.json({ data: [] }))
      }
      if (url === '/api/dictionary/favorites') {
        return Promise.resolve(Response.json({ data: [] }))
      }
      if (url === '/api/settings') {
        return Promise.resolve(
          Response.json({ data: { learningTrack: 'academic' } }),
        )
      }
      if (url === '/api/checkin') {
        today = {
          ...today,
          learningState: 'settled',
          pendingDayCount: 0,
          days: [],
          progress: {
            ...today.progress,
            settledThroughDate: today.today,
            version: 1,
          },
        }
      } else if (url === '/api/checkin/undo') {
        today = createTodayData()
        today.progress.version = 2
      }
      return Promise.resolve(Response.json({ data: today }))
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('MorrowLilt application skeleton', () => {
  it('shows the complete first-screen learning state', async () => {
    render(<App />)

    expect(
      await screen.findByRole('heading', {
        name: '上午好，今天只做最重要的一包。',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('待学天数')).toBeInTheDocument()
    expect(screen.getAllByText('今日学习包').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', { name: '今日高阶例句' }),
    ).toBeInTheDocument()
    expect(screen.getByText('语法与语用')).toBeInTheDocument()
    expect(screen.getByText('常用搭配')).toBeInTheDocument()
    expect(screen.getByText('替换表达')).toBeInTheDocument()
    expect(screen.getByText('adj.')).toBeInTheDocument()
    expect(screen.getByText('有韧性的；能迅速恢复的；')).toBeInTheDocument()
    expect(screen.getByText('n.')).toBeInTheDocument()
    expect(screen.queryByText('形容词 adjective')).not.toBeInTheDocument()
    expect(
      screen.getAllByText('当前浏览器未提供系统发音。').length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText('今天的 3 条地道表达').length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('口语练习')).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: '整个待学包已学习' })[0],
    ).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText('服务正常')).toBeInTheDocument()
  })

  it('announces learned and restored-unlearned states from API responses', async () => {
    render(<App />)

    await screen.findByRole('heading', {
      name: '上午好，今天只做最重要的一包。',
    })
    fireEvent.click(
      screen.getAllByRole('button', { name: '整个待学包已学习' })[0],
    )
    expect(
      screen.getByRole('alertdialog', { name: '确认结清整个待学包？' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认已学习' }))
    expect(
      await screen.findByText(
        '已结清截至今天的整个待学包；同一业务日内可以撤销。',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '撤销，恢复未学习' }))
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))
    expect(
      await screen.findByText(
        '当前为未学习状态。今天不完成时，全部内容明天仍会保留。',
      ),
    ).toBeInTheDocument()
  })

  it('refreshes a settled page when the profile business date changes', async () => {
    const currentBusinessDate = fixtureToday
    const staleDate = fixturePreviousDate
    today = createTodayData(staleDate, staleDate)
    today = {
      ...today,
      days: [],
      learningState: 'settled',
      pendingDayCount: 0,
      totalItemCount: 0,
    }
    render(<App />)
    await screen.findByText(
      '已结清截至今天的整个待学包；同一业务日内可以撤销。',
    )

    today = createTodayData(currentBusinessDate, staleDate)
    window.dispatchEvent(new Event('focus'))

    expect(
      await screen.findByText(
        '当前为未学习状态。今天不完成时，全部内容明天仍会保留。',
      ),
    ).toBeInTheDocument()
    expect(
      vi.mocked(fetch).mock.calls.filter(([input]) => input === '/api/today'),
    ).toHaveLength(2)
  })

  it.each([
    ['每日学习', '每日学习'],
    ['测试', '创建一组新的高阶英语测试'],
    ['错题巩固', '保留历史，逐步提高掌握度'],
    ['词典', '词典'],
    ['结果报告', '还没有测试报告'],
    ['设置', '设置'],
  ])('navigates to the %s page skeleton', async (buttonName, headingName) => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: buttonName })[0])
    expect(
      await screen.findByRole('heading', { level: 1, name: headingName }),
    ).toBeInTheDocument()
  })

  it('keeps test and review preferences out of general settings', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: '设置' })[0])
    await screen.findByRole('heading', { level: 1, name: '设置' })
    expect(screen.queryByText('测试与巩固')).not.toBeInTheDocument()
  })

  it('shows a recoverable error state when today data cannot load', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      return Promise.resolve(
        url === '/api/health'
          ? Response.json({ status: 'ok', service: 'test' })
          : Response.json(
              { error: { message: '数据库暂时不可用' } },
              { status: 503 },
            ),
      )
    })
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: '今日学习包暂时无法显示' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('数据库暂时不可用')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })
})
