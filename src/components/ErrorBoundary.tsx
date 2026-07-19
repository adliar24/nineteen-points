import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    
    // Auto-reload on chunk loading errors (Vite dynamic import failures)
    const errorMessage = error.message || "";
    if (
      errorMessage.includes("Failed to fetch dynamically imported module") ||
      errorMessage.includes("ChunkLoadError") ||
      errorMessage.includes("loading chunk")
    ) {
      const lastReload = sessionStorage.getItem("last-chunk-reload");
      const now = Date.now();
      
      // Prevent infinite reloading loops if the user is completely offline
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        sessionStorage.setItem("last-chunk-reload", String(now));
        console.warn("Pembaruan aplikasi terdeteksi (chunk error). Memuat ulang halaman...");
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#faf9ff] px-4">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-rose-100 shadow-2xl text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-brand-950">Terjadi Kesalahan</h3>
              <p className="text-xs text-brand-500 font-medium leading-relaxed">
                Halaman ini mengalami error. Silakan muat ulang atau kembali ke halaman utama.
              </p>
            </div>
            {this.state.error && (
              <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-[10px] font-mono text-rose-700 text-left max-h-24 overflow-auto">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-3 px-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 shadow-lg shadow-brand-500/25 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
