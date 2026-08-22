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
      if (url.startsWith('/api/dictionary?')) return lookup()
      return Promise.resolve(Response.json({ data: { saved: true } }))
    }),
  )
}

describe('DictionaryExperience', () => {
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
})
