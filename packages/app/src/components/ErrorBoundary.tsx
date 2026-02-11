import { Component } from 'react';
import type { ReactNode } from 'react';

interface ErrorBoundaryProps {
 children: ReactNode;
 fallback?: ReactNode;
}

interface ErrorBoundaryState {
 hasError: boolean;
 error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
 constructor(props: ErrorBoundaryProps) {
 super(props);
 this.state = { hasError: false, error: null };
 }

 static getDerivedStateFromError(error: Error): ErrorBoundaryState {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
 console.error('Error caught by boundary:', error, errorInfo);
 }

 handleReset = (): void => {
 this.setState({ hasError: false, error: null });
 };

 render(): ReactNode {
 if (this.state.hasError) {
 if (this.props.fallback) {
 return this.props.fallback;
 }

 return (
 <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
 <div className="bg-gray-900 border border-red-800 rounded-lg p-6 max-w-lg w-full">
 <div className="flex items-center gap-3 mb-4">
 <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
 <span className="text-red-400 text-xl">!</span>
 </div>
 <h2 className="text-xl font-semibold text-red-400">Something went wrong</h2>
 </div>

 <p className="text-gray-400 mb-4">
 An unexpected error occurred. You can try reloading the page or resetting the application.
 </p>

 {this.state.error && (
 <details className="mb-4">
 <summary className="text-gray-500 cursor-pointer hover:text-gray-400 text-sm">
 Error details
 </summary>
 <pre className="mt-2 p-3 bg-gray-950 rounded text-xs text-red-300 overflow-auto max-h-32">
 {this.state.error.message}
 </pre>
 </details>
 )}

 <div className="flex gap-3">
 <button
 onClick={this.handleReset}
 className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md transition-colors"
 >
 Try Again
 </button>
 <button
 onClick={() => window.location.reload()}
 className="px-4 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-300 rounded-md transition-colors"
 >
 Reload Page
 </button>
 </div>
 </div>
 </div>
 );
 }

 return this.props.children;
 }
}
