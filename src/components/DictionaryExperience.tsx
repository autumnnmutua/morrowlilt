import { useEffect, useRef, useState } from 'react'
import type {
  DictionaryGeneratedField,
  DictionaryHistoryItem,
  DictionaryLicense,
  DictionaryResult,
  DictionarySuggestions,
} from '../dictionary-types'
import { ApiError, apiGet, apiMutation } from '../lib/api'
import {
  dictionaryHistorySchema,
  dictionaryResultSchema,
  dictionarySuggestionsSchema,
  unknownObjectSchema,
} from '../lib/schemas'
import { ExamDictionaryBrowser } from './ExamDictionaryBrowser'

function SourceLicense({ license }: { license?: DictionaryLicense }) {
  if (!license) return <span>暂无许可信息</span>
  return license.url ? (
    <a href={license.url} rel="noreferrer" target="_blank">
      {license.name}
    </a>
  ) : (
    <span>{license.name}</span>
  )
}

function GeneratedField({ field }: { field: DictionaryGeneratedField }) {
  const labels = {
    translated: '中文释义',
    ai_assisted: '学习补充',
    original: '学习补充',
  }
  return (
    <div className="generated-field">
      <strong>{labels[field.originType]}</strong>
      <p>{field.text}</p>
    </div>
  )
}

function TermList({ label, terms }: { label: string; terms: string[] }) {
  if (terms.length === 0) return null
  return (
    <div className="dictionary-term-list">
      <strong>{label}</strong>
      <span>{terms.join(' · ')}</span>
    </div>
  )
}

function PronunciationPlayer({
  audioUrl,
  headword,
  index,
}: {
  audioUrl: string
  headword: string
  index: number
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playbackStatus, setPlaybackStatus] = useState('')

  const speakWithDeviceVoice = () => {
    if (!(
      'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
    )) {
      setPlaybackStatus('当前设备无法播放该发音，请稍后重试。')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(headword)
    utterance.lang = 'en-US'
    window.speechSynthesis.speak(utterance)
    setPlaybackStatus('来源音频不可用，已改用设备英语发音。')
  }

  const play = async () => {
    setPlaybackStatus('正在加载发音…')
    try {
      if (!audio.current) throw new Error('Audio element unavailable')
      audio.current.currentTime = 0
      let timeoutId: number | undefined
      try {
        await Promise.race([
          audio.current.play(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error('Pronunciation audio timed out')),
              6_000,
            )
          }),
        ])
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      }
      setPlaybackStatus('正在播放')
    } catch {
      audio.current?.pause()
      speakWithDeviceVoice()
    }
  }

  return (
    <div className="pronunciation-player">
      <audio
        aria-label={`${headword} 发音 ${index + 1}`}
        onEnded={() => setPlaybackStatus('播放完成')}
        onError={() =>
          setPlaybackStatus('来源音频暂不可用，点击后将使用设备英语发音。')
        }
        preload="metadata"
        ref={audio}
        src={audioUrl}
      />
      <button
        className="button button--secondary"
        onClick={() => void play()}
        type="button"
      >
        播放发音
      </button>
      <span aria-live="polite" className="field-note" role="status">
        {playbackStatus}
      </span>
    </div>
  )
}

function partOfSpeechLabel(label: string): string {
  const normalized = label.toLowerCase()
  const chinese: Record<string, string> = {
    noun: '名词',
    verb: '动词',
    adjective: '形容词',
    adverb: '副词',
    pronoun: '代词',
    preposition: '介词',
    conjunction: '连词',
    interjection: '感叹词',
    determiner: '限定词',
    exclamation: '感叹语',
    abbreviation: '缩写',
  }
  return chinese[normalized] ? `${label} · ${chinese[normalized]}` : label
}

export function DictionaryExperience() {
  const [query, setQuery] = useState('resilient')
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'enriching' | 'ready' | 'empty' | 'error'
  >('idle')
  const [result, setResult] = useState<DictionaryResult>()
  const [history, setHistory] = useState<DictionaryHistoryItem[]>([])
  const [message, setMessage] = useState(
    '输入英语单词或短语；查询只会发送到本站 Worker。',
  )
  const [saveMessage, setSaveMessage] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const requestController = useRef<AbortController | undefined>(undefined)
  const suggestionController = useRef<AbortController | undefined>(undefined)

  const loadHistory = async () => {
    try {
      setHistory(
        await apiGet('/api/dictionary/history', dictionaryHistorySchema),
      )
    } catch {
      // History is supplementary; search remains usable when it is unavailable.
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void apiGet(
      '/api/dictionary/history',
      dictionaryHistorySchema,
      controller.signal,
    )
      .then(setHistory)
      .catch(() => {
        // History is supplementary; search remains usable when unavailable.
      })
    return () => {
      controller.abort()
      requestController.current?.abort()
      suggestionController.current?.abort()
    }
  }, [])

  useEffect(() => {
    suggestionController.current?.abort()
    const normalized = query.trim()
    if (!/^[A-Za-z][A-Za-z' -]{0,31}$/.test(normalized)) {
      return
    }
    const controller = new AbortController()
    suggestionController.current = controller
    const timer = window.setTimeout(() => {
      void apiGet(
        `/api/dictionary/suggestions?q=${encodeURIComponent(normalized)}`,
        dictionarySuggestionsSchema,
        controller.signal,
        6_000,
      )
        .then((data: DictionarySuggestions) => {
          setSuggestions(data.suggestions)
          setSuggestionsOpen(data.suggestions.length > 0)
          setActiveSuggestion(-1)
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([])
            setSuggestionsOpen(false)
          }
        })
    }, 220)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const search = async (term = query) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setStatus('loading')
    setSaveMessage('')
    setMessage('正在通过本站服务查询并检查 D1 缓存…')
    let preview: DictionaryResult | undefined
    const encodedTerm = encodeURIComponent(term)
    try {
      preview = await apiGet(
        `/api/dictionary?term=${encodedTerm}&mode=quick`,
        dictionaryResultSchema,
        controller.signal,
        4_000,
      )
      setResult(preview)
      setQuery(preview.normalizedTerm)
      setSuggestionsOpen(false)
      setStatus('enriching')
      setMessage('已显示本地中文词条，正在补充在线释义、发音和例句…')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      // A local preview is optional; the complete Provider lookup continues.
    }
    try {
      const data: DictionaryResult = await apiGet(
        `/api/dictionary?term=${encodedTerm}`,
        dictionaryResultSchema,
        controller.signal,
        25_000,
      )
      setResult(data)
      setQuery(data.normalizedTerm)
      setSuggestionsOpen(false)
      setStatus(data.entries.length ? 'ready' : 'empty')
      setMessage(
        data.cacheStatus === 'stale'
          ? '当前显示最近一次保存的词条。'
          : '词条已加载。',
      )
      void loadHistory()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (preview) {
        setStatus('ready')
        setMessage('已显示本地完整中文词条；在线发音与例句暂未更新。')
        void loadHistory()
        return
      }
      if (error instanceof ApiError && error.code === 'DICTIONARY_NOT_FOUND') {
        setResult(undefined)
        setStatus('empty')
        setMessage('没有找到对应词条。请检查拼写或尝试更短的表达。')
        void loadHistory()
        return
      }
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '词典查询失败')
    }
  }

  const save = async (destination: 'favorites' | 'review-queue') => {
    if (!result) return
    setSaveMessage('正在保存…')
    try {
      await apiMutation(
        `/api/dictionary/${destination}`,
        unknownObjectSchema,
        { term: result.normalizedTerm },
        `dictionary-${destination}`,
      )
      setSaveMessage(
        destination === 'favorites' ? '已加入收藏。' : '已加入复习队列。',
      )
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : '保存失败，请重试。',
      )
    }
  }

  return (
    <div className="page page--reading page--dictionary">
      <header className="page-heading">
        <p className="eyebrow">查词与例句</p>
        <h1>词典</h1>
        <p>搜索英语单词或短语，查看完整词性、释义和例句。</p>
      </header>
      <form
        className="dictionary-search"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <label htmlFor="dictionary-query">搜索英语单词或短语</label>
        <div>
          <div className="dictionary-combobox">
            <input
              aria-activedescendant={
                activeSuggestion >= 0
                  ? `dictionary-suggestion-${activeSuggestion}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls="dictionary-suggestions"
              aria-expanded={suggestionsOpen}
              autoCapitalize="none"
              autoComplete="off"
              id="dictionary-query"
              maxLength={64}
              onBlur={() => {
                window.setTimeout(() => setSuggestionsOpen(false), 100)
              }}
              onChange={(event) => {
                const value = event.target.value
                setQuery(value)
                if (!/^[A-Za-z][A-Za-z' -]{0,31}$/.test(value.trim())) {
                  setSuggestions([])
                  setSuggestionsOpen(false)
                  setActiveSuggestion(-1)
                }
              }}
              onFocus={() => setSuggestionsOpen(suggestions.length > 0)}
              onKeyDown={(event) => {
                if (!suggestionsOpen || suggestions.length === 0) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActiveSuggestion((current) =>
                    current >= suggestions.length - 1 ? 0 : current + 1,
                  )
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveSuggestion((current) =>
                    current <= 0 ? suggestions.length - 1 : current - 1,
                  )
                } else if (event.key === 'Enter' && activeSuggestion >= 0) {
                  event.preventDefault()
                  const selected = suggestions[activeSuggestion]
                  setQuery(selected)
                  setSuggestionsOpen(false)
                  void search(selected)
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setSuggestionsOpen(false)
                  setActiveSuggestion(-1)
                }
              }}
              pattern="[A-Za-z' -]+"
              required
              role="combobox"
              spellCheck="false"
              type="search"
              value={query}
            />
            {suggestionsOpen && (
              <ul
                aria-label="可能要查的词"
                className="dictionary-suggestions"
                id="dictionary-suggestions"
                role="listbox"
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    aria-selected={activeSuggestion === index}
                    id={`dictionary-suggestion-${index}`}
                    key={suggestion}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      setQuery(suggestion)
                      setSuggestionsOpen(false)
                      void search(suggestion)
                    }}
                    role="option"
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className="button button--primary"
            disabled={status === 'loading' || status === 'enriching'}
            type="submit"
          >
            {status === 'loading'
              ? '查询中…'
              : status === 'enriching'
                ? '补充中…'
                : '搜索'}
          </button>
        </div>
      </form>
      {history.length > 0 && (
        <section
          aria-labelledby="dictionary-history-title"
          className="dictionary-history"
        >
          <div className="dictionary-history__heading">
            <h2 id="dictionary-history-title">最近搜索</h2>
            <span>{history.length} 个词条</span>
          </div>
          <nav aria-label="最近搜索词条" className="dictionary-history__list">
            {history.map((item) => (
              <button
                key={item.term}
                onClick={() => {
                  setQuery(item.term)
                  void search(item.term)
                }}
                type="button"
              >
                {item.term}
              </button>
            ))}
          </nav>
        </section>
      )}
      <ExamDictionaryBrowser
        onSelectWord={(word) => {
          setQuery(word)
          void search(word)
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>('#dictionary-lookup-status')
              ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
          })
        }}
      />
      <p
        aria-live="polite"
        className={`answer-status${status === 'error' ? ' answer-status--error' : ''}`}
        id="dictionary-lookup-status"
        role={status === 'error' ? 'alert' : 'status'}
      >
        {message}
      </p>
      {status === 'error' && (
        <button
          className="button button--secondary"
          onClick={() => void search()}
          type="button"
        >
          重试查询
        </button>
      )}
      {status === 'empty' && (
        <section className="dictionary-empty">
          <h2>暂无结果</h2>
          <p>没有找到可用词条，请检查拼写或尝试其他表达。</p>
        </section>
      )}
      {(status === 'ready' || status === 'enriching') && result && (
        <section aria-label={`${result.normalizedTerm} 的词典结果`}>
          <div className="dictionary-result-toolbar">
            <span
              className={`status-tag status-tag--${result.cacheStatus === 'stale' ? 'warning' : 'info'}`}
            >
              <span aria-hidden="true">
                {result.cacheStatus === 'stale' ? '!' : 'i'}
              </span>
              {result.cacheStatus === 'stale'
                ? '离线缓存'
                : result.cacheStatus === 'fresh'
                  ? 'D1 缓存'
                  : '在线更新'}
            </span>
            <div className="button-row dictionary-actions">
              <button
                className="button button--secondary"
                onClick={() => void save('favorites')}
                type="button"
              >
                加入收藏
              </button>
              <button
                className="button button--primary"
                onClick={() => void save('review-queue')}
                type="button"
              >
                加入复习队列
              </button>
            </div>
          </div>
          <p aria-live="polite" className="field-note" role="status">
            {saveMessage}
          </p>
          {result.entries.map((entry, entryIndex) => (
            <article
              className="dictionary-result dictionary-entry"
              key={`${entry.headword}-${entryIndex}`}
            >
              <div className="dictionary-head">
                <div>
                  <p className="section-kicker">
                    Entry {entryIndex + 1} / {result.entries.length}
                  </p>
                  <h2>{entry.headword}</h2>
                  {entry.phonetic && (
                    <p className="phonetic">{entry.phonetic}</p>
                  )}
                  {entry.chineseSummary && (
                    <p className="dictionary-chinese-summary">
                      <strong>中文释义</strong>
                      <span>{entry.chineseSummary}</span>
                    </p>
                  )}
                </div>
                <span className="status-tag status-tag--neutral">
                  <span aria-hidden="true">—</span>
                  <SourceLicense license={entry.license} />
                </span>
              </div>
              <section
                className="dictionary-metadata"
                aria-label={`${entry.headword} Entry ${entryIndex + 1} 发音与词形`}
              >
                <h3>发音与词形</h3>
                {entry.pronunciations.length ? (
                  <div className="pronunciation-list">
                    {entry.pronunciations.map((item, index) => (
                      <div key={`${item.text ?? 'audio'}-${index}`}>
                        <span>{item.text ?? '发音音频'}</span>
                        {item.audioUrl && (
                          <PronunciationPlayer
                            audioUrl={item.audioUrl}
                            headword={entry.headword}
                            index={index}
                          />
                        )}
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            音频来源
                          </a>
                        )}
                        {item.license && (
                          <SourceLicense license={item.license} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>暂无发音。</p>
                )}
                <p>
                  <strong>词形与时态：</strong>
                </p>
                {entry.inflections.length ? (
                  <dl className="dictionary-inflections">
                    {entry.inflections.map((item) => (
                      <div key={`${item.form}-${item.label}`}>
                        <dt>{item.label}</dt>
                        <dd>{item.form}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>暂无其他词形</p>
                )}
                {entry.origin && (
                  <p>
                    <strong>词源：</strong>
                    {entry.origin}
                  </p>
                )}
              </section>
              {entry.partsOfSpeech.map((part, partIndex) => (
                <section
                  className="part-of-speech"
                  key={`${part.label}-${partIndex}`}
                >
                  <h3>{partOfSpeechLabel(part.label)}</h3>
                  <TermList label="同义词" terms={part.synonyms} />
                  <TermList label="反义词" terms={part.antonyms} />
                  <ol>
                    {part.senses.map((sense, senseIndex) => (
                      <li key={`${sense.definition}-${senseIndex}`}>
                        <p>{sense.definition}</p>
                        {sense.translatedDefinition && (
                          <GeneratedField field={sense.translatedDefinition} />
                        )}
                        {sense.examples.length ? (
                          sense.examples.map((example, exampleIndex) => (
                            <blockquote key={`${example.text}-${exampleIndex}`}>
                              {example.text}
                              <span>词典例句</span>
                              {example.translation && (
                                <GeneratedField field={example.translation} />
                              )}
                            </blockquote>
                          ))
                        ) : (
                          <p className="missing-example">暂无来源例句</p>
                        )}
                        <TermList label="同义词" terms={sense.synonyms} />
                        <TermList label="反义词" terms={sense.antonyms} />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              <footer>
                <p>
                  <strong>词条来源：</strong>{' '}
                  {entry.sourceUrls.length
                    ? entry.sourceUrls.map((url, index) => (
                        <span key={url}>
                          {index > 0 ? ' · ' : ''}
                          <a href={url} rel="noreferrer" target="_blank">
                            来源 {index + 1}
                          </a>
                        </span>
                      ))
                    : '暂无来源链接'}
                </p>
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
