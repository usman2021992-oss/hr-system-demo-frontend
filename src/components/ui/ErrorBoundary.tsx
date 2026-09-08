import React, { Component, ErrorInfo, ReactNode } from 'react';
import { isChunkLoadError, recoverFromChunkLoadError } from '../../utils/chunkLoadRecovery';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isRecovering: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isRecovering: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isRecovering: isChunkLoadError(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    if (recoverFromChunkLoadError(error)) {
      this.setState({ isRecovering: true });
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.state.isRecovering) {
        return (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            background: 'var(--surface)',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid var(--surface-warm)',
                borderTopColor: 'var(--primary)',
                borderRadius: '999px',
                animation: 'spin 0.8s linear infinite'
              }} />
            </div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>Refreshing application</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '340px', lineHeight: '1.6' }}>
              A new application version is loading.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '30px',
                padding: '10px 24px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '20px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Reload Now
            </button>
          </div>
        );
      }

      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          background: 'var(--surface)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '300px', lineHeight: '1.6' }}>
            The application encountered an unexpected error.
          </p>
          <div style={{
            marginTop: '24px',
            padding: '12px',
            background: 'var(--surface-warm)',
            borderRadius: '8px',
            fontSize: '11px',
            color: 'var(--danger)',
            fontFamily: 'monospace',
            textAlign: 'left',
            maxWidth: '90%',
            overflow: 'auto'
          }}>
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '30px',
              padding: '10px 24px',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '20px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
