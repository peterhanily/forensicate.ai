import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import Scanner from './pages/Scanner';

const MutationEngine = lazy(() => import('./pages/MutationEngine'));

// Detect standalone mode: file:// protocol means we're running as a downloaded HTML file
const isStandalone = typeof window !== 'undefined' && window.location.protocol === 'file:';

// Get base path from Vite config for proper routing on GitHub Pages
const basename = import.meta.env.BASE_URL;

// Use HashRouter for standalone (works with file:// protocol), BrowserRouter for server
const Router = isStandalone ? HashRouter : BrowserRouter;

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-gray-500 text-sm font-mono">Loading...</div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router basename={isStandalone ? undefined : basename}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/scanner" replace />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="mutate" element={<Suspense fallback={<PageLoader />}><MutationEngine /></Suspense>} />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
