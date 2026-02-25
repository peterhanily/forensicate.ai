import { useState, useEffect } from 'react';
import {
 fetchCommunityPromptsIndex,
 fetchCommunityPrompt,
 clearCommunityPromptsCache,
 type CommunityPrompt,
 type CommunityPromptMetadata,
} from '@forensicate/scanner';
import type { PromptItem } from '../data/samplePrompts';

interface CommunityPromptsPanelProps {
 onImportPrompt: (prompt: PromptItem) => void;
 importedPromptIds: Set<string>;
 autoImportEnabled: boolean;
 onToggleAutoImport: (enabled: boolean) => void;
}

export default function CommunityPromptsPanel({
 onImportPrompt,
 importedPromptIds,
 autoImportEnabled,
 onToggleAutoImport,
}: CommunityPromptsPanelProps) {
 const [prompts, setPrompts] = useState<CommunityPromptMetadata[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedCategory, setSelectedCategory] = useState<string>('all');
 const [searchQuery, setSearchQuery] = useState('');
 const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
 const [promptDetails, setPromptDetails] = useState<Map<string, CommunityPrompt>>(new Map());
 const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);
 const [promptLoadError, setPromptLoadError] = useState<string | null>(null);
 const [refreshing, setRefreshing] = useState(false);

 // Load community prompts index
 useEffect(() => {
 loadPrompts();
 }, []);

 async function loadPrompts(forceRefresh = false) {
 try {
 setLoading(true);
 setRefreshing(true);
 setError(null);

 // Clear cache if force refresh
 if (forceRefresh) {
 clearCommunityPromptsCache();
 }

 const index = await fetchCommunityPromptsIndex();
 setPrompts(index.prompts);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to load community prompts');
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }

 // Load prompt details when expanded
 async function handleTogglePrompt(promptId: string) {
 if (expandedPrompt === promptId) {
 setExpandedPrompt(null);
 setPromptLoadError(null);
 return;
 }

 setExpandedPrompt(promptId);
 setPromptLoadError(null);

 // Fetch details if not already loaded
 if (!promptDetails.has(promptId)) {
 setLoadingPromptId(promptId);
 try {
 const prompt = await fetchCommunityPrompt(promptId);
 setPromptDetails(new Map(promptDetails.set(promptId, prompt)));
 } catch (err) {
 console.error('Failed to load prompt details:', err);
 setPromptLoadError(err instanceof Error ? err.message : 'Failed to load prompt details');
 } finally {
 setLoadingPromptId(null);
 }
 }
 }

 // Import prompt to custom prompts
 function handleImportPrompt(promptId: string) {
 const details = promptDetails.get(promptId);
 if (!details) return;

 try {
 const promptItem: PromptItem = {
 id: details.id,
 name: details.name,
 content: details.content,
 tags: details.tags,
 };
 onImportPrompt(promptItem);
 } catch (err) {
 alert(err instanceof Error ? err.message : 'Failed to import prompt');
 }
 }

 // Filter prompts
 const filteredPrompts = prompts.filter((prompt) => {
 // Category filter
 if (selectedCategory !== 'all' && prompt.category !== selectedCategory) {
 return false;
 }

 // Search filter
 if (searchQuery) {
 const query = searchQuery.toLowerCase();
 return (
 prompt.name.toLowerCase().includes(query) ||
 prompt.id.toLowerCase().includes(query) ||
 prompt.author.toLowerCase().includes(query)
 );
 }

 return true;
 });

 // Get unique categories
 const categories = ['all', ...new Set(prompts.map((p) => p.category))];

 return (
 <>
 {/* Header */}
 <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex-shrink-0">
 <div className="flex items-center justify-between mb-2">
 <div>
 <h3 className="text-[#c9a227] text-sm font-semibold">Community Prompts</h3>
 <p className="text-gray-500 text-xs">
 {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''} available • Import to use
 </p>
 </div>
 <button
 onClick={() => loadPrompts(true)}
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
 placeholder="Search prompts..."
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
 Loading community prompts...
 </div>
 ) : error ? (
 <div className="px-3 py-8 text-center">
 <p className="text-red-400 text-sm mb-3">❌ {error}</p>
 <button
 onClick={() => loadPrompts(true)}
 className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded transition-colors"
 >
 Try Again
 </button>
 </div>
 ) : filteredPrompts.length === 0 ? (
 <div className="px-3 py-8 text-center text-gray-500 text-xs">
 {searchQuery || selectedCategory !== 'all'
 ? `No prompts match your filters`
 : 'No community prompts available'}
 </div>
 ) : (
 <div className="divide-y divide-gray-800">
 {filteredPrompts.map((prompt) => {
 const isExpanded = expandedPrompt === prompt.id;
 const details = promptDetails.get(prompt.id);
 const isImported = importedPromptIds.has(prompt.id);

 return (
 <div key={prompt.id} className="bg-gray-900/30">
 {/* Prompt header */}
 <button
 onClick={() => handleTogglePrompt(prompt.id)}
 className="w-full px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h4 className="text-sm font-medium text-gray-200 truncate">
 {prompt.name}
 </h4>
 <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-900/50 text-purple-300">
 {prompt.category}
 </span>
 </div>
 <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
 <span>by @{prompt.author}</span>
 {prompt.votes > 0 && (
 <span className="flex items-center gap-0.5">
 👍 {prompt.votes}
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

 {/* Prompt details (expanded) */}
 {isExpanded && (
 <div className="px-3 py-3 bg-gray-900/50 border-t border-gray-800 text-xs">
 {loadingPromptId === prompt.id ? (
 <div className="flex items-center justify-center py-6 text-gray-500">
 <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
 </svg>
 Loading details...
 </div>
 ) : promptLoadError ? (
 <>
 <div className="px-3 py-2 mb-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs">
 ⚠️ {promptLoadError}
 </div>
 <button
 onClick={() => handleImportPrompt(prompt.id)}
 disabled={isImported}
 className={`w-full px-3 py-1.5 rounded font-medium transition-colors ${
 isImported
 ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
 : 'bg-[#c9a227] hover:bg-[#d4b030] text-gray-900'
 }`}
 >
 {isImported ? '✓ Already Imported' : 'Import to Test Battery'}
 </button>
 </>
 ) : details ? (
 <>
 <p className="text-gray-400 mb-3">{details.description}</p>

 {/* Prompt content */}
 <div className="mb-3">
 <div className="text-gray-500 font-medium mb-1">Prompt Content:</div>
 <div className="px-2 py-2 bg-gray-800/50 rounded text-gray-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
 {details.content}
 </div>
 </div>

 {/* Expected detections */}
 {details.expectedDetections && details.expectedDetections.length > 0 && (
 <div className="mb-3">
 <div className="text-gray-500 font-medium mb-1">Expected Detections:</div>
 <div className="flex flex-wrap gap-1">
 {details.expectedDetections.map((detection) => (
 <span key={detection} className="px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded text-[10px]">
 {detection}
 </span>
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
 {details.references.map((ref, i) => {
 const isSafeUrl = /^https?:\/\//i.test(ref);
 return isSafeUrl ? (
 <a
 key={i}
 href={ref}
 target="_blank"
 rel="noopener noreferrer"
 className="block text-[#c9a227] hover:text-[#d4b030] underline truncate"
 >
 {ref}
 </a>
 ) : (
 <span key={i} className="block text-gray-500 truncate">{ref}</span>
 );
 })}
 </div>
 </div>
 )}

 {/* Import button */}
 <button
 onClick={() => handleImportPrompt(prompt.id)}
 disabled={isImported}
 className={`w-full px-3 py-1.5 rounded font-medium transition-colors ${
 isImported
 ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
 : 'bg-[#c9a227] hover:bg-[#d4b030] text-gray-900'
 }`}
 >
 {isImported ? '✓ Already Imported' : 'Import to Test Battery'}
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
 href="https://github.com/peterhanily/forensicate.ai/tree/main/community-prompts"
 target="_blank"
 rel="noopener noreferrer"
 className="text-[#c9a227] hover:text-[#d4b030] underline"
 >
 Submit a Prompt
 </a>
 <span>Updated every 24h</span>
 </div>
 </div>
 </>
 );
}
