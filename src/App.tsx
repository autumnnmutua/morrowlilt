import { lazy, Suspense, useEffect, useState } from 'react'
import './App.css'
import { AppShell } from './components/AppShell'
import { LearningPage, SettingsPage, TodayPage } from './pages/Pages'
import type {
  HealthState,
  PageId,
  ThemeChoice,
  TodayAction,
  TodayData,
  TodayViewState,
} from './types'
import { apiGet, apiMutation } from './lib/api'
import { todaySchema } from './lib/schemas'

const DictionaryExperience = lazy(async () => {
  const module = await import('./components/DictionaryExperience')
  return { default: module.DictionaryExperience }
})

const QuizExperience = lazy(async () => {
  const module = await import('./components/QuizExperience')
  return { default: module.QuizExperience }
})

const LatestReportPage = lazy(async () => {
  const module = await import('./components/QuizExperience')
  return { default: module.LatestReportPage }
})

const MistakeReviewPage = lazy(async () => {
  const module = await import('./components/QuizExperience')
  return { default: module.MistakeReviewPage }
})

function FeatureFallback({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="page page--reading" role="status">
      正在加载{label}…
    </div>
  )
}

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
      setHealth('ready')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setHealth('unavailable')
      setTodayState({
        status: 'error',
        message: error instanceof Error ? error.message : '今日内容暂时不可用',
      })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void apiGet('/api/today', todaySchema, controller.signal, 30_000)
      .then((data) => {
        setTodayState({ status: 'ready', data })
        setHealth('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setHealth('unavailable')
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
    quiz: (
      <Suspense fallback={<FeatureFallback label="测试" />}>
        <QuizExperience onNavigate={navigate} />
      </Suspense>
    ),
    report: (
      <Suspense fallback={<FeatureFallback label="结果报告" />}>
        <LatestReportPage onNavigate={navigate} />
      </Suspense>
    ),
    dictionary: (
      <Suspense
        fallback={
          <div aria-live="polite" className="page page--reading" role="status">
            正在加载词典…
          </div>
        }
      >
        <DictionaryExperience />
      </Suspense>
    ),
    review: (
      <Suspense fallback={<FeatureFallback label="错题巩固" />}>
        <MistakeReviewPage onNavigate={navigate} />
      </Suspense>
    ),
    settings: <SettingsPage onThemeChange={setTheme} theme={theme} />,
  }

  return (
    <AppShell activePage={activePage} health={health} onNavigate={navigate}>
      {pages[activePage]}
    </AppShell>
  )
}

export default App
