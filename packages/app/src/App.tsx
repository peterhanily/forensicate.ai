import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import Scanner from './pages/Scanner';

const Landing = lazy(() => import('./pages/Landing'));
const MutationEngine = lazy(() => import('./pages/MutationEngine'));
const ForensicTimeline = lazy(() => import('./pages/ForensicTimeline'));
const Learn = lazy(() => import('./pages/Learn'));
const LearnJailbreaks = lazy(() => import('./pages/LearnJailbreaks'));
const LearnChallenges = lazy(() => import('./pages/LearnChallenges'));
const LearnModelAttacks = lazy(() => import('./pages/LearnModelAttacks'));
const Compliance = lazy(() => import('./pages/Compliance'));
const BlogDetection = lazy(() => import('./pages/BlogDetection'));
const UltrasonicAnalyzer = lazy(() => import('./pages/UltrasonicAnalyzer'));

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
      <ToastProvider>
        <Router basename={isStandalone ? undefined : basename}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Suspense fallback={<PageLoader />}><Landing /></Suspense>} />
              <Route path="scanner" element={<Scanner />} />
              <Route path="mutate" element={<Suspense fallback={<PageLoader />}><MutationEngine /></Suspense>} />
              <Route path="timeline" element={<Suspense fallback={<PageLoader />}><ForensicTimeline /></Suspense>} />
              <Route path="learn" element={<Suspense fallback={<PageLoader />}><Learn /></Suspense>} />
              <Route path="learn/jailbreaks" element={<Suspense fallback={<PageLoader />}><LearnJailbreaks /></Suspense>} />
              <Route path="learn/challenges" element={<Suspense fallback={<PageLoader />}><LearnChallenges /></Suspense>} />
              <Route path="learn/model-attacks" element={<Suspense fallback={<PageLoader />}><LearnModelAttacks /></Suspense>} />
              <Route path="compliance" element={<Suspense fallback={<PageLoader />}><Compliance /></Suspense>} />
              <Route path="blog/detect-prompt-injection" element={<Suspense fallback={<PageLoader />}><BlogDetection /></Suspense>} />
              <Route path="ultrasonic" element={<Suspense fallback={<PageLoader />}><UltrasonicAnalyzer /></Suspense>} />
            </Route>
          </Routes>
        </Router>
      </ToastProvider>
    </ErrorBoundary>
  );
}
