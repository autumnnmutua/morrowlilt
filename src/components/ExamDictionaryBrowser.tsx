import { useEffect, useRef, useState } from 'react'
import type {
  ExamDictionaryCatalog,
  ExamDictionaryList,
  ExamDictionaryPage,
} from '../dictionary-types'
import { apiGet } from '../lib/api'
import {
  examDictionaryCatalogSchema,
  examDictionaryPageSchema,
} from '../lib/schemas'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type LoadState = 'loading' | 'ready' | 'empty' | 'error'

export function ExamDictionaryBrowser({
  onSelectWord,
}: {
  onSelectWord: (word: string) => void
}) {
  const [catalog, setCatalog] = useState<ExamDictionaryCatalog>()
  const [catalogState, setCatalogState] = useState<LoadState>('loading')
  const [selected, setSelected] = useState<ExamDictionaryList>()
  const [letter, setLetter] = useState('A')
  const [page, setPage] = useState<ExamDictionaryPage>()
  const [pageState, setPageState] = useState<LoadState>('empty')
  const [message, setMessage] = useState('正在加载考试词典…')
  const requestController = useRef<AbortController | undefined>(undefined)

  const loadCatalog = async (signal?: AbortSignal) => {
    try {
      const data = await apiGet(
        '/api/dictionary/exam-lists',
        examDictionaryCatalogSchema,
        signal,
        8_000,
      )
      setCatalog(data)
      setCatalogState(data.lists.length ? 'ready' : 'empty')
      setMessage(
        data.lists.length
          ? '选择一个词典，再按 A–Z 浏览。'
          : '暂无可用考试词典。',
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setCatalogState('error')
      setMessage(error instanceof Error ? error.message : '考试词典加载失败')
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(
      () => void loadCatalog(controller.signal),
      0,
    )
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      requestController.current?.abort()
    }
  }, [])

  const loadPage = async (
    dictionary: ExamDictionaryList,
    nextLetter: string,
    cursor?: string,
  ) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setPageState('loading')
    setMessage(
      cursor
        ? `正在继续加载 ${dictionary.shortName} ${nextLetter}…`
        : `正在加载 ${dictionary.shortName} ${nextLetter}…`,
    )
    const params = new URLSearchParams({ letter: nextLetter, limit: '50' })
    if (cursor) params.set('cursor', cursor)
    try {
      const data = await apiGet(
        `/api/dictionary/exam-lists/${dictionary.slug}?${params.toString()}`,
        examDictionaryPageSchema,
        controller.signal,
        8_000,
      )
      setPage((current) =>
        cursor && current?.letter === data.letter
          ? { ...data, words: [...current.words, ...data.words] }
          : data,
      )
      setPageState(data.words.length || cursor ? 'ready' : 'empty')
      setMessage(
        data.words.length
          ? `${dictionary.shortName} · ${nextLetter} 共 ${data.letterEntryCount.toLocaleString('zh-CN')} 词，点击任一词查看完整词性、中文释义和词形。`
          : `${dictionary.shortName} 暂无 ${nextLetter} 开头的词。`,
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPageState('error')
      setMessage(error instanceof Error ? error.message : '词表加载失败')
    }
  }

  const openDictionary = (dictionary: ExamDictionaryList) => {
    const firstLetter =
      alphabet.find((item) => (dictionary.letterCounts[item] ?? 0) > 0) ?? 'A'
    setSelected(dictionary)
    setLetter(firstLetter)
    setPage(undefined)
    void loadPage(dictionary, firstLetter)
  }

  if (selected) {
    return (
      <section
        aria-labelledby="exam-dictionary-title"
        className="exam-dictionary"
      >
        <div className="exam-dictionary__heading">
          <div>
            <p className="section-kicker">考试词典</p>
            <h2 id="exam-dictionary-title">{selected.name}</h2>
            <p>{selected.description}</p>
          </div>
          <button
            className="button button--secondary"
            onClick={() => {
              requestController.current?.abort()
              setSelected(undefined)
              setPage(undefined)
              setMessage('选择一个词典，再按 A–Z 浏览。')
            }}
            type="button"
          >
            返回词典列表
          </button>
        </div>
        <nav
          aria-label={`${selected.shortName} 字母索引`}
          className="alphabet-index"
        >
          {alphabet.map((item) => {
            const count = selected.letterCounts[item] ?? 0
            return (
              <button
                aria-label={`${item}，${count.toLocaleString('zh-CN')} 词`}
                aria-pressed={letter === item}
                disabled={count === 0}
                key={item}
                onClick={() => {
                  setLetter(item)
                  setPage(undefined)
                  void loadPage(selected, item)
                }}
                type="button"
              >
                <span>{item}</span>
                <small>{count}</small>
              </button>
            )
          })}
        </nav>
        <p
          aria-live="polite"
          className={`answer-status${pageState === 'error' ? ' answer-status--error' : ''}`}
          role={pageState === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
        {pageState === 'loading' && !page && (
          <div
            aria-hidden="true"
            className="exam-word-grid exam-word-grid--loading"
          >
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        )}
        {pageState === 'error' && (
          <button
            className="button button--secondary"
            onClick={() => void loadPage(selected, letter)}
            type="button"
          >
            重试加载
          </button>
        )}
        {page && page.words.length > 0 && (
          <>
            <ol className="exam-word-grid" start={1}>
              {page.words.map((item) => (
                <li key={item.normalizedWord}>
                  <button
                    onClick={() => onSelectWord(item.normalizedWord)}
                    type="button"
                  >
                    <span>{item.word}</span>
                    <small>查看完整词条</small>
                  </button>
                </li>
              ))}
            </ol>
            {page.hasMore && page.nextCursor && (
              <button
                className="button button--secondary exam-word-more"
                disabled={pageState === 'loading'}
                onClick={() => void loadPage(selected, letter, page.nextCursor)}
                type="button"
              >
                {pageState === 'loading' ? '加载中…' : '继续加载'}
              </button>
            )}
          </>
        )}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="exam-dictionary-title"
      className="exam-dictionary"
    >
      <div className="exam-dictionary__heading">
        <div>
          <p className="section-kicker">按考试浏览</p>
          <h2 id="exam-dictionary-title">考试词典</h2>
          <p>选中词典后可按 A–Z 顺序浏览，点击词汇查看完整词条。</p>
        </div>
      </div>
      <p
        aria-live="polite"
        className={`answer-status${catalogState === 'error' ? ' answer-status--error' : ''}`}
        role={catalogState === 'error' ? 'alert' : 'status'}
      >
        {message}
      </p>
      {catalogState === 'error' && (
        <button
          className="button button--secondary"
          onClick={() => {
            setCatalogState('loading')
            setMessage('正在加载考试词典…')
            void loadCatalog()
          }}
          type="button"
        >
          重试加载
        </button>
      )}
      {catalogState === 'loading' && (
        <div
          aria-hidden="true"
          className="exam-dictionary-grid exam-dictionary-grid--loading"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      )}
      {catalogState === 'ready' && catalog && (
        <div className="exam-dictionary-grid">
          {catalog.lists.map((dictionary) => (
            <button
              disabled={dictionary.entryCount === 0}
              key={dictionary.slug}
              onClick={() => openDictionary(dictionary)}
              type="button"
            >
              <strong>{dictionary.shortName}</strong>
              <span>{dictionary.name}</span>
              <small>
                {dictionary.entryCount > 0
                  ? `${dictionary.entryCount.toLocaleString('zh-CN')} 词 · A–Z 索引`
                  : '数据准备中'}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
