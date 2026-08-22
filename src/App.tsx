import { useEffect, useState } from 'react'
import './App.css'
import { AppShell } from './components/AppShell'
import {
  LatestReportPage,
  MistakeReviewPage,
  QuizExperience,
} from './components/QuizExperience'
import { LearningPage, SettingsPage, TodayPage } from './pages/Pages'
import { DictionaryExperience } from './components/DictionaryExperience'
import type {
  HealthState,
  PageId,
  ThemeChoice,
  TodayAction,
  TodayData,
  TodayViewState,
} from './types'
import { apiGet, apiGetRaw, apiMutation } from './lib/api'
import { healthSchema, todaySchema } from './lib/schemas'

function App() {
  const requestedPage = new URL(window.location.href).searchParams.get('view')
  const initialPage: PageId = [
    'today',
    'learning',
    'quiz',
    'report',
    'dictionary',
    'review',
    'settings',
  ].includes(requestedPage ?? '')
    ? (requestedPage as PageId)
    : 'today'
  const [activePage, setActivePage] = useState<PageId>(initialPage)
  const [health, setHealth] = useState<HealthState>('checking')
  const [todayState, setTodayState] = useState<TodayViewState>({
    status: 'loading',
  })
  const [todayAction, setTodayAction] = useState<TodayAction>()
  const [mutationMessage, setMutationMessage] = useState('')
  const [theme, setTheme] = useState<ThemeChoice>('system')

  useEffect(() => {
    const controller = new AbortController()

    async function checkHealth() {
      try {
        await apiGetRaw('/api/health', healthSchema, controller.signal)
        setHealth('ready')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setHealth('unavailable')
      }
    }

    void checkHealth()
    return () => controller.abort()
  }, [])

  const loadToday = async (signal?: AbortSignal) => {
    setTodayState({ status: 'loading' })
    try {
      const data: TodayData = await apiGet(
        '/api/today',
        todaySchema,
        signal,
        30_000,
      )
      setTodayState({ status: 'ready', data })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setTodayState({
        status: 'error',
        message: error instanceof Error ? error.message : '今日内容暂时不可用',
      })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void apiGet('/api/today', todaySchema, controller.signal, 30_000)
      .then((data) => setTodayState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setTodayState({
          status: 'error',
          message:
            error instanceof Error ? error.message : '今日内容暂时不可用',
        })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme
    } else {
      document.documentElement.dataset.theme = theme
    }
  }, [theme])

  const navigate = (page: PageId) => {
    setActivePage(page)
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#main-content')?.focus()
    })
  }

  const updateLearningState = async (action: 'learned' | 'not_learned') => {
    if (todayAction) return
    if (todayState.status !== 'ready') return
    const previous = todayState.data
    setTodayAction(action)
    setMutationMessage('正在保存学习状态…')
    setTodayState({
      status: 'ready',
      data:
        action === 'learned'
          ? {
              ...previous,
              learningState: 'settled',
              progress: {
                ...previous.progress,
                settledThroughDate: previous.today,
              },
            }
          : { ...previous, learningState: 'unsettled' },
    })
    try {
      const data: TodayData = await apiMutation(
        '/api/checkin',
        todaySchema,
        { action },
        'checkin',
      )
      setTodayState({ status: 'ready', data })
      setMutationMessage(
        action === 'learned' ? '待学包已结清。' : '已保持未学习状态。',
      )
    } catch (error) {
      setTodayState({ status: 'ready', data: previous })
      setMutationMessage(
        `${error instanceof Error ? error.message : '学习状态更新失败'} 原状态已恢复。`,
      )
    } finally {
      setTodayAction(undefined)
    }
  }

  const undoLearningState = async () => {
    if (todayAction) return
    if (todayState.status !== 'ready') return
    const previous = todayState.data
    setTodayAction('undo')
    setMutationMessage('正在撤销…')
    setTodayState({
      status: 'ready',
      data: { ...previous, learningState: 'unsettled' },
    })
    try {
      const data: TodayData = await apiMutation(
        '/api/checkin/undo',
        todaySchema,
        {},
        'checkin-undo',
      )
      setTodayState({ status: 'ready', data })
      setMutationMessage('已撤销本业务日的误触。')
    } catch (error) {
      setTodayState({ status: 'ready', data: previous })
      setMutationMessage(
        `${error instanceof Error ? error.message : '撤销失败'} 原状态已恢复。`,
      )
    } finally {
      setTodayAction(undefined)
    }
  }

  const pages: Record<PageId, React.ReactNode> = {
    today: (
      <TodayPage
        action={todayAction}
        mutationMessage={mutationMessage}
        onCheckin={(action) => void updateLearningState(action)}
        onNavigate={navigate}
        onRetry={() => void loadToday()}
        onUndo={() => void undoLearningState()}
        state={todayState}
      />
    ),
    learning: (
      <LearningPage onRetry={() => void loadToday()} state={todayState} />
    ),
    quiz: <QuizExperience onNavigate={navigate} />,
    report: <LatestReportPage onNavigate={navigate} />,
    dictionary: <DictionaryExperience />,
    review: <MistakeReviewPage onNavigate={navigate} />,
    settings: <SettingsPage onThemeChange={setTheme} theme={theme} />,
  }

  return (
    <AppShell activePage={activePage} health={health} onNavigate={navigate}>
      {pages[activePage]}
    </AppShell>
  )
}

export default App
