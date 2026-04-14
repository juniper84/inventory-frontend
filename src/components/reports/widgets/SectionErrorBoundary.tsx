'use client';

import { Component, ReactNode } from 'react';

/**
 * SectionErrorBoundary — Catches rendering errors in a report section
 * so a broken section doesn't crash the whole page.
 */

type Props = { children: ReactNode; sectionName?: string };
type State = { hasError: boolean; error: Error | null };

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(
      `[Reports] Section "${this.props.sectionName ?? 'unknown'}" failed:`,
      error,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rpt-section-error" role="alert">
          <div className="rpt-section-error__icon" aria-hidden>
            ⚠️
          </div>
          <div className="rpt-section-error__body">
            <div className="rpt-section-error__title">
              This section failed to load
            </div>
            <div className="rpt-section-error__message">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rpt-section-error__retry"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
