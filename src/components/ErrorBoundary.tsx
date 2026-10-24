import { Component, type ReactNode } from "react";

interface Props {
  /** What to show instead of the children after a render error; `reset` tries the children again. */
  fallback: (error: unknown, reset: () => void) => ReactNode;
  /** The boundary resets by itself when any of these change (a different model, say). */
  resetKeys?: unknown[];
  children: ReactNode;
}

interface State {
  failed: boolean;
  error: unknown;
}

const changed = (a: unknown[] = [], b: unknown[] = []) => a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

/** Catches errors thrown while rendering its children, so one broken panel doesn't blank the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error("Something broke while drawing the page", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && changed(prev.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => this.setState({ failed: false, error: null });

  render() {
    return this.state.failed ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
