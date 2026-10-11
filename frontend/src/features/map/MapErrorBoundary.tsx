import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** MapLibre 6 needs WebGL2; without it the map throws, and this shows a message instead of a grey box. */
export class MapErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Map failed to start', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
          This browser can't show the map. It needs WebGL2; a current Chrome, Edge, Firefox or Safari works.
        </div>
      )
    }
    return this.props.children
  }
}
