import React, { Component, ErrorInfo, ReactNode } from 'react';
import { isChunkLoadError, recoverFromChunkLoadError } from '../../utils/chunkLoadRecovery';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** A reload was actually scheduled, so the spinner is telling the truth. */
  isRecovering: boolean;
  /** The app could not be downloaded - as opposed to a bug in the app. */
  isChunkError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isRecovering: false,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Note what kind of failure this is, but do not yet claim to be
    // recovering: whether a reload actually happens is decided below, and
    // this method can be called more than once for one error.
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
      isRecovering: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Only show "refreshing" when a refresh is genuinely on its way. It used
    // to be shown for every chunk error, so once the reload cap was reached
    // the screen sat on a spinner promising a reload that would never come.
    this.setState({ isRecovering: recoverFromChunkLoadError(error) });
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
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>Aggiornamento in corso</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '340px', lineHeight: '1.6' }}>
              È in caricamento una nuova versione dell’applicazione.
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

      // The app itself could not be downloaded and reloading has been tried
      // enough times. A plain explanation and a button the person chooses to
      // press - never another automatic reload, which is what turned a weak
      // signal into a phone that flickered and could not be used.
      if (this.state.isChunkError) {
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
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>📡</div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>
              Impossibile caricare l’applicazione
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '340px', lineHeight: '1.6' }}>
              Controlla la connessione e riprova. Se il problema continua, chiudi
              e riapri il browser.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '28px',
                padding: '12px 26px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '20px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: 'pointer'
              }}
            >
              Riprova
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
