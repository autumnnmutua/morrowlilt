import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
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

function getBusinessDate(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(now)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
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
  const loadedBusinessDay = useRef<
    { date: string; timeZone: string } | undefined
  >(undefined)
  const rolloverRequest = useRef<AbortController | undefined>(undefined)

  const loadToday = useCallback(async (signal?: AbortSignal) => {
    try {
      const data: TodayData = await apiGet(
        '/api/today',
        todaySchema,
        signal,
        30_000,
      )
      loadedBusinessDay.current = {
        date: data.today,
        timeZone: data.profile.timeZone,
      }
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
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    window.queueMicrotask(() => {
      if (!controller.signal.aborted) void loadToday(controller.signal)
    })
    return () => controller.abort()
  }, [loadToday])

  useEffect(() => {
    const refreshAfterRollover = () => {
      const loaded = loadedBusinessDay.current
      if (
        !loaded ||
        getBusinessDate(loaded.timeZone) === loaded.date ||
        rolloverRequest.current
      ) {
        return
      }
      const controller = new AbortController()
      rolloverRequest.current = controller
      setMutationMessage('已进入新的学习日，正在更新待学内容…')
      void loadToday(controller.signal).finally(() => {
        if (rolloverRequest.current === controller) {
          rolloverRequest.current = undefined
        }
      })
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAfterRollover()
    }
    const interval = window.setInterval(refreshAfterRollover, 60_000)
    window.addEventListener('focus', refreshAfterRollover)
    window.addEventListener('pageshow', refreshAfterRollover)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshAfterRollover)
      window.removeEventListener('pageshow', refreshAfterRollover)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      rolloverRequest.current?.abort()
    }
  }, [loadToday])

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

  const retryToday = () => {
    setTodayState({ status: 'loading' })
    void loadToday()
  }

  const updateLearningState = async (action: 'learned' | 'not_learned') => {
    if (todayAction) return
    if (todayState.status !== 'ready') return
    const previous = todayState.data
    if (getBusinessDate(previous.profile.timeZone) !== previous.today) {
      setMutationMessage('已进入新的学习日，请在内容更新后重新确认。')
      await loadToday()
      return
    }
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
      loadedBusinessDay.current = {
        date: data.today,
        timeZone: data.profile.timeZone,
      }
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
    if (getBusinessDate(previous.profile.timeZone) !== previous.today) {
      setMutationMessage('已进入新的学习日，不能撤销上一业务日的状态。')
      await loadToday()
      return
    }
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
      loadedBusinessDay.current = {
        date: data.today,
        timeZone: data.profile.timeZone,
      }
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
        onRetry={retryToday}
        onUndo={() => void undoLearningState()}
        state={todayState}
      />
    ),
    learning: <LearningPage onRetry={retryToday} state={todayState} />,
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
