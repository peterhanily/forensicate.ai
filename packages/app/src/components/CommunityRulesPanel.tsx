import { useState, useEffect } from 'react';
import {
 fetchCommunityIndex,
 fetchCommunityRule,
 communityRuleToDetectionRule,
 clearCommunityCache,
 type CommunityRule,
 type CommunityRuleMetadata,
 type DetectionRule,
} from '@forensicate/scanner';

interface CommunityRulesPanelProps {
 onImportRule: (rule: DetectionRule) => void;
 importedRuleIds: Set<string>;
 autoImportEnabled: boolean;
 onToggleAutoImport: (enabled: boolean) => void;
}

export default function CommunityRulesPanel({
 onImportRule,
 importedRuleIds,
 autoImportEnabled,
 onToggleAutoImport,
}: CommunityRulesPanelProps) {
 const [rules, setRules] = useState<CommunityRuleMetadata[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedCategory, setSelectedCategory] = useState<string>('all');
 const [searchQuery, setSearchQuery] = useState('');
 const [expandedRule, setExpandedRule] = useState<string | null>(null);
 const [ruleDetails, setRuleDetails] = useState<Map<string, CommunityRule>>(new Map());
 const [loadingRuleId, setLoadingRuleId] = useState<string | null>(null);
 const [ruleLoadError, setRuleLoadError] = useState<string | null>(null);
 const [refreshing, setRefreshing] = useState(false);

 // Load community rules index
 useEffect(() => {
 loadRules();
 }, []);

 async function loadRules(forceRefresh = false) {
 try {
 setLoading(true);
 setRefreshing(true);
 setError(null);

 // Clear cache if force refresh
 if (forceRefresh) {
 clearCommunityCache();
 }

 const index = await fetchCommunityIndex();
 setRules(index.rules);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to load community rules');
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }

 // Load rule details when expanded
 async function handleToggleRule(ruleId: string) {
 if (expandedRule === ruleId) {
 setExpandedRule(null);
 setRuleLoadError(null);
 return;
 }

 setExpandedRule(ruleId);
 setRuleLoadError(null);

 // Fetch details if not already loaded
 if (!ruleDetails.has(ruleId)) {
 setLoadingRuleId(ruleId);
 try {
 const rule = await fetchCommunityRule(ruleId);
 setRuleDetails(new Map(ruleDetails.set(ruleId, rule)));
 } catch (err) {
 console.error('Failed to load rule details:', err);
 setRuleLoadError(err instanceof Error ? err.message : 'Failed to load rule details');
 } finally {
 setLoadingRuleId(null);
 }
 }
 }

 // Import rule to custom rules
 function handleImportRule(ruleId: string) {
 const details = ruleDetails.get(ruleId);
 if (!details) return;

 try {
 const detectionRule = communityRuleToDetectionRule(details);
 onImportRule(detectionRule);
 } catch (err) {
 alert(err instanceof Error ? err.message : 'Failed to import rule');
 }
 }

 // Filter rules
 const filteredRules = rules.filter((rule) => {
 // Category filter
 if (selectedCategory !== 'all' && rule.category !== selectedCategory) {
 return false;
 }

 // Search filter
 if (searchQuery) {
 const query = searchQuery.toLowerCase();
 return (
 rule.name.toLowerCase().includes(query) ||
 rule.id.toLowerCase().includes(query) ||
 rule.author.toLowerCase().includes(query)
 );
 }

 return true;
 });

 // Get unique categories
 const categories = ['all', ...new Set(rules.map((r) => r.category))];

 return (
 <>
 {/* Header */}
 <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex-shrink-0">
 <div className="flex items-center justify-between mb-2">
 <div>
 <h3 className="text-[#c9a227] text-sm font-semibold">Community Rules</h3>
 <p className="text-gray-500 text-xs">
 {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''} available • Import to use
 </p>
 </div>
 <button
 onClick={() => loadRules(true)}
 disabled={refreshing}
 className="p-1.5 text-gray-400 hover:text-[#c9a227] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 title="Refresh from GitHub"
 >
 <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 </button>
 </div>

 {/* Category filter */}
 <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
 {categories.map((category) => (
 <button
 key={category}
 onClick={() => setSelectedCategory(category)}
 className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${
 selectedCategory === category
 ? 'bg-[#c9a227] text-gray-900 font-semibold'
 : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
 }`}
 >
 {category}
 </button>
 ))}
 </div>

 {/* Search */}
 <div className="relative">
 <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
 </svg>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search rules..."
 className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#c9a227]/50"
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery('')}
 className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
 >
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 )}
 </div>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto custom-scrollbar">
 {loading ? (
 <div className="flex items-center justify-center py-12 text-gray-500">
 <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
 </svg>
 Loading community rules...
 </div>
 ) : error ? (
 <div className="px-3 py-8 text-center">
 <p className="text-red-400 text-sm mb-3">❌ {error}</p>
 <button
 onClick={() => loadRules(true)}
 className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
 >
 Try Again
 </button>
 </div>
 ) : filteredRules.length === 0 ? (
 <div className="px-3 py-8 text-center text-gray-500 text-xs">
 {searchQuery || selectedCategory !== 'all'
 ? `No rules match your filters`
 : 'No community rules available'}
 </div>
 ) : (
 <div className="divide-y divide-gray-800">
 {filteredRules.map((rule) => {
 const isExpanded = expandedRule === rule.id;
 const details = ruleDetails.get(rule.id);
 const isImported = importedRuleIds.has(rule.id);

 return (
 <div key={rule.id} className="bg-gray-900/30">
 {/* Rule header */}
 <button
 onClick={() => handleToggleRule(rule.id)}
 className="w-full px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h4 className="text-sm font-medium text-gray-200 truncate">
 {rule.name}
 </h4>
 <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
 rule.severity === 'critical' ? 'bg-red-900/50 text-red-300' :
 rule.severity === 'high' ? 'bg-orange-900/50 text-orange-300' :
 rule.severity === 'medium' ? 'bg-yellow-900/50 text-yellow-300' :
 'bg-blue-900/50 text-blue-300'
 }`}>
 {rule.severity}
 </span>
 </div>
 <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
 <span className="px-1.5 py-0.5 bg-gray-800 rounded">{rule.category}</span>
 <span>by @{rule.author}</span>
 {rule.votes > 0 && (
 <span className="flex items-center gap-0.5">
 👍 {rule.votes}
 </span>
 )}
 </div>
 </div>
 <svg
 className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${
 isExpanded ? 'rotate-180' : ''
 }`}
 fill="none"
 stroke="currentColor"
 viewBox="0 0 24 24"
 >
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
 </svg>
 </div>
 </button>

 {/* Rule details (expanded) */}
 {isExpanded && (
 <div className="px-3 py-3 bg-gray-900/50 border-t border-gray-800 text-xs">
 {loadingRuleId === rule.id ? (
 <div className="flex items-center justify-center py-6 text-gray-500">
 <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
 </svg>
 Loading details...
 </div>
 ) : ruleLoadError ? (
 <>
 <div className="px-3 py-2 mb-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs">
 ⚠️ {ruleLoadError}
 </div>
 {/* Import button still shown even on error */}
 <button
 onClick={() => handleImportRule(rule.id)}
 disabled={isImported}
 className={`w-full px-3 py-1.5 rounded font-medium transition-colors ${
 isImported
 ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
 : 'bg-[#c9a227] hover:bg-[#d4b030] text-gray-900'
 }`}
 >
 {isImported ? '✓ Already Imported' : 'Import to Custom Rules'}
 </button>
 </>
 ) : details ? (
 <>
 <p className="text-gray-400 mb-3">{details.description}</p>

 {/* Examples */}
 {details.examples && details.examples.length > 0 && (
 <div className="mb-3">
 <div className="text-gray-500 font-medium mb-1">Examples:</div>
 <div className="space-y-1">
 {details.examples.slice(0, 3).map((example, i) => (
 <div key={i} className="px-2 py-1 bg-gray-800/50 rounded text-gray-400 font-mono text-[10px] leading-relaxed">
 "{example}"
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Tags */}
 {details.tags && details.tags.length > 0 && (
 <div className="mb-3">
 <div className="flex flex-wrap gap-1">
 {details.tags.map((tag) => (
 <span key={tag} className="px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded text-[10px]">
 #{tag}
 </span>
 ))}
 </div>
 </div>
 )}

 {/* References */}
 {details.references && details.references.length > 0 && (
 <div className="mb-3">
 <div className="text-gray-500 font-medium mb-1">References:</div>
 <div className="space-y-1">
 {details.references.map((ref, i) => (
 <a
 key={i}
 href={ref}
 target="_blank"
 rel="noopener noreferrer"
 className="block text-[#c9a227] hover:text-[#d4b030] underline truncate"
 >
 {ref}
 </a>
 ))}
 </div>
 </div>
 )}

 {/* Import button */}
 <button
 onClick={() => handleImportRule(rule.id)}
 disabled={isImported}
 className={`w-full px-3 py-1.5 rounded font-medium transition-colors ${
 isImported
 ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
 : 'bg-[#c9a227] hover:bg-[#d4b030] text-gray-900'
 }`}
 >
 {isImported ? '✓ Already Imported' : 'Import to Custom Rules'}
 </button>
 </>
 ) : null}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="px-3 py-2 bg-gray-800/30 border-t border-gray-700 flex-shrink-0 space-y-2">
 <div className="flex items-center justify-between text-xs">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={autoImportEnabled}
 onChange={(e) => onToggleAutoImport(e.target.checked)}
 className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-[#c9a227] focus:ring-[#c9a227] focus:ring-offset-gray-900"
 />
 <span className="text-gray-400">Auto-import on page load</span>
 </label>
 </div>
 <div className="flex items-center justify-between text-xs text-gray-500">
 <a
 href="https://github.com/peterhanily/forensicate.ai/tree/main/community-rules"
 target="_blank"
 rel="noopener noreferrer"
 className="text-[#c9a227] hover:text-[#d4b030] underline"
 >
 Submit a Rule
 </a>
 <span>Updated every 24h</span>
 </div>
 </div>
 </>
 );
}
