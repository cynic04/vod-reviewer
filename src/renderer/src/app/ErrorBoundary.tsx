import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@renderer/components/Button';
import { EmptyState } from '@renderer/components/EmptyState';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence against a rendering bug: shows a recoverable message instead of a
 * blank window. Notes are saved the moment they are written, so reloading loses nothing.
 * (Error boundaries are the one thing React still requires a class component for.)
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The interface crashed.', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <EmptyState
        icon="close"
        title="Something broke"
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        {this.state.error.message} Your notes and timestamps are already saved.
      </EmptyState>
    );
  }
}
