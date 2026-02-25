import { useState, useEffect, useCallback } from 'react';
import type { RuleSeverity, DetectionRule, RuleCategory } from '@forensicate/scanner';
import { SEVERITY_WEIGHTS } from '@forensicate/scanner';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface RuleModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAddRule: (rule: DetectionRule, categoryId: string) => void;
 categories: RuleCategory[];
 targetCategoryId?: string;
}

interface SectionModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAddSection: (section: Omit<RuleCategory, 'rules'>) => void;
}

// ============================================================================
// Add Rule Modal
// ============================================================================

export function AddRuleModal({
 isOpen,
 onClose,
 onAddRule,
 categories,
 targetCategoryId,
}: RuleModalProps) {
 const [ruleType, setRuleType] = useState<'keyword' | 'regex' | 'heuristic'>('keyword');
 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [severity, setSeverity] = useState<RuleSeverity>('medium');
 const [categoryId, setCategoryId] = useState(targetCategoryId || categories[0]?.id || '');
 const [keywords, setKeywords] = useState('');
 const [pattern, setPattern] = useState('');
 const [flags, setFlags] = useState('gi');
 const [heuristicBody, setHeuristicBody] = useState('');
 const [useCustomWeight, setUseCustomWeight] = useState(false);
 const [customWeight, setCustomWeight] = useState(25);
 const [error, setError] = useState('');

 // Sync categoryId with targetCategoryId when modal opens or target changes
 useEffect(() => {
 if (isOpen && targetCategoryId) {
 // This is a controlled sync from props - pattern is intentional
 setCategoryId(targetCategoryId); // eslint-disable-line
 }
 }, [isOpen, targetCategoryId]);

 const resetForm = useCallback(() => {
 setRuleType('keyword');
 setName('');
 setDescription('');
 setSeverity('medium');
 setCategoryId(targetCategoryId || categories[0]?.id || '');
 setKeywords('');
 setPattern('');
 setFlags('gi');
 setHeuristicBody('');
 setUseCustomWeight(false);
 setCustomWeight(25);
 setError('');
 }, [targetCategoryId, categories]);

 const handleClose = useCallback(() => {
 resetForm();
 onClose();
 }, [resetForm, onClose]);

 // Close on Escape key
 useEscapeKey(isOpen, handleClose);

 // Trap focus within modal
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 const validateRegex = (pattern: string, flags: string): boolean => {
 try {
 new RegExp(pattern, flags);
 return true;
 } catch {
 return false;
 }
 };

 const handleSubmit = () => {
 setError('');

 if (!name.trim()) {
 setError('Rule name is required');
 return;
 }

 if (!description.trim()) {
 setError('Description is required');
 return;
 }

 if (!categoryId) {
 setError('Please select a category');
 return;
 }

 if (ruleType === 'keyword') {
 const keywordList = keywords
 .split('\n')
 .map(k => k.trim())
 .filter(k => k.length > 0);

 if (keywordList.length === 0) {
 setError('At least one keyword is required');
 return;
 }

 const rule: DetectionRule = {
 id: `custom-kw-${Date.now()}`,
 name: name.trim(),
 description: description.trim(),
 type: 'keyword',
 severity,
 enabled: true,
 keywords: keywordList,
 ...(useCustomWeight ? { weight: customWeight } : {}),
 };

 onAddRule(rule, categoryId);
 } else if (ruleType === 'regex') {
 if (!pattern.trim()) {
 setError('Regex pattern is required');
 return;
 }

 if (!validateRegex(pattern, flags)) {
 setError('Invalid regex pattern');
 return;
 }

 const rule: DetectionRule = {
 id: `custom-rx-${Date.now()}`,
 name: name.trim(),
 description: description.trim(),
 type: 'regex',
 severity,
 enabled: true,
 pattern: pattern.trim(),
 flags: flags.trim() || undefined,
 ...(useCustomWeight ? { weight: customWeight } : {}),
 };

 onAddRule(rule, categoryId);
 } else {
 if (!heuristicBody.trim()) {
 setError('Function body is required');
 return;
 }

 try {
 // Dynamic function creation needed for user-defined heuristics
 const fn = new Function('text', heuristicBody.trim()) as (text: string) => import('@forensicate/scanner').HeuristicResult | null;
 // Validate: test with empty string to check it doesn't throw
 fn('');

 const rule: DetectionRule = {
 id: `custom-hr-${Date.now()}`,
 name: name.trim(),
 description: description.trim(),
 type: 'heuristic',
 severity,
 enabled: true,
 heuristic: fn,
 ...(useCustomWeight ? { weight: customWeight } : {}),
 };

 onAddRule(rule, categoryId);
 } catch (e) {
 setError(`Invalid function: ${e instanceof Error ? e.message : 'syntax error'}`);
 return;
 }
 }

 handleClose();
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 {/* Modal */}
 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
 <h3 className="text-lg font-semibold text-[#c9a227]">Add Detection Rule</h3>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 {/* Body */}
 <div className="p-4 space-y-4">
 {/* Rule Type Selection */}
 <div>
 <label className="block text-sm text-gray-400 mb-2">Rule Type</label>
 <div className="flex gap-2">
 <button
 type="button"
 onClick={() => setRuleType('keyword')}
 className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
 ruleType === 'keyword'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
 }`}
 >
 <span className="mr-1">🔤</span> Keyword
 </button>
 <button
 type="button"
 onClick={() => setRuleType('regex')}
 className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
 ruleType === 'regex'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
 }`}
 >
 <span className="mr-1">⚡</span> Regex
 </button>
 <button
 type="button"
 onClick={() => setRuleType('heuristic')}
 className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
 ruleType === 'heuristic'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
 }`}
 >
 <span className="mr-1">🧠</span> Heuristic
 </button>
 </div>
 </div>

 {/* Category Selection */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Category</label>
 <select
 value={categoryId}
 onChange={(e) => setCategoryId(e.target.value)}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227]"
 >
 {categories.map(cat => (
 <option key={cat.id} value={cat.id}>{cat.name}</option>
 ))}
 </select>
 </div>

 {/* Rule Name */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Rule Name</label>
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g., Custom Jailbreak Pattern"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Description */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Description</label>
 <input
 type="text"
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="What does this rule detect?"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Severity */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Severity</label>
 <div className="flex gap-2">
 {(['low', 'medium', 'high', 'critical'] as RuleSeverity[]).map((sev) => (
 <button
 key={sev}
 type="button"
 onClick={() => setSeverity(sev)}
 className={`flex-1 px-2 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
 severity === sev
 ? sev === 'critical' ? 'bg-red-600 text-white' :
 sev === 'high' ? 'bg-orange-600 text-white' :
 sev === 'medium' ? 'bg-yellow-600 text-gray-900' :
 'bg-green-600 text-white'
 : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
 }`}
 >
 {sev}
 </button>
 ))}
 </div>
 </div>

 {/* Confidence Weight */}
 <div>
 <div className="flex items-center justify-between mb-1">
 <label className="block text-sm text-gray-400">Confidence Weight</label>
 <label className="flex items-center gap-1.5 cursor-pointer">
 <span className="text-xs text-gray-500">Custom</span>
 <div className="relative">
 <input
 type="checkbox"
 checked={useCustomWeight}
 onChange={(e) => setUseCustomWeight(e.target.checked)}
 className="sr-only"
 />
 <div className={`w-6 h-3 rounded-full transition-colors ${useCustomWeight ? 'bg-[#c9a227]' : 'bg-gray-700'}`}>
 <div className={`w-2 h-2 rounded-full bg-white shadow-sm transform transition-transform ${useCustomWeight ? 'translate-x-[13px]' : 'translate-x-[2px]'} translate-y-[2px]`} />
 </div>
 </div>
 </label>
 </div>
 {useCustomWeight ? (
 <div className="flex items-center gap-3">
 <input
 type="range"
 min="1"
 max="100"
 value={customWeight}
 onChange={(e) => setCustomWeight(Number(e.target.value))}
 className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c9a227] [&::-webkit-slider-thumb]:cursor-pointer"
 />
 <span className="text-sm font-mono text-[#c9a227] w-8 text-right">{customWeight}</span>
 </div>
 ) : (
 <div className="text-xs text-gray-500">
 Auto from severity: <span className="text-[#c9a227] font-mono">{SEVERITY_WEIGHTS[severity]}</span> pts
 </div>
 )}
 </div>

 {/* Keyword-specific fields */}
 {ruleType === 'keyword' && (
 <div>
 <label className="block text-sm text-gray-400 mb-1">Keywords (one per line)</label>
 <textarea
 value={keywords}
 onChange={(e) => setKeywords(e.target.value)}
 placeholder="ignore previous instructions&#10;forget all rules&#10;new instructions:"
 rows={5}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 <p className="text-xs text-gray-500 mt-1">Keywords are matched case-insensitively</p>
 </div>
 )}

 {/* Regex-specific fields */}
 {ruleType === 'regex' && (
 <>
 <div>
 <label className="block text-sm text-gray-400 mb-1">Regex Pattern</label>
 <textarea
 value={pattern}
 onChange={(e) => setPattern(e.target.value)}
 placeholder="ignore\s+(all\s+)?(previous|prior)\s+instructions?"
 rows={3}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 </div>
 <div>
 <label className="block text-sm text-gray-400 mb-1">Flags</label>
 <input
 type="text"
 value={flags}
 onChange={(e) => setFlags(e.target.value)}
 placeholder="gi"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 <p className="text-xs text-gray-500 mt-1">
 Common flags: g (global), i (case-insensitive), m (multiline)
 </p>
 </div>
 </>
 )}

 {/* Heuristic-specific fields */}
 {ruleType === 'heuristic' && (
 <div>
 <label className="block text-sm text-gray-400 mb-1">Function Body</label>
 <p className="text-xs text-gray-500 mb-2">
 Write JavaScript that receives <code className="text-cyan-400">text</code> (string) and returns
 {' '}<code className="text-cyan-400">{'{ matched: true, details: "...", confidence: 0-100 }'}</code> or <code className="text-cyan-400">null</code>.
 </p>
 <textarea
 value={heuristicBody}
 onChange={(e) => setHeuristicBody(e.target.value)}
 placeholder={`// Example: flag prompts over 500 chars with "ignore"\nconst lower = text.toLowerCase();\nif (text.length > 500 && lower.includes("ignore")) {\n return {\n matched: true,\n details: "Long prompt with suspicious keyword",\n confidence: 60\n };\n}\nreturn null;`}
 rows={10}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-xs font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 <div className="flex items-start gap-2 mt-2 px-3 py-2 bg-amber-900/20 border border-amber-700/50 rounded text-xs text-amber-300">
 <span className="mt-0.5 shrink-0">&#9888;</span>
 <span>
 <strong>Security notice:</strong> Heuristic rules execute JavaScript in your browser via <code className="text-amber-200">new Function()</code>.
 Only add code you understand and trust. Never paste code from untrusted sources.
 </span>
 </div>
 </div>
 )}

 {/* Error Message */}
 {error && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {error}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700 bg-gray-800/30">
 <button
 onClick={handleClose}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSubmit}
 className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors"
 >
 Add Rule
 </button>
 </div>
 </div>
 </div>
 );
}

// ============================================================================
// Add Section Modal
// ============================================================================

export function AddSectionModal({
 isOpen,
 onClose,
 onAddSection,
}: SectionModalProps) {
 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [error, setError] = useState('');

 const resetForm = useCallback(() => {
 setName('');
 setDescription('');
 setError('');
 }, []);

 const handleClose = useCallback(() => {
 resetForm();
 onClose();
 }, [resetForm, onClose]);

 // Close on Escape key
 useEscapeKey(isOpen, handleClose);

 // Trap focus within modal
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 const handleSubmit = () => {
 setError('');

 if (!name.trim()) {
 setError('Section name is required');
 return;
 }

 if (!description.trim()) {
 setError('Description is required');
 return;
 }

 const section: Omit<RuleCategory, 'rules'> = {
 id: `custom-section-${Date.now()}`,
 name: name.trim(),
 description: description.trim(),
 isCustom: true,
 };

 onAddSection(section);
 handleClose();
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 {/* Modal */}
 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
 <h3 className="text-lg font-semibold text-[#c9a227]">Add Rule Section</h3>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 {/* Body */}
 <div className="p-4 space-y-4">
 {/* Section Name */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Section Name</label>
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g., Custom Attack Patterns"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Description */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Description</label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="What types of rules will this section contain?"
 rows={3}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 </div>

 {/* Error Message */}
 {error && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {error}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700 bg-gray-800/30">
 <button
 onClick={handleClose}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSubmit}
 className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors"
 >
 Add Section
 </button>
 </div>
 </div>
 </div>
 );
}

// ============================================================================
// Rule Logic / Edit Modal
// ============================================================================

interface RuleLogicModalProps {
 isOpen: boolean;
 onClose: () => void;
 rule: DetectionRule | null;
 onSave?: (updatedRule: DetectionRule) => void;
}

export function RuleLogicModal({ isOpen, onClose, rule, onSave }: RuleLogicModalProps) {
 const [isEditing, setIsEditing] = useState(false);
 const [editName, setEditName] = useState('');
 const [editDescription, setEditDescription] = useState('');
 const [editSeverity, setEditSeverity] = useState<RuleSeverity>('medium');
 const [editKeywords, setEditKeywords] = useState('');
 const [editPattern, setEditPattern] = useState('');
 const [editFlags, setEditFlags] = useState('');
 const [editUseCustomWeight, setEditUseCustomWeight] = useState(false);
 const [editCustomWeight, setEditCustomWeight] = useState(25);
 const [editError, setEditError] = useState('');

 const startEditing = useCallback(() => {
 if (!rule) return;
 setEditName(rule.name);
 setEditDescription(rule.description);
 setEditSeverity(rule.severity);
 setEditKeywords(rule.keywords?.join('\n') || '');
 setEditPattern(rule.pattern || '');
 setEditFlags(rule.flags || 'gi');
 setEditUseCustomWeight(rule.weight != null);
 setEditCustomWeight(rule.weight ?? SEVERITY_WEIGHTS[rule.severity]);
 setEditError('');
 setIsEditing(true);
 }, [rule]);

 const cancelEditing = useCallback(() => {
 setIsEditing(false);
 setEditError('');
 }, []);

 const handleClose = useCallback(() => {
 setIsEditing(false);
 setEditError('');
 onClose();
 }, [onClose]);

 const handleSave = useCallback(() => {
 if (!rule || !onSave) return;
 setEditError('');

 if (!editName.trim()) {
 setEditError('Rule name is required');
 return;
 }
 if (!editDescription.trim()) {
 setEditError('Description is required');
 return;
 }

 const updated: DetectionRule = {
 ...rule,
 name: editName.trim(),
 description: editDescription.trim(),
 severity: editSeverity,
 weight: editUseCustomWeight ? editCustomWeight : undefined,
 };

 if (rule.type === 'keyword') {
 const keywordList = editKeywords.split('\n').map(k => k.trim()).filter(k => k.length > 0);
 if (keywordList.length === 0) {
 setEditError('At least one keyword is required');
 return;
 }
 updated.keywords = keywordList;
 } else if (rule.type === 'regex') {
 if (!editPattern.trim()) {
 setEditError('Regex pattern is required');
 return;
 }
 try {
 new RegExp(editPattern, editFlags);
 } catch {
 setEditError('Invalid regex pattern');
 return;
 }
 updated.pattern = editPattern.trim();
 updated.flags = editFlags.trim() || undefined;
 }

 onSave(updated);
 setIsEditing(false);
 }, [rule, onSave, editName, editDescription, editSeverity, editKeywords, editPattern, editFlags, editUseCustomWeight, editCustomWeight]);

 // Close on Escape key
 useEscapeKey(isOpen, handleClose);

 // Trap focus within modal
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 if (!isOpen || !rule) return null;

 const getTypeLabel = (type: string) => {
 switch (type) {
 case 'keyword': return 'Keyword Detection';
 case 'regex': return 'Regular Expression';
 case 'heuristic': return 'Heuristic Analysis';
 default: return type;
 }
 };

 const getSeverityColor = (severity: string) => {
 switch (severity) {
 case 'critical': return 'text-red-400 bg-red-900/30';
 case 'high': return 'text-orange-400 bg-orange-900/30';
 case 'medium': return 'text-yellow-400 bg-yellow-900/30';
 case 'low': return 'text-green-400 bg-green-900/30';
 default: return 'text-gray-400 bg-gray-900/30';
 }
 };

 // Built-in heuristic IDs that cannot have their logic edited
 const builtInHeuristicIds = ['h-entropy-analysis', 'h-token-ratio', 'h-nested-delimiters', 'h-language-switch', 'nlp-sentiment-manipulation', 'nlp-pos-imperative', 'nlp-entity-impersonation', 'nlp-sentence-structure'];
 const isBuiltInHeuristic = rule.type === 'heuristic' && builtInHeuristicIds.includes(rule.id);

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 {/* Modal */}
 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
 <div className="flex items-center gap-2">
 <h3 className="text-lg font-semibold text-[#c9a227]">
 {isEditing ? 'Edit Rule' : 'Detection Logic'}
 </h3>
 <span className={`px-2 py-0.5 text-xs rounded ${getSeverityColor(isEditing ? editSeverity : rule.severity)}`}>
 {isEditing ? editSeverity : rule.severity}
 </span>
 </div>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 {/* Body */}
 <div className="p-4 overflow-y-auto flex-1 space-y-4">
 {isEditing ? (
 /* ======== EDIT MODE ======== */
 <>
 {/* Name */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Rule Name</label>
 <input
 type="text"
 value={editName}
 onChange={(e) => setEditName(e.target.value)}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Description */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Description</label>
 <input
 type="text"
 value={editDescription}
 onChange={(e) => setEditDescription(e.target.value)}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Severity */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Severity</label>
 <div className="flex gap-2">
 {(['low', 'medium', 'high', 'critical'] as RuleSeverity[]).map((sev) => (
 <button
 key={sev}
 type="button"
 onClick={() => setEditSeverity(sev)}
 className={`flex-1 px-2 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
 editSeverity === sev
 ? sev === 'critical' ? 'bg-red-600 text-white' :
 sev === 'high' ? 'bg-orange-600 text-white' :
 sev === 'medium' ? 'bg-yellow-600 text-gray-900' :
 'bg-green-600 text-white'
 : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
 }`}
 >
 {sev}
 </button>
 ))}
 </div>
 </div>

 {/* Weight */}
 <div>
 <div className="flex items-center justify-between mb-1">
 <label className="block text-sm text-gray-400">Confidence Weight</label>
 <label className="flex items-center gap-1.5 cursor-pointer">
 <span className="text-xs text-gray-500">Custom</span>
 <div className="relative">
 <input
 type="checkbox"
 checked={editUseCustomWeight}
 onChange={(e) => setEditUseCustomWeight(e.target.checked)}
 className="sr-only"
 />
 <div className={`w-6 h-3 rounded-full transition-colors ${editUseCustomWeight ? 'bg-[#c9a227]' : 'bg-gray-700'}`}>
 <div className={`w-2 h-2 rounded-full bg-white shadow-sm transform transition-transform ${editUseCustomWeight ? 'translate-x-[13px]' : 'translate-x-[2px]'} translate-y-[2px]`} />
 </div>
 </div>
 </label>
 </div>
 {editUseCustomWeight ? (
 <div className="flex items-center gap-3">
 <input
 type="range"
 min="1"
 max="100"
 value={editCustomWeight}
 onChange={(e) => setEditCustomWeight(Number(e.target.value))}
 className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c9a227] [&::-webkit-slider-thumb]:cursor-pointer"
 />
 <span className="text-sm font-mono text-[#c9a227] w-8 text-right">{editCustomWeight}</span>
 </div>
 ) : (
 <div className="text-xs text-gray-500">
 Auto from severity: <span className="text-[#c9a227] font-mono">{SEVERITY_WEIGHTS[editSeverity]}</span> pts
 </div>
 )}
 </div>

 {/* Type-specific editable fields */}
 {rule.type === 'keyword' && (
 <div>
 <label className="block text-sm text-gray-400 mb-1">Keywords (one per line)</label>
 <textarea
 value={editKeywords}
 onChange={(e) => setEditKeywords(e.target.value)}
 rows={6}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 <p className="text-xs text-gray-500 mt-1">Keywords are matched case-insensitively</p>
 </div>
 )}

 {rule.type === 'regex' && (
 <>
 <div>
 <label className="block text-sm text-gray-400 mb-1">Regex Pattern</label>
 <textarea
 value={editPattern}
 onChange={(e) => setEditPattern(e.target.value)}
 rows={3}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 </div>
 <div>
 <label className="block text-sm text-gray-400 mb-1">Flags</label>
 <input
 type="text"
 value={editFlags}
 onChange={(e) => setEditFlags(e.target.value)}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>
 </>
 )}

 {rule.type === 'heuristic' && isBuiltInHeuristic && (
 <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-3 border border-gray-700">
 Heuristic logic for built-in rules is read-only. You can edit the name, description, severity, and weight.
 </div>
 )}

 {editError && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {editError}
 </div>
 )}
 </>
 ) : (
 /* ======== VIEW MODE ======== */
 <>
 {/* Rule Info */}
 <div>
 <h4 className="text-white font-medium">{rule.name}</h4>
 <p className="text-gray-400 text-sm mt-1">{rule.description}</p>
 {rule.weight != null && (
 <p className="text-xs text-gray-500 mt-1">
 Custom weight: <span className="text-[#c9a227] font-mono">{rule.weight}</span> pts
 </p>
 )}
 </div>

 {/* Detection Type */}
 <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
 <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Detection Type</div>
 <div className="text-[#c9a227] font-medium">{getTypeLabel(rule.type)}</div>
 </div>

 {/* Detection Logic */}
 <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
 <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Detection Logic</div>

 {rule.type === 'keyword' && rule.keywords && (
 <div className="space-y-2">
 <p className="text-gray-400 text-sm">
 Matches if any of the following keywords are found (case-insensitive):
 </p>
 <div className="bg-gray-900 rounded p-2 max-h-48 overflow-y-auto">
 <code className="text-xs text-green-400 font-mono whitespace-pre-wrap">
 {rule.keywords.map((kw) => `"${kw}"`).join('\n')}
 </code>
 </div>
 <p className="text-gray-500 text-xs">
 {rule.keywords.length} keyword{rule.keywords.length !== 1 ? 's' : ''} configured
 </p>
 </div>
 )}

 {rule.type === 'regex' && rule.pattern && (
 <div className="space-y-2">
 <p className="text-gray-400 text-sm">
 Matches text against the following regular expression:
 </p>
 <div className="bg-gray-900 rounded p-2 overflow-x-auto">
 <code className="text-xs text-purple-400 font-mono break-all">
 /{rule.pattern}/{rule.flags || ''}
 </code>
 </div>
 {rule.flags && (
 <p className="text-gray-500 text-xs">
 Flags: {rule.flags.split('').map(f => {
 switch(f) {
 case 'g': return 'global';
 case 'i': return 'case-insensitive';
 case 'm': return 'multiline';
 case 'u': return 'unicode';
 default: return f;
 }
 }).join(', ')}
 </p>
 )}
 </div>
 )}

 {rule.type === 'heuristic' && (
 <div className="space-y-2">
 <p className="text-gray-400 text-sm">
 Uses algorithmic analysis to detect patterns that keyword and regex rules cannot:
 </p>
 <div className="bg-gray-900 rounded p-3 space-y-2">
 {rule.id === 'h-entropy-analysis' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Shannon Entropy Sliding Window</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Calculates Shannon entropy across 64-character sliding windows (step size 32).
 High entropy (&gt;4.5 bits/char) in 30%+ of windows with at least 2 matches
 suggests base64, hex, or other encoded payloads hidden in the prompt.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Window size: 64 chars | Step: 32 chars</div>
 <div>Entropy threshold: 4.5 bits/char</div>
 <div>Trigger: &ge;30% high-entropy windows, min 2 matches</div>
 </div>
 </>
 )}
 {rule.id === 'h-token-ratio' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Imperative Verb Density</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Counts imperative/command verbs (ignore, bypass, reveal, obey, pretend, etc.)
 relative to total word count. Injection prompts have abnormally high density of
 instruction verbs compared to normal text.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Verb dictionary: 40+ imperative verbs</div>
 <div>Trigger: &ge;8% density, min 3 imperative verbs</div>
 <div>Min text length: 10 words</div>
 </div>
 </>
 )}
 {rule.id === 'h-nested-delimiters' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Nested Delimiter Detection</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Scans for 9 distinct delimiter types: square brackets, curly braces, angle brackets,
 triple backticks, triple quotes, XML tags, hash sections, pipes, and parenthetical blocks.
 3+ types in one prompt suggests a framing/context manipulation attack.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Delimiter types checked: 9</div>
 <div>Trigger: &ge;3 distinct delimiter types present</div>
 </div>
 </>
 )}
 {rule.id === 'h-language-switch' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Unicode Script Mixing</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Detects mixing of Unicode scripts (Latin, Cyrillic, Greek, Arabic, CJK, Devanagari, Hebrew)
 within words or across the prompt. Mixed-script words suggest homoglyph obfuscation
 where visually similar characters from different scripts bypass text matching.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Scripts checked: 7 Unicode ranges</div>
 <div>Trigger: &ge;2 mixed-script words OR &ge;3 scripts with confusable pair</div>
 <div>Min text length: 20 chars</div>
 </div>
 </>
 )}
 {rule.id === 'nlp-sentiment-manipulation' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">AFINN-165 Sentiment Analysis</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Scores each word against the AFINN-165 lexicon (~2,400 words, scores -5 to +5).
 Calculates average sentiment across all scored words. Negative/coercive language
 patterns common in injection prompts (threats, urgency, manipulation) produce
 strongly negative averages.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Lexicon: AFINN-165 (~2,400 words)</div>
 <div>Trigger: avg sentiment &le;-1.5, min 3 negative words</div>
 <div>Min text length: 5 words</div>
 </div>
 </>
 )}
 {rule.id === 'nlp-pos-imperative' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">POS Imperative Sentence Detection</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Uses compromise.js NLP to tag parts-of-speech for each sentence's first word.
 Sentences starting with a verb (not copula/modal) are classified as imperative.
 Injection prompts typically contain many imperative commands: "Ignore X", "Show Y",
 "Delete Z".
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>NLP library: compromise.js (POS tagger)</div>
 <div>Trigger: &ge;40% imperative sentences, min 3</div>
 <div>Min sentences: 3</div>
 </div>
 </>
 )}
 {rule.id === 'nlp-entity-impersonation' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Authority Entity Impersonation</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Combines compromise.js NER (organization/person detection) with keyword matching
 for authority entities (system, developer, OpenAI, admin, etc.) and impersonation
 context phrases ("I am", "speaking as", "message from"). Detects attempts to
 claim authority or impersonate system components.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Authority entities: 16 keywords + NER orgs/people</div>
 <div>Context phrases: 12 impersonation patterns</div>
 <div>Trigger: authority entity + impersonation context</div>
 </div>
 </>
 )}
 {rule.id === 'nlp-sentence-structure' && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Sentence Structure Anomaly</div>
 <p className="text-gray-400 text-xs leading-relaxed">
 Analyzes sentence length distribution and verb-initial patterns using compromise.js.
 Injection prompts tend to be composed of many short, imperative sentences
 ("Do this. Stop that. Ignore rules.") unlike natural conversation which mixes
 sentence lengths and types.
 </p>
 <div className="text-gray-600 text-[10px] font-mono space-y-0.5">
 <div>Short sentence threshold: &lt;8 words</div>
 <div>Trigger: &ge;60% short sentences, &ge;3 short imperatives</div>
 <div>Min sentences: 4</div>
 </div>
 </>
 )}
 {!builtInHeuristicIds.includes(rule.id) && rule.heuristic && (
 <>
 <div className="text-cyan-400 text-xs font-medium">Custom Heuristic Function</div>
 <div className="bg-gray-950 rounded p-2 overflow-x-auto max-h-48">
 <code className="text-[10px] text-green-400 font-mono whitespace-pre-wrap">
 {rule.heuristic.toString()}
 </code>
 </div>
 </>
 )}
 </div>
 </div>
 )}
 </div>
 </>
 )}
 </div>

 {/* Footer */}
 <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/30 flex-shrink-0">
 {isEditing ? (
 <div className="flex justify-end gap-2">
 <button
 onClick={cancelEditing}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSave}
 className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors"
 >
 Save Changes
 </button>
 </div>
 ) : (
 <div className="flex gap-2">
 {onSave && (
 <button
 onClick={startEditing}
 className="flex-1 px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors flex items-center justify-center gap-1.5"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
 </svg>
 Edit Rule
 </button>
 )}
 <button
 onClick={handleClose}
 className={`${onSave ? 'flex-1' : 'w-full'} px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded transition-colors`}
 >
 Close
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 );
}

// ============================================================================
// Add Prompt Modal
// ============================================================================

interface AddPromptModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAddPrompt: (prompt: { name: string; content: string; tags: string[] }, categoryId: string) => void;
 categories: { id: string; name: string }[];
 targetCategoryId?: string;
}

export function AddPromptModal({
 isOpen,
 onClose,
 onAddPrompt,
 categories,
 targetCategoryId,
}: AddPromptModalProps) {
 const [name, setName] = useState('');
 const [content, setContent] = useState('');
 const [tagsText, setTagsText] = useState('');
 const [categoryId, setCategoryId] = useState(targetCategoryId || categories[0]?.id || '');
 const [error, setError] = useState('');

 // Sync categoryId with targetCategoryId when modal opens or target changes
 useEffect(() => {
 if (isOpen && targetCategoryId) {
 // This is a controlled sync from props - pattern is intentional
 setCategoryId(targetCategoryId); // eslint-disable-line
 }
 }, [isOpen, targetCategoryId]);

 const resetForm = useCallback(() => {
 setName('');
 setContent('');
 setTagsText('');
 setCategoryId(targetCategoryId || categories[0]?.id || '');
 setError('');
 }, [targetCategoryId, categories]);

 const handleClose = useCallback(() => {
 resetForm();
 onClose();
 }, [resetForm, onClose]);

 // Close on Escape key
 useEscapeKey(isOpen, handleClose);

 // Trap focus within modal
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 const handleSubmit = () => {
 setError('');

 if (!name.trim()) {
 setError('Prompt name is required');
 return;
 }

 if (!content.trim()) {
 setError('Prompt content is required');
 return;
 }

 if (!categoryId) {
 setError('Please select a category');
 return;
 }

 const tags = tagsText
 .split(',')
 .map(t => t.trim().toLowerCase())
 .filter(t => t.length > 0);

 onAddPrompt({ name: name.trim(), content: content.trim(), tags }, categoryId);
 handleClose();
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
 <h3 className="text-lg font-semibold text-[#c9a227]">Add Test Prompt</h3>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="p-4 space-y-4">
 <div>
 <label className="block text-sm text-gray-400 mb-1">Category</label>
 <select
 value={categoryId}
 onChange={(e) => setCategoryId(e.target.value)}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227]"
 >
 {categories.map(cat => (
 <option key={cat.id} value={cat.id}>{cat.name}</option>
 ))}
 </select>
 </div>

 <div>
 <label className="block text-sm text-gray-400 mb-1">Prompt Name</label>
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g., Custom Injection Test"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 <div>
 <label className="block text-sm text-gray-400 mb-1">Prompt Content</label>
 <textarea
 value={content}
 onChange={(e) => setContent(e.target.value)}
 placeholder="Enter the prompt text to test..."
 rows={6}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 </div>

 <div>
 <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
 <input
 type="text"
 value={tagsText}
 onChange={(e) => setTagsText(e.target.value)}
 placeholder="e.g., injection, test, custom"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {error && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {error}
 </div>
 )}
 </div>

 <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700 bg-gray-800/30">
 <button
 onClick={handleClose}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSubmit}
 className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors"
 >
 Add Prompt
 </button>
 </div>
 </div>
 </div>
 );
}

// ============================================================================
// Add Prompt Section Modal
// ============================================================================

interface AddPromptSectionModalProps {
 isOpen: boolean;
 onClose: () => void;
 onAddSection: (section: { name: string; description: string; source: string }) => void;
}

export function AddPromptSectionModal({
 isOpen,
 onClose,
 onAddSection,
}: AddPromptSectionModalProps) {
 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [source, setSource] = useState('');
 const [error, setError] = useState('');

 const resetForm = useCallback(() => {
 setName('');
 setDescription('');
 setSource('');
 setError('');
 }, []);

 const handleClose = useCallback(() => {
 resetForm();
 onClose();
 }, [resetForm, onClose]);

 // Close on Escape key
 useEscapeKey(isOpen, handleClose);

 // Trap focus within modal
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 const handleSubmit = () => {
 setError('');

 if (!name.trim()) {
 setError('Section name is required');
 return;
 }

 if (!description.trim()) {
 setError('Description is required');
 return;
 }

 onAddSection({
 name: name.trim(),
 description: description.trim(),
 source: source.trim() || 'custom',
 });
 handleClose();
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4">
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
 <h3 className="text-lg font-semibold text-[#c9a227]">Add Prompt Section</h3>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="p-4 space-y-4">
 <div>
 <label className="block text-sm text-gray-400 mb-1">Section Name</label>
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g., Custom Test Prompts"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 <div>
 <label className="block text-sm text-gray-400 mb-1">Description</label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="What types of prompts will this section contain?"
 rows={3}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 </div>

 <div>
 <label className="block text-sm text-gray-400 mb-1">Source (optional)</label>
 <input
 type="text"
 value={source}
 onChange={(e) => setSource(e.target.value)}
 placeholder="e.g., github/user/repo or custom"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {error && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {error}
 </div>
 )}
 </div>

 <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700 bg-gray-800/30">
 <button
 onClick={handleClose}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSubmit}
 className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors"
 >
 Add Section
 </button>
 </div>
 </div>
 </div>
 );
}

// ============================================================================
// Save Prompt Modal (from input box to test battery)
// ============================================================================

interface SavePromptModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSavePrompt: (prompt: { name: string; content: string; tags: string[] }, categoryId: string) => void;
 onCreateSection: (section: { id?: string; name: string; description: string; source: string }, initialPrompt?: { name: string; content: string; tags: string[] }) => string | void;
 categories: { id: string; name: string }[];
 initialContent: string;
}

export function SavePromptModal({
 isOpen,
 onClose,
 onSavePrompt,
 onCreateSection,
 categories,
 initialContent,
}: SavePromptModalProps) {
 const [name, setName] = useState('');
 const [content, setContent] = useState('');
 const [tagsText, setTagsText] = useState('');
 const [categoryId, setCategoryId] = useState('');
 const [newSectionName, setNewSectionName] = useState('');
 const [newSectionDesc, setNewSectionDesc] = useState('');
 const [error, setError] = useState('');

 const isNewSection = categoryId === '__new__';

 // Initialize content when modal opens
 useEffect(() => {
 if (isOpen) {
 // Defer setState to avoid synchronous updates in effect
 setTimeout(() => {
 setContent(initialContent);
 setCategoryId(categories[0]?.id || '');
 }, 0);
 }
 }, [isOpen, initialContent, categories]);

 const resetForm = useCallback(() => {
 setName('');
 setContent('');
 setTagsText('');
 setCategoryId(categories[0]?.id || '');
 setNewSectionName('');
 setNewSectionDesc('');
 setError('');
 }, [categories]);

 const handleClose = useCallback(() => {
 resetForm();
 onClose();
 }, [resetForm, onClose]);

 useEscapeKey(isOpen, handleClose);
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 const handleSubmit = () => {
 setError('');

 if (!name.trim()) {
 setError('Prompt name is required');
 return;
 }

 if (!content.trim()) {
 setError('Prompt content is required');
 return;
 }

 const tags = tagsText
 .split(',')
 .map(t => t.trim().toLowerCase())
 .filter(t => t.length > 0);

 if (isNewSection) {
 if (!newSectionName.trim()) {
 setError('Section name is required');
 return;
 }
 if (!newSectionDesc.trim()) {
 setError('Section description is required');
 return;
 }

 // Create the section with the prompt in one operation
 const sectionId = `custom-prompt-section-${Date.now()}`;
 console.log('[SavePromptModal] Creating new section with prompt:', {
 section: {
 id: sectionId,
 name: newSectionName.trim(),
 description: newSectionDesc.trim(),
 source: 'custom',
 },
 prompt: {
 name: name.trim(),
 content: content.trim(),
 tags
 }
 });
 onCreateSection({
 id: sectionId,
 name: newSectionName.trim(),
 description: newSectionDesc.trim(),
 source: 'custom',
 }, {
 name: name.trim(),
 content: content.trim(),
 tags
 });
 } else {
 if (!categoryId) {
 setError('Please select a category');
 return;
 }
 onSavePrompt({ name: name.trim(), content: content.trim(), tags }, categoryId);
 }

 handleClose();
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
 <h3 className="text-lg font-semibold text-[#c9a227]">Save Prompt to Test Battery</h3>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="p-4 space-y-4">
 {/* Prompt Name */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Prompt Name</label>
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 placeholder="e.g., Custom Injection Test"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Content */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Content</label>
 <textarea
 value={content}
 onChange={(e) => setContent(e.target.value)}
 rows={5}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />
 </div>

 {/* Tags */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated, optional)</label>
 <input
 type="text"
 value={tagsText}
 onChange={(e) => setTagsText(e.target.value)}
 placeholder="e.g., injection, test, custom"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>

 {/* Category */}
 <div>
 <label className="block text-sm text-gray-400 mb-1">Save to Section</label>
 <select
 value={categoryId}
 onChange={(e) => setCategoryId(e.target.value)}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227]"
 >
 {categories.map(cat => (
 <option key={cat.id} value={cat.id}>{cat.name}</option>
 ))}
 <option value="__new__">-- New Section --</option>
 </select>
 </div>

 {/* New Section fields */}
 {isNewSection && (
 <div className="space-y-3 pl-3 border-l-2 border-[#c9a227]/30">
 <div>
 <label className="block text-sm text-gray-400 mb-1">Section Name</label>
 <input
 type="text"
 value={newSectionName}
 onChange={(e) => setNewSectionName(e.target.value)}
 placeholder="e.g., My Custom Prompts"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>
 <div>
 <label className="block text-sm text-gray-400 mb-1">Section Description</label>
 <input
 type="text"
 value={newSectionDesc}
 onChange={(e) => setNewSectionDesc(e.target.value)}
 placeholder="What types of prompts will this section contain?"
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm focus:outline-none focus:border-[#c9a227] placeholder-gray-600"
 />
 </div>
 </div>
 )}

 {error && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {error}
 </div>
 )}
 </div>

 <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700 bg-gray-800/30">
 <button
 onClick={handleClose}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSubmit}
 className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 text-sm font-medium rounded transition-colors"
 >
 Save Prompt
 </button>
 </div>
 </div>
 </div>
 );
}

// ============================================================================
// Export/Import Config Modal
// ============================================================================

export interface ImportOptions {
 importRules: boolean;
 importPrompts: boolean;
 mergeMode: 'replace' | 'merge';
}

interface ExportImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onExport: () => string;
 onImport: (configJson: string, options: ImportOptions) => { success: boolean; error?: string; summary?: string };
}

export function ExportImportModal({
 isOpen,
 onClose,
 onExport,
 onImport,
}: ExportImportModalProps) {
 const [mode, setMode] = useState<'export' | 'import'>('export');
 const [importText, setImportText] = useState('');
 const [error, setError] = useState('');
 const [success, setSuccess] = useState('');

 // Import options
 const [importRules, setImportRules] = useState(true);
 const [importPrompts, setImportPrompts] = useState(true);
 const [mergeMode, setMergeMode] = useState<'replace' | 'merge'>('replace');

 // Preview state
 const [previewData, setPreviewData] = useState<{
 hasRules: boolean;
 hasPrompts: boolean;
 ruleCount: number;
 customRuleCount: number;
 promptCount: number;
 customPromptCount: number;
 } | null>(null);

 const resetState = useCallback(() => {
 setMode('export');
 setImportText('');
 setError('');
 setSuccess('');
 setImportRules(true);
 setImportPrompts(true);
 setMergeMode('replace');
 setPreviewData(null);
 }, []);

 const handleClose = useCallback(() => {
 resetState();
 onClose();
 }, [resetState, onClose]);

 // Close on Escape key
 useEscapeKey(isOpen, handleClose);

 // Trap focus within modal
 const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

 const handleExport = () => {
 try {
 const configJson = onExport();
 const blob = new Blob([configJson], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `forensicate-config-${new Date().toISOString().split('T')[0]}.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 setSuccess('Configuration exported successfully!');
 } catch {
 setError('Failed to export configuration');
 }
 };

 // Parse and preview config when text changes
 const parseAndPreview = (text: string) => {
 setImportText(text);
 setError('');
 setPreviewData(null);

 if (!text.trim()) return;

 try {
 const config = JSON.parse(text);

 if (!config.version) {
 setError('Invalid config format: missing version');
 return;
 }

 const hasRules = !!(config.rules?.localRules || config.rules?.customCategories);
 const hasPrompts = !!(config.prompts?.localPrompts || config.prompts?.customPromptCategories);

 const ruleCount = config.rules?.localRules?.length || 0;
 const customRuleCount = config.rules?.customCategories?.reduce(
 (acc: number, cat: { rules?: unknown[] }) => acc + (cat.rules?.length || 0), 0
 ) || 0;
 const promptCount = config.prompts?.localPrompts?.reduce(
 (acc: number, cat: { prompts?: unknown[] }) => acc + (cat.prompts?.length || 0), 0
 ) || 0;
 const customPromptCount = config.prompts?.customPromptCategories?.reduce(
 (acc: number, cat: { prompts?: unknown[] }) => acc + (cat.prompts?.length || 0), 0
 ) || 0;

 setPreviewData({
 hasRules,
 hasPrompts,
 ruleCount,
 customRuleCount,
 promptCount,
 customPromptCount,
 });

 // Auto-select based on available data
 setImportRules(hasRules);
 setImportPrompts(hasPrompts);
 } catch {
 setError('Invalid JSON format');
 }
 };

 const handleImport = () => {
 setError('');
 setSuccess('');

 if (!importText.trim()) {
 setError('Please paste a configuration or upload a file');
 return;
 }

 if (!importRules && !importPrompts) {
 setError('Please select at least one category to import');
 return;
 }

 const result = onImport(importText, { importRules, importPrompts, mergeMode });
 if (result.success) {
 setSuccess(result.summary || 'Configuration imported successfully!');
 setTimeout(() => handleClose(), 1500);
 } else {
 setError(result.error || 'Failed to import configuration');
 }
 };

 const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;

 const reader = new FileReader();
 reader.onload = (event) => {
 const text = event.target?.result as string;
 parseAndPreview(text);
 };
 reader.onerror = () => {
 setError('Failed to read file');
 };
 reader.readAsText(file);
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center">
 <div
 className="absolute inset-0 bg-black/70 backdrop-blur-sm"
 onClick={handleClose}
 />

 <div ref={modalRef} className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
 <h3 className="text-lg font-semibold text-[#c9a227]">Export / Import Configuration</h3>
 <button
 onClick={handleClose}
 className="text-gray-400 hover:text-gray-200 transition-colors"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 <div className="p-4 space-y-4">
 {/* Mode Toggle */}
 <div className="flex gap-2">
 <button
 onClick={() => { setMode('export'); setError(''); setSuccess(''); }}
 className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
 mode === 'export'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
 }`}
 >
 Export
 </button>
 <button
 onClick={() => { setMode('import'); setError(''); setSuccess(''); }}
 className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
 mode === 'import'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
 }`}
 >
 Import
 </button>
 </div>

 {mode === 'export' ? (
 <div className="space-y-3">
 <p className="text-gray-400 text-sm">
 Export your current configuration including:
 </p>
 <ul className="text-gray-500 text-xs space-y-1 ml-4 list-disc">
 <li>Rule enabled/disabled states</li>
 <li>Custom rules and sections</li>
 <li>Modified keyword lists</li>
 <li>Custom test prompts and sections</li>
 </ul>
 <button
 onClick={handleExport}
 className="w-full px-4 py-3 bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 font-medium rounded transition-colors flex items-center justify-center gap-2"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
 </svg>
 Download Configuration
 </button>
 </div>
 ) : (
 <div className="space-y-3">
 <p className="text-gray-400 text-sm">
 Import a previously exported configuration file:
 </p>

 <label className="block w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed rounded cursor-pointer transition-colors text-center">
 <input
 type="file"
 accept=".json"
 onChange={handleFileUpload}
 className="hidden"
 />
 <span className="text-gray-400 text-sm">
 Click to upload .json file
 </span>
 </label>

 <div className="text-center text-gray-600 text-xs">or paste JSON below</div>

 <textarea
 value={importText}
 onChange={(e) => parseAndPreview(e.target.value)}
 placeholder='{"version": "1.0", ...}'
 rows={5}
 className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-xs font-mono focus:outline-none focus:border-[#c9a227] placeholder-gray-600 resize-none"
 />

 {/* Preview & Options */}
 {previewData && !error && (
 <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 space-y-3">
 <div className="text-xs text-gray-400 font-medium">Configuration Preview</div>

 {/* What to import */}
 <div className="space-y-2">
 <div className="text-xs text-gray-500">Select what to import:</div>
 <div className="flex flex-col gap-2">
 <label className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors cursor-pointer ${
 previewData.hasRules
 ? importRules
 ? 'bg-[#c9a227]/20 border-[#c9a227]/50'
 : 'bg-gray-800 border-gray-700 hover:border-gray-600'
 : 'bg-gray-800/50 border-gray-700/50 opacity-50 cursor-not-allowed'
 }`}>
 <input
 type="checkbox"
 checked={importRules && previewData.hasRules}
 onChange={(e) => setImportRules(e.target.checked)}
 disabled={!previewData.hasRules}
 className="rounded border-gray-600 text-[#c9a227] focus:ring-[#c9a227] bg-gray-700"
 />
 <span className="flex-1 text-xs text-gray-300">
 Detection Rules
 </span>
 <span className="text-[10px] text-gray-500">
 {previewData.hasRules
 ? `${previewData.ruleCount} rules${previewData.customRuleCount > 0 ? ` (+${previewData.customRuleCount} custom)` : ''}`
 : 'Not included'}
 </span>
 </label>

 <label className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors cursor-pointer ${
 previewData.hasPrompts
 ? importPrompts
 ? 'bg-[#c9a227]/20 border-[#c9a227]/50'
 : 'bg-gray-800 border-gray-700 hover:border-gray-600'
 : 'bg-gray-800/50 border-gray-700/50 opacity-50 cursor-not-allowed'
 }`}>
 <input
 type="checkbox"
 checked={importPrompts && previewData.hasPrompts}
 onChange={(e) => setImportPrompts(e.target.checked)}
 disabled={!previewData.hasPrompts}
 className="rounded border-gray-600 text-[#c9a227] focus:ring-[#c9a227] bg-gray-700"
 />
 <span className="flex-1 text-xs text-gray-300">
 Test Prompts
 </span>
 <span className="text-[10px] text-gray-500">
 {previewData.hasPrompts
 ? `${previewData.promptCount} prompts${previewData.customPromptCount > 0 ? ` (+${previewData.customPromptCount} custom)` : ''}`
 : 'Not included'}
 </span>
 </label>
 </div>
 </div>

 {/* Merge mode */}
 <div className="space-y-2">
 <div className="text-xs text-gray-500">Import mode:</div>
 <div className="flex gap-2">
 <button
 onClick={() => setMergeMode('replace')}
 className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
 mergeMode === 'replace'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
 }`}
 >
 Replace
 </button>
 <button
 onClick={() => setMergeMode('merge')}
 className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
 mergeMode === 'merge'
 ? 'bg-[#c9a227] text-gray-900'
 : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
 }`}
 >
 Merge
 </button>
 </div>
 <p className="text-[10px] text-gray-600">
 {mergeMode === 'replace'
 ? 'Replace: Overwrites existing configuration with imported data'
 : 'Merge: Adds custom items from import, updates existing rules'}
 </p>
 </div>
 </div>
 )}

 <button
 onClick={handleImport}
 disabled={!importText.trim() || !!error || (!importRules && !importPrompts)}
 className={`w-full px-4 py-3 font-medium rounded transition-colors flex items-center justify-center gap-2 ${
 importText.trim() && !error && (importRules || importPrompts)
 ? 'bg-[#c9a227] hover:bg-[#d4b030] text-gray-900'
 : 'bg-gray-800 text-gray-600 cursor-not-allowed'
 }`}
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
 </svg>
 Import Configuration
 </button>
 </div>
 )}

 {error && (
 <div className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded border border-red-800">
 {error}
 </div>
 )}

 {success && (
 <div className="text-green-400 text-sm bg-green-900/20 px-3 py-2 rounded border border-green-800">
 {success}
 </div>
 )}
 </div>

 <div className="flex justify-end px-4 py-3 border-t border-gray-700 bg-gray-800/30">
 <button
 onClick={handleClose}
 className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
 >
 Close
 </button>
 </div>
 </div>
 </div>
 );
}

