import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Game Crash Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center bg-[#0f172a] p-6 text-center text-white">
          <span className="mb-4 text-4xl">📡</span>
          <h2 className="mb-2 text-xl font-bold">Connection Interrupted</h2>
          <p className="mb-6 text-sm text-slate-400">The game lost connection. Please reload to rejoin.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-blue-600 px-6 py-3 font-bold"
          >
            Reload Game
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
