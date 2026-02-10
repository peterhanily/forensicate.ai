import { useState } from 'react';
import type { DetectionRule, RuleCategory } from '@forensicate/scanner';
import CommunityRulesPanel from './CommunityRulesPanel';

// ============================================================================
// Rules Panel Component
// ============================================================================

interface RulesPanelProps {
  showMobileRules: boolean;
  onCloseMobile: () => void;
  enabledRuleCount: number;
  totalRuleCount: number;
  ruleSearchQuery: string;
  onRuleSearchChange: (query: string) => void;
  filteredRuleCategories: RuleCategory[];
  expandedRuleCategory: string | null;
  onToggleRuleCategory: (categoryId: string) => void;
  onToggleRule: (ruleId: string) => void;
  onToggleCategoryRules: (category: RuleCategory, enabled: boolean) => void;
  editingKeywords: string | null;
  onEditKeywords: (ruleId: string | null) => void;
  onUpdateKeywords: (ruleId: string, keywords: string[]) => void;
  getSeverityColor: (severity: string) => string;
  getTypeIcon: (type: string) => string;
  onAddRule: (categoryId?: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onDeleteSection: (categoryId: string) => void;
  onViewLogic: (rule: DetectionRule) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onShowAddSectionModal: () => void;
  onImportCommunityRule?: (rule: DetectionRule) => void;
  importedCommunityRuleIds?: Set<string>;
  autoImportEnabled?: boolean;
  onToggleAutoImport?: (enabled: boolean) => void;
  matchedRuleIds?: Set<string>; // NEW: IDs of rules that matched in the last scan
}

export default function RulesPanel({
  showMobileRules,
  onCloseMobile,
  enabledRuleCount,
  totalRuleCount,
  ruleSearchQuery,
  onRuleSearchChange,
  filteredRuleCategories,
  expandedRuleCategory,
  onToggleRuleCategory,
  onToggleRule,
  onToggleCategoryRules,
  editingKeywords,
  onEditKeywords,
  onUpdateKeywords,
  getSeverityColor,
  getTypeIcon,
  onAddRule,
  onDeleteRule,
  onDeleteSection,
  onViewLogic,
  onEnableAll,
  onDisableAll,
  onShowAddSectionModal,
  onImportCommunityRule,
  importedCommunityRuleIds = new Set(),
  autoImportEnabled = false,
  onToggleAutoImport,
  matchedRuleIds = new Set(),
}: RulesPanelProps) {
  const [activeTab, setActiveTab] = useState<'builtin' | 'community'>('builtin');

  return (
    <div className={`${showMobileRules ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 lg:min-w-80 lg:max-w-80 lg:flex-shrink-0 border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden flex-col max-h-[70vh] lg:max-h-[calc(100vh-220px)] lg:sticky lg:top-20 lg:self-start`}>
      <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-[#c9a227] text-sm font-semibold">Detection Rules</h3>
            <p className="text-gray-500 text-xs">
              {activeTab === 'builtin'
                ? `${enabledRuleCount} of ${totalRuleCount} rules enabled`
                : 'Browse & import community rules'}
            </p>
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
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'builtin'
                ? 'bg-[#c9a227] text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Built-in & Custom
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'community'
                ? 'bg-[#c9a227] text-gray-900'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Community
          </button>
        </div>
      </div>

      {/* Built-in Rules Tab */}
      {activeTab === 'builtin' && (
        <>
          {/* Search input */}
          <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={ruleSearchQuery}
            onChange={(e) => onRuleSearchChange(e.target.value)}
            placeholder="Search rules..."
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#c9a227]/50"
          />
          {ruleSearchQuery && (
            <button
              onClick={() => onRuleSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredRuleCategories.length === 0 ? (
          <div className="px-3 py-8 text-center text-gray-500 text-xs">
            No rules match "{ruleSearchQuery}"
          </div>
        ) : filteredRuleCategories.map((category) => (
          <RuleCategorySection
            key={category.id}
            category={category}
            isExpanded={expandedRuleCategory === category.id}
            onToggle={() => onToggleRuleCategory(category.id)}
            onToggleRule={onToggleRule}
            onToggleAllRules={(enabled) => onToggleCategoryRules(category, enabled)}
            editingKeywords={editingKeywords}
            onEditKeywords={onEditKeywords}
            onUpdateKeywords={onUpdateKeywords}
            getSeverityColor={getSeverityColor}
            getTypeIcon={getTypeIcon}
            onAddRule={onAddRule}
            onDeleteRule={onDeleteRule}
            onDeleteSection={category.isCustom ? onDeleteSection : undefined}
            onViewLogic={onViewLogic}
            matchedRuleIds={matchedRuleIds}
          />
        ))}
      </div>

      <div className="px-3 py-2 bg-gray-800/30 border-t border-gray-700 flex-shrink-0 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={onEnableAll}
            className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Enable All
          </button>
          <button
            onClick={onDisableAll}
            className="flex-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Disable All
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onAddRule()}
            className="flex-1 px-2 py-1 text-xs bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Rule
          </button>
          <button
            onClick={onShowAddSectionModal}
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

    {/* Community Rules Tab */}
    {activeTab === 'community' && onImportCommunityRule && (
      <CommunityRulesPanel
        onImportRule={onImportCommunityRule}
        importedRuleIds={importedCommunityRuleIds}
        autoImportEnabled={autoImportEnabled}
        onToggleAutoImport={onToggleAutoImport || (() => {})}
      />
    )}
    </div>
  );
}

// ============================================================================
// Rule Category Section Component
// ============================================================================

interface RuleCategorySectionProps {
  category: RuleCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleRule: (ruleId: string) => void;
  onToggleAllRules: (enabled: boolean) => void;
  editingKeywords: string | null;
  onEditKeywords: (ruleId: string | null) => void;
  onUpdateKeywords: (ruleId: string, keywords: string[]) => void;
  getSeverityColor: (severity: string) => string;
  getTypeIcon: (type: string) => string;
  onAddRule?: (categoryId: string) => void;
  onDeleteRule?: (ruleId: string) => void;
  onDeleteSection?: (categoryId: string) => void;
  onViewLogic?: (rule: DetectionRule) => void;
  matchedRuleIds?: Set<string>;
}

function RuleCategorySection({
  category,
  isExpanded,
  onToggle,
  onToggleRule,
  onToggleAllRules,
  editingKeywords,
  onEditKeywords,
  onUpdateKeywords,
  getSeverityColor,
  getTypeIcon,
  onAddRule,
  onDeleteRule,
  onDeleteSection,
  onViewLogic,
  matchedRuleIds = new Set(),
}: RuleCategorySectionProps) {
  const enabledCount = category.rules.filter(r => r.enabled).length;
  const allEnabled = enabledCount === category.rules.length && category.rules.length > 0;
  const noneEnabled = enabledCount === 0;
  const isCustomSection = category.isCustom;

  // Check if this category contains any matched rules
  const hasMatchedRules = category.rules.some(rule => matchedRuleIds.has(rule.id));
  const matchedCount = category.rules.filter(rule => matchedRuleIds.has(rule.id)).length;

  return (
    <div className={`border-b border-gray-800 last:border-b-0 ${hasMatchedRules && !isExpanded ? 'bg-[#c9a227]/10 border-l-2 border-l-[#c9a227]' : ''}`}>
      <button
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center justify-between hover:bg-gray-800/30 transition-colors ${hasMatchedRules && !isExpanded ? 'pl-2.5' : ''}`}
      >
        <div className="text-left flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-200 text-sm font-medium">{category.name}</span>
            {isCustomSection && (
              <span className="px-1 py-0.5 text-[9px] bg-blue-900/50 text-blue-300 rounded">
                Custom
              </span>
            )}
            {hasMatchedRules && !isExpanded && (
              <span className="px-1 py-0.5 text-[9px] bg-[#c9a227] text-gray-900 rounded font-semibold">
                {matchedCount} matched
              </span>
            )}
          </div>
          <div className="text-gray-500 text-xs">
            {enabledCount}/{category.rules.length} enabled
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${allEnabled ? 'bg-green-500' : noneEnabled ? 'bg-gray-600' : 'bg-yellow-500'}`} />
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="bg-gray-900/50">
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800">
            <div className="flex justify-between items-start gap-2">
              <span className="flex-1">{category.description}</span>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleAllRules(true); }}
                  className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 rounded"
                >
                  All
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleAllRules(false); }}
                  className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 rounded"
                >
                  None
                </button>
              </div>
            </div>
            {/* Action buttons row */}
            <div className="flex gap-1 mt-1.5">
              {onAddRule && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddRule(category.id); }}
                  className="px-1.5 py-0.5 text-[10px] bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded flex items-center gap-0.5"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Rule
                </button>
              )}
              {isCustomSection && onDeleteSection && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSection(category.id); }}
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
          {category.rules.length === 0 ? (
            <div className="px-3 py-4 text-center text-gray-600 text-xs">
              No rules in this section yet.
              {onAddRule && (
                <button
                  onClick={() => onAddRule(category.id)}
                  className="block mx-auto mt-2 px-2 py-1 text-[10px] bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded"
                >
                  Add your first rule
                </button>
              )}
            </div>
          ) : (
            category.rules.map((rule) => (
              <RuleItem
                key={rule.id}
                rule={rule}
                onToggle={() => onToggleRule(rule.id)}
                isEditingKeywords={editingKeywords === rule.id}
                onEditKeywords={() => onEditKeywords(rule.id)}
                onCancelEdit={() => onEditKeywords(null)}
                onUpdateKeywords={(keywords) => onUpdateKeywords(rule.id, keywords)}
                getSeverityColor={getSeverityColor}
                getTypeIcon={getTypeIcon}
                onDelete={rule.id.startsWith('custom-') ? () => onDeleteRule?.(rule.id) : undefined}
                onViewLogic={onViewLogic ? () => onViewLogic(rule) : undefined}
                isMatched={matchedRuleIds.has(rule.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Individual Rule Item Component
// ============================================================================

interface RuleItemProps {
  rule: DetectionRule;
  onToggle: () => void;
  isEditingKeywords: boolean;
  onEditKeywords: () => void;
  onCancelEdit: () => void;
  onUpdateKeywords: (keywords: string[]) => void;
  getSeverityColor: (severity: string) => string;
  getTypeIcon: (type: string) => string;
  onDelete?: () => void;
  onViewLogic?: () => void;
  isMatched?: boolean;
}

function RuleItem({
  rule,
  onToggle,
  isEditingKeywords,
  onEditKeywords,
  onCancelEdit,
  onUpdateKeywords,
  getSeverityColor,
  getTypeIcon,
  onDelete,
  onViewLogic,
  isMatched = false,
}: RuleItemProps) {
  const [keywordText, setKeywordText] = useState(rule.keywords?.join('\n') || '');
  const isCustomRule = rule.id.startsWith('custom-');

  const handleSaveKeywords = () => {
    const keywords = keywordText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    onUpdateKeywords(keywords);
  };

  return (
    <div className={`px-3 py-2 border-b border-gray-800/50 last:border-b-0 group ${isMatched ? 'bg-[#c9a227]/10 border-l-2 border-l-[#c9a227] pl-2.5' : ''}`}>
      <div className="flex items-start gap-2">
        {/* Toggle Checkbox */}
        <button
          onClick={onToggle}
          className={`
            mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
            transition-colors
            ${rule.enabled
              ? 'bg-[#c9a227] border-[#c9a227]'
              : 'bg-transparent border-gray-600 hover:border-gray-500'
            }
          `}
        >
          {rule.enabled && (
            <svg className="w-3 h-3 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Rule Header */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs">{getTypeIcon(rule.type)}</span>
            <span className={`text-xs ${rule.enabled ? 'text-gray-200' : 'text-gray-500'}`}>
              {rule.name}
            </span>
            <span className={`px-1 py-0.5 text-[10px] rounded ${getSeverityColor(rule.severity)}`}>
              {rule.severity}
            </span>
            {isMatched && (
              <span className="px-1 py-0.5 text-[9px] bg-[#c9a227] text-gray-900 rounded font-semibold animate-pulse">
                MATCHED
              </span>
            )}
            {isCustomRule && (
              <span className="px-1 py-0.5 text-[9px] bg-blue-900/30 text-blue-400 rounded">
                custom
              </span>
            )}
          </div>

          {/* Rule Description */}
          <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">
            {rule.description}
          </p>

          {/* View Logic Button */}
          {onViewLogic && (
            <button
              onClick={onViewLogic}
              className="mt-1 px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded transition-colors flex items-center gap-1"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              View Logic
            </button>
          )}

          {/* Keyword Edit Section */}
          {rule.type === 'keyword' && rule.keywords && (
            <div className="mt-1.5">
              {isEditingKeywords ? (
                <div className="space-y-1.5">
                  <textarea
                    value={keywordText}
                    onChange={(e) => setKeywordText(e.target.value)}
                    className="w-full h-24 p-1.5 text-[10px] font-mono bg-gray-900 border border-gray-700 rounded text-gray-300 resize-none focus:outline-none focus:border-[#c9a227]"
                    placeholder="One keyword per line..."
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleSaveKeywords}
                      className="px-2 py-0.5 text-[10px] bg-[#c9a227] text-gray-900 rounded hover:bg-[#d4b030]"
                    >
                      Save
                    </button>
                    <button
                      onClick={onCancelEdit}
                      className="px-2 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onEditKeywords}
                  className="text-[10px] text-[#c9a227] hover:text-[#d4b030] transition-colors"
                >
                  {rule.keywords.length} keywords (click to edit)
                </button>
              )}
            </div>
          )}

          {/* Regex Pattern Display */}
          {rule.type === 'regex' && rule.pattern && (
            <div className="mt-1">
              <code className="text-[9px] text-gray-500 font-mono bg-gray-900/50 px-1 py-0.5 rounded break-all">
                /{rule.pattern}/{rule.flags || ''}
              </code>
            </div>
          )}

          {/* Delete button for custom rules */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="mt-1.5 px-1.5 py-0.5 text-[10px] bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
