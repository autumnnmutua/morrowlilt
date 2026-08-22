import { useEffect, useState, type ReactNode } from 'react'
import type { HealthState, PageId } from '../types'

interface AppShellProps {
  activePage: PageId
  children: ReactNode
  health: HealthState
  onNavigate: (page: PageId) => void
}

const primaryNavigation: Array<{ id: PageId; label: string; short: string }> = [
  { id: 'today', label: '今日', short: '今日' },
  { id: 'learning', label: '每日学习', short: '学习' },
  { id: 'quiz', label: '测试', short: '测试' },
  { id: 'review', label: '错题巩固', short: '巩固' },
  { id: 'dictionary', label: '词典', short: '词典' },
]

const secondaryNavigation: Array<{ id: PageId; label: string }> = [
  { id: 'report', label: '结果报告' },
  { id: 'settings', label: '设置' },
]

const pageTitles: Record<PageId, string> = {
  today: '今日',
  learning: '每日学习',
  quiz: '词汇测试',
  report: '结果报告',
  dictionary: '词典',
  review: '错题巩固',
  settings: '设置',
}

function NavigationButton({
  activePage,
  id,
  label,
  onNavigate,
}: {
  activePage: PageId
  id: PageId
  label: string
  onNavigate: (page: PageId) => void
}) {
  return (
    <button
      aria-current={activePage === id ? 'page' : undefined}
      className="nav-button"
      onClick={() => onNavigate(id)}
      type="button"
    >
      <span aria-hidden="true" className="nav-marker" />
      {label}
    </button>
  )
}

export function AppShell({
  activePage,
  children,
  health,
  onNavigate,
}: AppShellProps) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const healthLabels: Record<HealthState, string> = {
    checking: '正在连接',
    ready: '服务正常',
    unavailable: '服务暂不可用',
  }

  useEffect(() => {
    const markOnline = () => setOnline(true)
    const markOffline = () => setOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])

  useEffect(() => {
    const destinations: PageId[] = [
      'today',
      'learning',
      'quiz',
      'review',
      'dictionary',
      'report',
      'settings',
    ]
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]'))
        return
      const digit = Number(event.key)
      if (event.altKey && digit >= 1 && digit <= destinations.length) {
        event.preventDefault()
        onNavigate(destinations[digit - 1])
      }
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        onNavigate('dictionary')
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [onNavigate])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      {!online ? (
        <div aria-live="assertive" className="offline-banner" role="status">
          当前离线：可继续阅读已显示内容，打卡和其他保存操作会要求重新联网。
        </div>
      ) : null}

      <aside aria-label="应用侧栏" className="sidebar">
        <button
          aria-label="返回 MorrowLilt 今日页"
          className="brand-button"
          onClick={() => onNavigate('today')}
          type="button"
        >
          <span aria-hidden="true" className="brand-mark">
            M
          </span>
          <span>
            <strong>MorrowLilt</strong>
            <small>晨律 · 每日英语进阶</small>
          </span>
        </button>

        <nav aria-label="主要导航" className="side-navigation">
          <p className="nav-label">学习</p>
          {primaryNavigation.map((item) => (
            <NavigationButton
              activePage={activePage}
              id={item.id}
              key={item.id}
              label={item.label}
              onNavigate={onNavigate}
            />
          ))}

          <p className="nav-label nav-label--secondary">更多</p>
          {secondaryNavigation.map((item) => (
            <NavigationButton
              activePage={activePage}
              id={item.id}
              key={item.id}
              label={item.label}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="sidebar-footer">
          <span
            className={`service-dot service-dot--${online ? health : 'unavailable'}`}
          />
          <span>{online ? healthLabels[health] : '离线浏览'}</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="mobile-header">
          <button
            aria-label="返回 MorrowLilt 今日页"
            className="mobile-brand"
            onClick={() => onNavigate('today')}
            type="button"
          >
            <span aria-hidden="true">M</span>
            MorrowLilt
          </button>
          <strong>{pageTitles[activePage]}</strong>
          <button
            aria-label="打开设置"
            className="header-action"
            onClick={() => onNavigate('settings')}
            type="button"
          >
            设置
          </button>
        </header>

        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav aria-label="移动端主要导航" className="bottom-navigation">
        {primaryNavigation.map((item) => (
          <button
            aria-current={activePage === item.id ? 'page' : undefined}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            <span aria-hidden="true" className="bottom-marker" />
            {item.short}
          </button>
        ))}
      </nav>
    </div>
  )
}
