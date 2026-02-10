import { useState } from 'react';
import type { PromptCategory, PromptItem } from '../data/samplePrompts';
import CommunityPromptsPanel from './CommunityPromptsPanel';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert source string to clickable URL
 * Supports various formats and platforms:
 * - "github/username/repo" -> GitHub repository
 * - "Lakera/guide-name" -> Lakera website
 * - "Research/topic" -> Search query for the research topic
 * - "internal/*" -> No link (internal sources)
 * - Full URLs -> Unchanged
 */
function getSourceUrl(source: string): { url: string; display: string } | null {
  if (!source) return null;

  // Skip internal sources
  if (source.startsWith('internal/')) {
    return null;
  }

  // Already a full URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { url: source, display: source };
  }

  // GitHub shorthand: github/username/repo
  if (source.startsWith('github/')) {
    const path = source.substring(7); // Remove 'github/'
    return {
      url: `https://github.com/${path}`,
      display: source
    };
  }

  // Lakera resources
  if (source.startsWith('Lakera/')) {
    // Link to their AI security guide
    return {
      url: 'https://www.lakera.ai/blog/guide-to-prompt-injection',
      display: source
    };
  }

  // Research topics - create a search link
  if (source.startsWith('Research/')) {
    const topic = source.substring(9).replace(/-/g, ' '); // Remove 'Research/' and format
    const searchQuery = encodeURIComponent(`LLM ${topic} prompt injection`);
    return {
      url: `https://www.google.com/search?q=${searchQuery}`,
      display: source
    };
  }

  // Default: no link
  return null;
}

// ============================================================================
// Test Battery Panel Component
// ============================================================================

interface TestBatteryPanelProps {
  showMobilePrompts: boolean;
  onCloseMobile: () => void;
  promptSearchQuery: string;
  onPromptSearchChange: (query: string) => void;
  filteredPromptCategories: PromptCategory[];
  allPromptCategories: PromptCategory[];
  expandedCategory: string | null;
  onToggleCategory: (categoryId: string) => void;
  onSelectPrompt: (prompt: PromptItem) => void;
  onOpenAddPromptModal: (categoryId?: string) => void;
  onDeletePrompt: (promptId: string, categoryId: string) => void;
  onDeletePromptSection: (categoryId: string) => void;
  onShowAddPromptSectionModal: () => void;
  selectedPrompts: Set<string>;
  onToggleSelection: (promptId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchScan: () => void;
  isScanning: boolean;
  onImportCommunityPrompt?: (prompt: PromptItem) => void;
  importedCommunityPromptIds?: Set<string>;
  autoImportEnabled?: boolean;
  onToggleAutoImport?: (enabled: boolean) => void;
}

export default function TestBatteryPanel({
  showMobilePrompts,
  onCloseMobile,
  promptSearchQuery,
  onPromptSearchChange,
  filteredPromptCategories,
  allPromptCategories,
  expandedCategory,
  onToggleCategory,
  onSelectPrompt,
  onOpenAddPromptModal,
  onDeletePrompt,
  onDeletePromptSection,
  onShowAddPromptSectionModal,
  selectedPrompts,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onBatchScan,
  isScanning,
  onImportCommunityPrompt,
  importedCommunityPromptIds = new Set(),
  autoImportEnabled = false,
  onToggleAutoImport,
}: TestBatteryPanelProps) {
  const [activeTab, setActiveTab] = useState<'builtin' | 'custom' | 'community'>('builtin');

  // Separate built-in from custom categories
  const builtInCategories = filteredPromptCategories.filter(cat =>
    !cat.id.startsWith('custom-prompt-section-') &&
    cat.id !== 'extension-snippets' &&
    cat.source !== 'chrome-extension'
  );

  const customCategories = filteredPromptCategories.filter(cat =>
    cat.id.startsWith('custom-prompt-section-') ||
    cat.id === 'extension-snippets' ||
    cat.source === 'chrome-extension'
  );

  const displayedCategories = activeTab === 'builtin' ? builtInCategories : customCategories;
  return (
    <div className={`${showMobilePrompts ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 lg:flex-shrink-0 border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden flex-col max-h-[70vh] lg:max-h-[calc(100vh-220px)] lg:sticky lg:top-20 lg:self-start`}>
      <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-[#c9a227] text-sm font-semibold">Test Battery</h3>
            <p className="text-gray-500 text-xs">Select prompts to analyze</p>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1 text-gray-500 hover:text-gray-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('builtin')}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
              activeTab === 'builtin'
                ? 'bg-[#c9a227] text-gray-900 font-semibold'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Built-in
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
              activeTab === 'custom'
                ? 'bg-[#c9a227] text-gray-900 font-semibold'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Custom
          </button>
          {onImportCommunityPrompt && (
            <button
              onClick={() => setActiveTab('community')}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                activeTab === 'community'
                  ? 'bg-[#c9a227] text-gray-900 font-semibold'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Community
            </button>
          )}
        </div>
      </div>

      {/* Search input */}
      {activeTab !== 'community' && (
        <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={promptSearchQuery}
            onChange={(e) => onPromptSearchChange(e.target.value)}
            placeholder="Search prompts..."
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#c9a227]/50"
          />
          {promptSearchQuery && (
            <button
              onClick={() => onPromptSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        </div>
      )}

      {/* Community Prompts Tab */}
      {activeTab === 'community' && onImportCommunityPrompt && (
        <CommunityPromptsPanel
          onImportPrompt={onImportCommunityPrompt}
          importedPromptIds={importedCommunityPromptIds}
          autoImportEnabled={autoImportEnabled}
          onToggleAutoImport={onToggleAutoImport || (() => {})}
        />
      )}

      {/* Built-in & Custom Tabs */}
      {activeTab !== 'community' && (
        <>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {displayedCategories.length === 0 ? (
              <div className="px-3 py-8 text-center text-gray-500 text-xs">
                {activeTab === 'custom'
                  ? 'No custom prompts yet. Click "Add Prompt" or "Add Section" below to create your own.'
                  : `No prompts match "${promptSearchQuery}"`}
              </div>
            ) : displayedCategories.map((category) => {
          // Allow editing for custom sections OR extension-imported categories
          const allowPromptEditing = category.id === 'extension-snippets' ||
                                       category.source === 'chrome-extension' ||
                                       category.id.startsWith('extension-snippets');
          const isCustomSection = category.id.startsWith('custom-prompt-section-') ||
                                   category.id === 'extension-snippets' ||
                                   category.source === 'chrome-extension';

          return (
            <CategorySection
              key={category.id}
              category={category}
              isExpanded={expandedCategory === category.id}
              onToggle={() => onToggleCategory(category.id)}
              onSelectPrompt={onSelectPrompt}
              onAddPrompt={() => onOpenAddPromptModal(category.id)}
              onDeletePrompt={(promptId) => onDeletePrompt(promptId, category.id)}
              onDeleteSection={
                isCustomSection
                  ? () => onDeletePromptSection(category.id)
                  : undefined
              }
              isCustomSection={isCustomSection}
              selectedPrompts={selectedPrompts}
              onToggleSelection={onToggleSelection}
              allowPromptEditing={allowPromptEditing}
            />
          );
        })}
          </div>

          <div className="px-3 py-2 bg-gray-800/30 border-t border-gray-700 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">
            {allPromptCategories.reduce((acc, cat) => acc + cat.prompts.length, 0)} prompts
          </span>
          {selectedPrompts.size > 0 && (
            <span className="text-[#c9a227]">{selectedPrompts.size} selected</span>
          )}
        </div>
        {/* Batch scan controls */}
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Select All
          </button>
          <button
            onClick={onClearSelection}
            className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            disabled={selectedPrompts.size === 0}
          >
            Clear
          </button>
        </div>
        <button
          onClick={onBatchScan}
          disabled={selectedPrompts.size === 0 || isScanning}
          className={`w-full px-2 py-1.5 text-xs rounded transition-colors flex items-center justify-center gap-1 ${
            selectedPrompts.size > 0
              ? 'bg-[#8b0000] hover:bg-[#6b0000] text-[#c9a227]'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Batch Scan ({selectedPrompts.size})
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onOpenAddPromptModal()}
            className="flex-1 px-2 py-1 text-xs bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Prompt
          </button>
          <button
            onClick={onShowAddPromptSectionModal}
            className="flex-1 px-2 py-1 text-xs bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Section
          </button>
        </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Test Battery Category Section Component
// ============================================================================

interface CategorySectionProps {
  category: PromptCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectPrompt: (prompt: PromptItem) => void;
  onAddPrompt?: () => void;
  onDeletePrompt?: (promptId: string) => void;
  onDeleteSection?: () => void;
  isCustomSection?: boolean;
  selectedPrompts?: Set<string>;
  onToggleSelection?: (promptId: string) => void;
  allowPromptEditing?: boolean;  // Whether prompts in this category can be edited/deleted
}

function CategorySection({
  category,
  isExpanded,
  onToggle,
  onSelectPrompt,
  onAddPrompt,
  onDeletePrompt,
  onDeleteSection,
  isCustomSection,
  selectedPrompts,
  onToggleSelection,
  allowPromptEditing = false,
}: CategorySectionProps) {
  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
      >
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-200 text-sm font-medium">{category.name}</span>
            {isCustomSection && (
              <span className="px-1 py-0.5 text-[9px] bg-blue-900/50 text-blue-300 rounded">
                Custom
              </span>
            )}
          </div>
          <div className="text-gray-500 text-xs">{category.prompts.length} prompts</div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="bg-gray-900/50">
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800">
            <div className="flex justify-between items-start gap-2">
              <span className="flex-1">
                Source:{' '}
                {(() => {
                  const linkInfo = getSourceUrl(category.source);
                  return linkInfo ? (
                    <a
                      href={linkInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#c9a227] hover:text-[#d4b030] underline inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                      title={`Open: ${linkInfo.url}`}
                    >
                      {linkInfo.display}
                      <svg className="w-2.5 h-2.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-gray-400">{category.source}</span>
                  );
                })()}
              </span>
            </div>
            {/* Action buttons row */}
            <div className="flex gap-1 mt-1.5">
              {onAddPrompt && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddPrompt(); }}
                  className="px-1.5 py-0.5 text-[10px] bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded flex items-center gap-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Prompt
                </button>
              )}
              {isCustomSection && onDeleteSection && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSection(); }}
                  className="px-1.5 py-0.5 text-[10px] bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded flex items-center gap-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Section
                </button>
              )}
            </div>
          </div>
          {category.prompts.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-600 text-xs">
              No prompts in this section yet.
              {onAddPrompt && (
                <button
                  onClick={onAddPrompt}
                  className="block mx-auto mt-2 px-2 py-1 text-[10px] bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded"
                >
                  Add your first prompt
                </button>
              )}
            </div>
          ) : (
            category.prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="group px-3 py-2 border-b border-gray-800/50 last:border-b-0 hover:bg-[#8b0000]/20 transition-colors"
              >
                <div className="flex items-start gap-2">
                  {/* Selection checkbox */}
                  {onToggleSelection && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleSelection(prompt.id); }}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        selectedPrompts?.has(prompt.id)
                          ? 'bg-[#c9a227] border-[#c9a227]'
                          : 'bg-transparent border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {selectedPrompts?.has(prompt.id) && (
                        <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => onSelectPrompt(prompt)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-300 text-sm">{prompt.name}</span>
                      {(allowPromptEditing || isCustomSection) && (
                        <span className="px-1 py-0.5 text-[9px] bg-blue-900/30 text-blue-400 rounded">
                          {category.source === 'chrome-extension' ? 'extension' : 'custom'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(prompt.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-xs bg-gray-800 text-gray-400 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </div>
                {(allowPromptEditing || isCustomSection) && onDeletePrompt && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePrompt(prompt.id); }}
                    className="mt-1.5 ml-6 px-1.5 py-0.5 text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
