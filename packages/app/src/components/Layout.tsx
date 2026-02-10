import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '../lib/constants';
import ThemeToggle from './ThemeToggle';

interface NavItemProps {
  to: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}

function NavItem({ to, label, disabled, onClick }: NavItemProps) {
  if (disabled) {
    return (
      <span className="px-4 py-2 text-gray-600 cursor-not-allowed block">
        {label}
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `px-4 py-2 rounded transition-colors block ${
          isActive
            ? 'text-[#c9a227] border-b-2 border-[#c9a227] md:border-b-2'
            : 'text-gray-300 hover:text-[#8b0000]'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleDownloadStandalone = () => {
    const link = document.createElement('a');
    link.href = import.meta.env.BASE_URL + 'forensicate-standalone.html';
    link.download = 'forensicate-standalone.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 dark:border-gray-800 light:border-gray-200 bg-gray-900/50 dark:bg-gray-900/50 light:bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 md:py-4">
          {/* Mobile/Desktop Header */}
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2 md:gap-4">
              <Link
                to="/"
                className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-[#c9a227] bg-[#5c0000] flex items-center justify-center shadow-[0_0_10px_rgba(139,0,0,0.5)]">
                  <span className="text-[#c9a227] font-bold text-base md:text-lg" style={{ fontFamily: 'serif' }}>F</span>
                </div>
                <h1 className="text-lg md:text-xl font-semibold text-[#c9a227] tracking-wider" style={{ fontFamily: 'serif' }}>{APP_NAME}</h1>
              </Link>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-2">
              <NavItem to="/scanner" label="Prompt Scanner" />
              <NavItem to="/jeopardy" label="AI Jeopardy" disabled />
              <NavItem to="/log-constructor" label="AI Log Constructor" disabled />
              <button
                onClick={handleDownloadStandalone}
                className="ml-2 px-3 py-1.5 bg-gradient-to-r from-[#c9a227] to-[#d4b030] text-gray-900 text-sm font-semibold rounded-lg shadow-lg hover:shadow-[0_0_15px_rgba(201,162,39,0.5)] transition-all hover:scale-105 flex items-center gap-1.5"
                title="Download as standalone HTML file - works offline!"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
              <a
                href="https://github.com/peterhanily/forensicate.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 p-2 text-gray-400 hover:text-[#c9a227] transition-colors"
                title="View on GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <div className="ml-2">
                <ThemeToggle />
              </div>
              <div className="ml-3 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-semibold rounded-lg shadow-lg flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.84 4.67h1.68v8.36h3.36L12 18.155 7.8 13.03h3.36V4.67z"/>
                </svg>
                <span>Chrome Extension</span>
                <span className="px-1.5 py-0.5 bg-white/20 rounded text-[10px]">Coming Soon</span>
              </div>
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-300 hover:text-[#c9a227] transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile Nav Menu */}
          {mobileMenuOpen && (
            <nav className="md:hidden mt-3 pt-3 border-t border-gray-800 space-y-1">
              <NavItem to="/scanner" label="Prompt Scanner" onClick={closeMobileMenu} />
              <NavItem to="/jeopardy" label="AI Jeopardy" disabled />
              <NavItem to="/log-constructor" label="AI Log Constructor" disabled />
              <button
                onClick={() => {
                  handleDownloadStandalone();
                  closeMobileMenu();
                }}
                className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-[#c9a227] to-[#d4b030] text-gray-900 text-sm font-semibold rounded-lg shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Offline Version
              </button>
              <a
                href="https://github.com/peterhanily/forensicate.ai"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMobileMenu}
                className="w-full mt-2 px-4 py-2 text-gray-400 hover:text-[#c9a227] text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </a>
              <div className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-.84 4.67h1.68v8.36h3.36L12 18.155 7.8 13.03h3.36V4.67z"/>
                </svg>
                <span>Chrome Extension</span>
                <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">Coming Soon</span>
              </div>
              <div className="w-full mt-2 flex justify-center">
                <ThemeToggle />
              </div>
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-4 py-4 md:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-gray-800 py-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm flex flex-wrap items-center justify-center gap-2">
          <span>{APP_NAME} v{APP_VERSION}</span>
          <span className="text-gray-700">|</span>
          <a
            href="/extension-privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-[#c9a227] transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-gray-700">|</span>
          <a
            href="https://github.com/peterhanily/forensicate.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-[#c9a227] transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
