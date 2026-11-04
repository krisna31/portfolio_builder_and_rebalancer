import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('QuantPorto Uncaught Error Boundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      // Surgically remove only portfolio application state keys while preserving
      // WebAuthn passkeys (quantporto_webauthn_*) and user theme preference (color-scheme)
      const appStateKeys = [
        'quantporto_state_v2',
        'quantporto_saved_portfolios_v1',
        'quantporto_tour_seen_v2',
      ];
      for (const key of appStateKeys) {
        localStorage.removeItem(key);
      }
      sessionStorage.clear();
    } catch {
      // Ignore storage errors
    }
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen ui-page flex items-center justify-center p-4">
          <div className="w-full max-w-lg ui-card ui-border rounded-xl p-6 sm:p-8 shadow-lg space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold ui-text-main">
                  Terjadi Kendala Tampilan
                </h1>
                <p className="text-xs ui-text-muted mt-0.5">
                  QuantPorto mendeteksi adanya error pada render komponen.
                </p>
              </div>
            </div>

            <div className="p-3.5 ui-subtle rounded-lg ui-border text-xs space-y-2">
              <div className="ui-text-secondary font-semibold">Pesan Kesalahan:</div>
              <div className="font-mono text-rose-600 dark:text-rose-400 text-[11px] break-words">
                {this.state.error?.message || 'Unknown Application Error'}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetStorage}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 ui-subtle hover:opacity-90 ui-text-main ui-border rounded-lg text-xs font-semibold transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                <span>Reset Data ke Awal</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
