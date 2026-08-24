import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DictionaryExperience } from '../../src/components/DictionaryExperience'
import type { DictionaryResult } from '../../src/dictionary-types'

const result: DictionaryResult = {
  normalizedTerm: 'resilient',
  cacheStatus: 'stale',
  warningCode: 'DICTIONARY_TIMEOUT',
  requestUrl: 'https://api.dictionaryapi.dev/api/v2/entries/en/resilient',
  attribution: 'Definitions via Free Dictionary API.',
  licenses: [{ name: 'CC BY-SA 3.0' }],
  entries: [
    {
      headword: 'resilient',
      phonetic: '/rɪˈzɪliənt/',
      pronunciations: [
        {
          text: '/rɪˈzɪliənt/',
          audioUrl:
            '/api/dictionary/audio?src=https%3A%2F%2Fapi.dictionaryapi.dev%2Fmedia%2Fpronunciations%2Fen%2Fresilient-us.mp3',
          sourceUrl: 'https://source.example.invalid/audio',
          license: { name: 'BY-SA 4.0' },
        },
      ],
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
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mockHistoryAndLookup(lookup: () => Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      if (url === '/api/dictionary/history') {
        return Promise.resolve(Response.json({ data: [] }))
      }
      if (url === '/api/dictionary/exam-lists') {
        return Promise.resolve(
          Response.json({
            data: {
              lists: [
                {
                  slug: 'cet4',
                  name: '大学英语四级备考词典',
                  shortName: 'CET-4',
                  description: '四级常见词汇。',
                  source: {
                    name: 'ECDICT',
                    url: 'https://github.com/skywind3000/ECDICT',
                    license: 'MIT',
                  },
                  entryCount: 2,
                  letterCounts: { A: 2 },
                  updatedAt: '2026-08-24T00:00:00.000Z',
                },
              ],
            },
          }),
        )
      }
      if (url.startsWith('/api/dictionary/exam-lists/cet4?')) {
        return Promise.resolve(
          Response.json({
            data: {
              list: {
                slug: 'cet4',
                name: '大学英语四级备考词典',
                shortName: 'CET-4',
                description: '四级常见词汇。',
                source: {
                  name: 'ECDICT',
                  url: 'https://github.com/skywind3000/ECDICT',
                  license: 'MIT',
                },
                entryCount: 2,
                letterCounts: { A: 2 },
                updatedAt: '2026-08-24T00:00:00.000Z',
              },
              letter: 'A',
              letterEntryCount: 2,
              words: [
                { word: 'abandon', normalizedWord: 'abandon', rank: 1 },
                { word: 'ability', normalizedWord: 'ability', rank: 2 },
              ],
              hasMore: false,
            },
          }),
        )
      }
      if (url.startsWith('/api/dictionary?')) return lookup()
      return Promise.resolve(Response.json({ data: { saved: true } }))
    }),
  )
}

describe('DictionaryExperience', () => {
  it('browses a selected exam dictionary by A–Z and opens a full entry', async () => {
    mockHistoryAndLookup(() =>
      Promise.resolve(
        Response.json({
          data: { ...result, normalizedTerm: 'abandon' },
        }),
      ),
    )
    render(<DictionaryExperience />)

    fireEvent.click(
      await screen.findByRole('button', { name: /CET-4.*大学英语四级/ }),
    )
    expect(
      await screen.findByRole('navigation', { name: 'CET-4 字母索引' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A，2 词' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(await screen.findByRole('button', { name: /abandon/ }))
    expect(
      await screen.findByLabelText('abandon 的词典结果'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('搜索英语单词或短语')).toHaveValue('abandon')
  })

  it('shows loading, all entries/senses, missing-example and stale-cache states', async () => {
    let resolveLookup: ((value: Response) => void) | undefined
    mockHistoryAndLookup(
      () =>
        new Promise<Response>((resolve) => {
          resolveLookup = resolve
        }),
    )
    render(<DictionaryExperience />)

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(screen.getByRole('button', { name: '查询中…' })).toBeDisabled()
    resolveLookup?.(Response.json({ data: result }))

    expect(await screen.findByText('离线缓存')).toBeInTheDocument()
    expect(screen.getAllByText('resilient')).toHaveLength(3)
    expect(
      screen.getByRole('heading', { name: 'adjective · 形容词' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'noun · 名词' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('暂无来源例句')).toHaveLength(2)
    expect(screen.getByText('原形')).toBeInTheDocument()
    expect(screen.getByText('词典收录词形')).toBeInTheDocument()
    expect(screen.getByLabelText('resilient 发音 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '播放发音' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '加入收藏' }))
    expect(await screen.findByText('已加入收藏。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加入复习队列' }))
    expect(await screen.findByText('已加入复习队列。')).toBeInTheDocument()
  })

  it('shows an explicit empty state for a Provider 404', async () => {
    mockHistoryAndLookup(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: 'DICTIONARY_NOT_FOUND',
              message: 'No dictionary entry was found',
            },
          },
          { status: 404 },
        ),
      ),
    )
    render(<DictionaryExperience />)
    fireEvent.submit(
      screen.getByRole('button', { name: '搜索' }).closest('form')!,
    )

    expect(
      await screen.findByRole('heading', { name: '暂无结果' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/没有找到可用词条/)).toBeInTheDocument()
  })

  it('retains the query and recovers after a transient error', async () => {
    let calls = 0
    mockHistoryAndLookup(() => {
      calls += 1
      return Promise.resolve(
        calls === 1
          ? Response.json(
              { error: { code: 'DICTIONARY_TIMEOUT', message: '查询超时' } },
              { status: 504 },
            )
          : Response.json({ data: { ...result, cacheStatus: 'fresh' } }),
      )
    })
    render(<DictionaryExperience />)
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('查询超时')
    expect(screen.getByLabelText('搜索英语单词或短语')).toHaveValue('resilient')

    fireEvent.click(screen.getByRole('button', { name: '重试查询' }))
    expect(await screen.findByText('D1 缓存')).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('uses the device English voice when source audio cannot play', async () => {
    mockHistoryAndLookup(() => Promise.resolve(Response.json({ data: result })))
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('Unsupported source', 'NotSupportedError'),
    )
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const speak = vi.fn()
    const cancel = vi.fn()
    vi.stubGlobal('speechSynthesis', { cancel, speak })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = ''
        text: string
        constructor(text: string) {
          this.text = text
        }
      },
    )

    render(<DictionaryExperience />)
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    const playButton = await screen.findByRole('button', { name: '播放发音' })
    fireEvent.click(playButton)

    expect(
      await screen.findByText('来源音频不可用，已改用设备英语发音。'),
    ).toBeInTheDocument()
    expect(cancel).toHaveBeenCalledOnce()
    expect(speak).toHaveBeenCalledOnce()
    expect(speak.mock.calls[0][0]).toMatchObject({
      lang: 'en-US',
      text: 'resilient',
    })
  })
})
