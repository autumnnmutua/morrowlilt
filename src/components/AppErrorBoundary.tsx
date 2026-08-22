import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      JSON.stringify({
        event: 'ui_render_failed',
        errorName: error.name,
        componentStackPresent: Boolean(info.componentStack),
      }),
    )
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error" id="main-content" tabIndex={-1}>
          <h1>页面暂时无法显示</h1>
          <p>学习进度没有被更改。请重新加载页面后再试。</p>
          <button
            className="button button--primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            重新加载
          </button>
        </main>
      )
    }
    return this.props.children
  }
}
