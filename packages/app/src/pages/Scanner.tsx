import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { type PromptCategory, type PromptItem } from '../data/samplePrompts';
import {
  scanPrompt,
  ruleCategories,
  rehydrateHeuristics,
  fetchAllCommunityRules,
  communityRuleToDetectionRule,
  fetchAllCommunityPrompts,
  communityPromptToPromptItem,
  type DetectionRule,
  type RuleCategory,
  type ScanResult,
  type RuleMatch,
  type AnnotatedSegment,
} from '@forensicate/scanner';
import {
  AddRuleModal,
  AddSectionModal,
  RuleLogicModal,
  AddPromptModal,
  AddPromptSectionModal,
  SavePromptModal,
  ExportImportModal,
  type ImportOptions,
} from '../components/RuleModal';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import BatchResultsModal from '../components/BatchResultsModal';
import RulesPanel from '../components/RulesPanel';
import TestBatteryPanel from '../components/TestBatteryPanel';
import ScannerInput from '../components/ScannerInput';
import ScannerResults from '../components/ScannerResults';
import ScanHistory, { type ScanHistoryEntry } from '../components/ScanHistory';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import AnnotatedPrompt from '../components/AnnotatedPrompt';
import RuleDetailsModal from '../components/RuleDetailsModal';
import CostEstimator from '../components/CostEstimator';

// Extension export item type
interface ExtensionExportItem {
  id?: string;
  text: string;
  sourceDomain?: string;
  sourceUrl?: string;
  timestamp: number;
  savedDate?: string;
  expectedRisk?: string;
}

export default function Scanner() {
  // Use persisted config hook for all state management
  const {
    localRules,
    setLocalRules,
    customCategories,
    setCustomCategories,
    localPrompts,
    setLocalPrompts,
    customPromptCategories,
    setCustomPromptCategories,
    expandedRuleCategory,
    setExpandedRuleCategory,
    expandedPromptCategory: expandedCategory,
    setExpandedPromptCategory: setExpandedCategory,
    confidenceThreshold,
    setConfidenceThreshold,
    autoImportCommunityRules,
    setAutoImportCommunityRules,
    autoImportCommunityPrompts,
    setAutoImportCommunityPrompts,
    loadSource,
    initialPromptText,
    generateShareUrl,
    resetToDefaults,
  } = usePersistedConfig();

  // Initialize prompt text from URL if available (synchronous initialization)
  const [promptText, setPromptText] = useState(() => initialPromptText || '');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState<string | null>(null);

  // Batch scanning state
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());
  const [batchResults, setBatchResults] = useState<Array<{ prompt: PromptItem; result: ScanResult }> | null>(null);
  const [showBatchResults, setShowBatchResults] = useState(false);

  // Scan history state (session-only, not persisted)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const lastHistoryPromptRef = useRef<string>('');

  // Toast notification state - initialize based on loadSource
  const [showToast, setShowToast] = useState(() => loadSource === 'url');
  const [toastFading, setToastFading] = useState(false);
  const [toastMessage, setToastMessage] = useState(() =>
    loadSource === 'url' ? 'Configuration loaded from shared link' : ''
  );

  // Track if we've shown the URL toast to auto-hide it
  const toastShownRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to show toast with auto-dismiss
  const showToastMessage = useCallback((message: string, duration = 3000) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    setToastFading(false);
    setShowToast(true);

    toastTimerRef.current = setTimeout(() => {
      setToastFading(true);
      setTimeout(() => setShowToast(false), 300);
    }, duration);
  }, []);

  // Auto-hide toast after 3 seconds (only runs once for initial URL load)
  useEffect(() => {
    if (showToast && !toastShownRef.current) {
      toastShownRef.current = true;
      toastTimerRef.current = setTimeout(() => {
        setToastFading(true);
        setTimeout(() => setShowToast(false), 300);
      }, 3000);
      return () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      };
    }
  }, [showToast]);

  // Handle import from extension (check URL hash for #import-extension=...)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#import-extension=')) {
      try {
        const dataParam = hash.substring(18); // Remove '#import-extension='
        const exportData = JSON.parse(decodeURIComponent(dataParam));

        if (exportData.prompts && Array.isArray(exportData.prompts) && exportData.prompts.length > 0) {
          // Create "Extension Snippets" category with detailed metadata
          const newCategory: PromptCategory = {
            id: `extension-snippets-${Date.now()}`,
            name: exportData.categoryName || 'Extension Snippets',
            description: exportData.categoryDescription || `${exportData.prompts.length} prompts from browser extension`,
            source: 'Browser Extension',
            prompts: exportData.prompts.map((item: ExtensionExportItem) => {
              // Create descriptive name showing source and date
              const sourceName = item.sourceDomain || item.sourceUrl || 'Unknown';
              const shortSource = sourceName.length > 30 ? sourceName.substring(0, 27) + '...' : sourceName;

              console.log('[Extension Import] Processing item:', {
                id: item.id,
                hasText: !!item.text,
                textLength: item.text?.length,
                text: item.text?.substring(0, 100),
                sourceUrl: item.sourceUrl,
                timestamp: item.timestamp
              });

              return {
                id: item.id || `ext-${Date.now()}-${Math.random()}`,
                name: `${shortSource} · ${item.savedDate || new Date(item.timestamp).toLocaleDateString()}`,
                content: item.text || '',
                tags: [
                  item.expectedRisk || 'unknown',
                  'extension',
                  ...(item.sourceUrl && item.sourceUrl !== 'Unknown source' ? ['web-capture'] : ['manual-scan'])
                ]
              };
            })
          };

          // Add to custom prompt categories
          setCustomPromptCategories(prev => [...prev, newCategory]);

          // Clear hash and show toast (defer to avoid setState in effect)
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          setTimeout(() => {
            showToastMessage(
              `✅ Imported ${exportData.prompts.length} prompts to "Extension Snippets"!`,
              5000
            );
          }, 0);
        }
      } catch (error) {
        console.error('Failed to import from extension:', error);
        setTimeout(() => {
          showToastMessage('❌ Failed to import prompts from extension', 5000);
        }, 0);
      }
    }
  }, [setCustomPromptCategories, showToastMessage]); // Added required dependencies

  // Modal states
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [addRuleTargetCategory, setAddRuleTargetCategory] = useState<string | undefined>();
  const [viewLogicRule, setViewLogicRule] = useState<DetectionRule | null>(null);
  const [showAddPromptModal, setShowAddPromptModal] = useState(false);
  const [showAddPromptSectionModal, setShowAddPromptSectionModal] = useState(false);
  const [showExportImportModal, setShowExportImportModal] = useState(false);
  const [showSavePromptModal, setShowSavePromptModal] = useState(false);
  const [addPromptTargetCategory, setAddPromptTargetCategory] = useState<string | undefined>();

  // Mobile panel visibility
  const [showMobileRules, setShowMobileRules] = useState(false);
  const [showMobilePrompts, setShowMobilePrompts] = useState(false);

  // Search/filter state
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');
  const [promptSearchQuery, setPromptSearchQuery] = useState('');

  // Auto-import community rules on page load
  const hasAutoImported = useRef(false);
  useEffect(() => {
    if (autoImportCommunityRules && !hasAutoImported.current) {
      hasAutoImported.current = true;

      (async () => {
        try {
          const communityRules = await fetchAllCommunityRules();
          const importedCategoryId = 'custom-imported';

          // Transform community rules to detection rules
          const detectionRules = communityRules.map(rule => {
            const detectionRule = communityRuleToDetectionRule(rule);
            // Change ID to custom-imported prefix
            return {
              ...detectionRule,
              id: `custom-imported-${rule.id.replace('community-', '')}`
            };
          });

          // Check which rules are already imported (deduplication)
          setLocalRules(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newRules = detectionRules.filter(r => !existingIds.has(r.id));

            if (newRules.length === 0) {
              console.log('Community rules already imported, skipping');
              return prev;
            }

            console.log(`Auto-imported ${newRules.length} new community rules`);
            return [...prev, ...newRules];
          });

          // Create or update "Imported" category (with deduplication)
          setCustomCategories(prev => {
            const existingCategory = prev.find(c => c.id === importedCategoryId);

            if (existingCategory) {
              // Check which rules are new in this category
              const existingRuleIds = new Set(existingCategory.rules.map(r => r.id));
              const newCategoryRules = detectionRules.filter(r => !existingRuleIds.has(r.id));

              if (newCategoryRules.length === 0) {
                return prev; // No new rules to add
              }

              return prev.map(cat =>
                cat.id === importedCategoryId
                  ? { ...cat, rules: [...cat.rules, ...newCategoryRules] }
                  : cat
              );
            } else {
              return [...prev, {
                id: importedCategoryId,
                name: 'Imported',
                description: 'Rules imported from the community',
                isCustom: true,
                rules: detectionRules
              }];
            }
          });
        } catch (err) {
          console.error('Failed to auto-import community rules:', err);
        }
      })();
    }
  }, [autoImportCommunityRules, setLocalRules, setCustomCategories]);

  // Auto-import community prompts on page load
  const hasAutoImportedPrompts = useRef(false);
  useEffect(() => {
    if (autoImportCommunityPrompts && !hasAutoImportedPrompts.current) {
      hasAutoImportedPrompts.current = true;

      (async () => {
        try {
          const communityPrompts = await fetchAllCommunityPrompts();
          const importedCategoryId = 'custom-prompt-section-community-imported';

          // Transform community prompts to prompt items
          const promptItems = communityPrompts.map(communityPromptToPromptItem);

          // Create or update "Community Imported" category (with deduplication)
          setCustomPromptCategories(prev => {
            const existingCategory = prev.find(c => c.id === importedCategoryId);

            if (existingCategory) {
              // Check which prompts are new in this category
              const existingPromptIds = new Set(existingCategory.prompts.map(p => p.id));
              const newPrompts = promptItems.filter(p => !existingPromptIds.has(p.id));

              if (newPrompts.length === 0) {
                console.log('Community prompts already imported, skipping');
                return prev; // No new prompts to add
              }

              console.log(`Auto-imported ${newPrompts.length} new community prompts`);
              return prev.map(cat =>
                cat.id === importedCategoryId
                  ? { ...cat, prompts: [...cat.prompts, ...newPrompts] }
                  : cat
              );
            } else {
              console.log(`Auto-imported ${promptItems.length} community prompts`);
              return [...prev, {
                id: importedCategoryId,
                name: 'Community Imported',
                description: 'Test prompts imported from the community',
                source: 'github/peterhanily/forensicate.ai/community-prompts',
                prompts: promptItems
              }];
            }
          });
        } catch (err) {
          console.error('Failed to auto-import community prompts:', err);
        }
      })();
    }
  }, [autoImportCommunityPrompts, setCustomPromptCategories]);

  // Annotation view state
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Rule details modal state
  const [selectedRuleMatch, setSelectedRuleMatch] = useState<RuleMatch | null>(null);
  const [showRuleDetails, setShowRuleDetails] = useState(false);

  // ============================================================================
  // Memoized Computations
  // ============================================================================

  const allPromptCategories = useMemo(() => {
    return [...localPrompts, ...customPromptCategories];
  }, [localPrompts, customPromptCategories]);

  const localCategories = useMemo(() => {
    const builtInCategories = ruleCategories.map(cat => ({
      ...cat,
      rules: cat.rules.map(rule =>
        localRules.find(r => r.id === rule.id) || rule
      ).filter(Boolean),
    }));

    const customCats = customCategories.map(cat => ({
      ...cat,
      rules: localRules.filter(r => r.id.startsWith('custom-') &&
        cat.rules.some(cr => cr.id === r.id)),
    }));

    return [...builtInCategories, ...customCats];
  }, [localRules, customCategories]);

  const filteredRuleCategories = useMemo(() => {
    if (!ruleSearchQuery.trim()) return localCategories;

    const query = ruleSearchQuery.toLowerCase();
    return localCategories.map(cat => ({
      ...cat,
      rules: cat.rules.filter(rule =>
        rule.name.toLowerCase().includes(query) ||
        rule.description.toLowerCase().includes(query) ||
        (rule.keywords && rule.keywords.some(k => k.toLowerCase().includes(query))) ||
        (rule.pattern && rule.pattern.toLowerCase().includes(query))
      ),
    })).filter(cat => cat.rules.length > 0 || cat.name.toLowerCase().includes(query));
  }, [localCategories, ruleSearchQuery]);

  const filteredPromptCategories = useMemo(() => {
    if (!promptSearchQuery.trim()) return allPromptCategories;

    const query = promptSearchQuery.toLowerCase();
    return allPromptCategories.map(cat => ({
      ...cat,
      prompts: cat.prompts.filter(prompt =>
        prompt.name.toLowerCase().includes(query) ||
        prompt.content.toLowerCase().includes(query) ||
        prompt.tags.some(t => t.toLowerCase().includes(query))
      ),
    })).filter(cat => cat.prompts.length > 0 || cat.name.toLowerCase().includes(query));
  }, [allPromptCategories, promptSearchQuery]);

  const enabledRuleCount = useMemo(() =>
    localRules.filter(r => r.enabled).length,
    [localRules]
  );

  // ============================================================================
  // Auto-scan with debounce
  // ============================================================================

  const [autoScan, setAutoScan] = useState(true);
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const lastScannedRef = useRef<string>('');
  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================================================
  // Scan History Helpers (declared before auto-scan effect that uses them)
  // ============================================================================

  const addToHistory = (prompt: string, result: ScanResult) => {
    // Dedup: don't add if same prompt as last entry
    if (prompt === lastHistoryPromptRef.current) return;
    lastHistoryPromptRef.current = prompt;

    const entry: ScanHistoryEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      promptSnippet: prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt,
      fullPrompt: prompt,
      confidence: result.confidence,
      isPositive: result.isPositive,
      matchedRuleCount: result.matchedRules.length,
      timestamp: result.timestamp,
      result,
    };

    setScanHistory(prev => [entry, ...prev].slice(0, 50));
  };

  const handleSelectHistoryEntry = (entry: ScanHistoryEntry) => {
    setPromptText(entry.fullPrompt);
    setScanResult(entry.result);
    lastScannedRef.current = ''; // Allow rescan if rules changed
  };

  // ============================================================================
  // Auto-scan effect
  // ============================================================================

  useEffect(() => {
    if (!autoScan) return;
    if (!promptText.trim()) {
      lastScannedRef.current = '';
      return;
    }
    // Deduplication: skip if prompt identical to last scan
    const scanKey = promptText + '|' + localRules.filter(r => r.enabled).map(r => r.id).join(',') + '|' + confidenceThreshold;
    if (scanKey === lastScannedRef.current) return;

    if (autoScanTimerRef.current) {
      clearTimeout(autoScanTimerRef.current);
    }

    autoScanTimerRef.current = setTimeout(() => {
      setIsScanning(true);
      // Use nested timeout so React can paint the scanning state
      setTimeout(() => {
        const result = scanPrompt(promptText, localRules, confidenceThreshold);
        setScanResult(result);
        setIsScanning(false);
        lastScannedRef.current = scanKey;
        addToHistory(promptText, result);
      }, 0);
    }, 300);

    return () => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    };
  }, [promptText, localRules, autoScan, confidenceThreshold]);

  // ============================================================================
  // Scan Handlers
  // ============================================================================

  const handlePromptSelect = (prompt: PromptItem) => {
    console.log('[handlePromptSelect] Selected prompt:', {
      id: prompt.id,
      name: prompt.name,
      hasContent: !!prompt.content,
      contentLength: prompt.content?.length,
      content: prompt.content?.substring(0, 100)
    });
    setPromptText(prompt.content || '');
    setScanResult(null);
    lastScannedRef.current = ''; // Force rescan
  };

  const handleManualScan = () => {
    if (!promptText.trim()) return;

    setIsScanning(true);
    setScanResult(null);

    setTimeout(() => {
      const result = scanPrompt(promptText, localRules, confidenceThreshold);
      setScanResult(result);
      setIsScanning(false);
      lastScannedRef.current = promptText + '|' + localRules.filter(r => r.enabled).map(r => r.id).join(',') + '|' + confidenceThreshold;
      addToHistory(promptText, result);
    }, 150);
  };

  const handlePromptChange = (text: string) => {
    setPromptText(text);
    if (!autoScan) {
      setScanResult(null);
    } else if (!text.trim()) {
      setScanResult(null);
    }
  };

  const handleClear = () => {
    setPromptText('');
    setScanResult(null);
    lastScannedRef.current = '';
  };

  // ============================================================================
  // Batch Scanning
  // ============================================================================

  const togglePromptSelection = (promptId: string) => {
    setSelectedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(promptId)) {
        next.delete(promptId);
      } else {
        next.add(promptId);
      }
      return next;
    });
  };

  const selectAllPrompts = () => {
    const allIds = allPromptCategories.flatMap(cat => cat.prompts.map(p => p.id));
    setSelectedPrompts(new Set(allIds));
  };

  const clearPromptSelection = () => {
    setSelectedPrompts(new Set());
  };

  const handleBatchScan = () => {
    if (selectedPrompts.size === 0) return;

    setIsScanning(true);
    setBatchResults(null);

    setTimeout(() => {
      const results: Array<{ prompt: PromptItem; result: ScanResult }> = [];

      for (const cat of allPromptCategories) {
        for (const prompt of cat.prompts) {
          if (selectedPrompts.has(prompt.id)) {
            const result = scanPrompt(prompt.content, localRules, confidenceThreshold);
            results.push({ prompt, result });
          }
        }
      }

      setBatchResults(results);
      setShowBatchResults(true);
      setIsScanning(false);
    }, 150);
  };

  // ============================================================================
  // Rule Management
  // ============================================================================

  const toggleRuleCategory = (categoryId: string) => {
    setExpandedRuleCategory(expandedRuleCategory === categoryId ? null : categoryId);
  };

  const toggleRule = (ruleId: string) => {
    setLocalRules(prev =>
      prev.map(rule =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
    setScanResult(null);
    lastScannedRef.current = '';
  };

  const toggleCategoryRules = (category: RuleCategory, enabled: boolean) => {
    const ruleIds = category.rules.map(r => r.id);
    setLocalRules(prev =>
      prev.map(rule =>
        ruleIds.includes(rule.id) ? { ...rule, enabled } : rule
      )
    );
    setScanResult(null);
    lastScannedRef.current = '';
  };

  const updateKeywords = (ruleId: string, keywords: string[]) => {
    setLocalRules(prev =>
      prev.map(rule =>
        rule.id === ruleId ? { ...rule, keywords } : rule
      )
    );
    setEditingKeywords(null);
    setScanResult(null);
    lastScannedRef.current = '';
  };

  const handleAddRule = (rule: DetectionRule, categoryId: string) => {
    setLocalRules(prev => [...prev, rule]);
    const customCat = customCategories.find(c => c.id === categoryId);
    if (customCat) {
      setCustomCategories(prev =>
        prev.map(c =>
          c.id === categoryId
            ? { ...c, rules: [...c.rules, rule] }
            : c
        )
      );
    }
    setScanResult(null);
    lastScannedRef.current = '';
  };

  const handleAddSection = (section: Omit<RuleCategory, 'rules'>) => {
    const newCategory: RuleCategory = { ...section, rules: [] };
    setCustomCategories(prev => [...prev, newCategory]);
  };

  const handleOpenAddRuleModal = (categoryId?: string) => {
    setAddRuleTargetCategory(categoryId);
    setShowAddRuleModal(true);
  };

  const deleteRule = (ruleId: string) => {
    setLocalRules(prev => prev.filter(r => r.id !== ruleId));
    setCustomCategories(prev =>
      prev.map(c => ({ ...c, rules: c.rules.filter(r => r.id !== ruleId) }))
    );
    setScanResult(null);
    lastScannedRef.current = '';
  };

  const handleEditRule = (updatedRule: DetectionRule) => {
    setLocalRules(prev =>
      prev.map(rule => rule.id === updatedRule.id ? updatedRule : rule)
    );
    setViewLogicRule(null);
    setScanResult(null);
    lastScannedRef.current = '';
  };

  const deleteSection = (categoryId: string) => {
    const catRules = customCategories.find(c => c.id === categoryId)?.rules || [];
    const ruleIds = catRules.map(r => r.id);
    setLocalRules(prev => prev.filter(r => !ruleIds.includes(r.id)));
    setCustomCategories(prev => prev.filter(c => c.id !== categoryId));
    setScanResult(null);
    lastScannedRef.current = '';
  };

  // ============================================================================
  // Prompt Management
  // ============================================================================

  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const handleAddPrompt = (
    prompt: { name: string; content: string; tags: string[] },
    categoryId: string
  ) => {
    const newPrompt: PromptItem = {
      id: `custom-prompt-${Date.now()}`,
      name: prompt.name,
      content: prompt.content,
      tags: prompt.tags,
    };

    const isCustomCat = customPromptCategories.some(c => c.id === categoryId);
    if (isCustomCat) {
      setCustomPromptCategories(prev =>
        prev.map(c =>
          c.id === categoryId
            ? { ...c, prompts: [...c.prompts, newPrompt] }
            : c
        )
      );
    } else {
      setLocalPrompts(prev =>
        prev.map(c =>
          c.id === categoryId
            ? { ...c, prompts: [...c.prompts, newPrompt] }
            : c
        )
      );
    }
  };

  const handleAddPromptSection = (section: { id?: string; name: string; description: string; source: string }, initialPrompt?: { name: string; content: string; tags: string[] }) => {
    const newCategory: PromptCategory = {
      id: section.id || `custom-prompt-section-${Date.now()}`,
      name: section.name,
      description: section.description,
      source: section.source,
      prompts: initialPrompt ? [{
        id: `custom-prompt-${Date.now()}`,
        name: initialPrompt.name,
        content: initialPrompt.content,
        tags: initialPrompt.tags,
      }] : [],
    };
    console.log('[Scanner] handleAddPromptSection called with:', { section, initialPrompt });
    console.log('[Scanner] Created new category:', newCategory);
    console.log('[Scanner] New category has prompts:', newCategory.prompts.length);
    setCustomPromptCategories(prev => {
      const updated = [...prev, newCategory];
      console.log('[Scanner] Updated customPromptCategories:', updated);
      return updated;
    });
    return newCategory.id;
  };

  const handleOpenAddPromptModal = (categoryId?: string) => {
    setAddPromptTargetCategory(categoryId);
    setShowAddPromptModal(true);
  };

  const deletePrompt = (promptId: string, categoryId: string) => {
    const isCustomCat = customPromptCategories.some(c => c.id === categoryId);
    if (isCustomCat) {
      setCustomPromptCategories(prev =>
        prev.map(c =>
          c.id === categoryId
            ? { ...c, prompts: c.prompts.filter(p => p.id !== promptId) }
            : c
        )
      );
    } else {
      setLocalPrompts(prev =>
        prev.map(c =>
          c.id === categoryId
            ? { ...c, prompts: c.prompts.filter(p => p.id !== promptId) }
            : c
        )
      );
    }
  };

  const deletePromptSection = (categoryId: string) => {
    setCustomPromptCategories(prev => prev.filter(c => c.id !== categoryId));
  };

  // ============================================================================
  // Export/Import
  // ============================================================================

  const handleExportConfig = (): string => {
    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      rules: { localRules, customCategories },
      prompts: { localPrompts, customPromptCategories },
    };
    return JSON.stringify(config, null, 2);
  };

  const handleImportConfig = (
    configJson: string,
    options: ImportOptions
  ): { success: boolean; error?: string; summary?: string } => {
    try {
      const config = JSON.parse(configJson);

      if (!config.version) {
        return { success: false, error: 'Invalid config format: missing version' };
      }

      const changes: string[] = [];

      if (options.importRules && config.rules) {
        if (options.mergeMode === 'replace') {
          if (Array.isArray(config.rules.localRules)) {
            // Rehydrate heuristic rules after JSON deserialization
            const rehydrated = rehydrateHeuristics(config.rules.localRules);
            setLocalRules(rehydrated);
            changes.push(`${rehydrated.length} rules`);
          }
          if (Array.isArray(config.rules.customCategories)) {
            setCustomCategories(config.rules.customCategories);
            const customRuleCount = config.rules.customCategories.reduce(
              (acc: number, cat: { rules?: unknown[] }) => acc + (cat.rules?.length || 0), 0
            );
            if (customRuleCount > 0) changes.push(`${customRuleCount} custom rules`);
          }
        } else {
          if (Array.isArray(config.rules.localRules)) {
            setLocalRules(prev => {
              // Rehydrate imported rules first
              const rehydrated = rehydrateHeuristics(config.rules.localRules);
              const importedMap = new Map(rehydrated.map((r: { id: string }) => [r.id, r]));
              const merged = prev.map(rule => {
                const imported = importedMap.get(rule.id);
                if (imported) { importedMap.delete(rule.id); return { ...rule, ...imported }; }
                return rule;
              });
              const newCustomRules = (Array.from(importedMap.values()) as DetectionRule[])
                .filter(r => r.id.startsWith('custom-'));
              return [...merged, ...newCustomRules];
            });
            changes.push('rules merged');
          }
          if (Array.isArray(config.rules.customCategories)) {
            setCustomCategories(prev => {
              const existingIds = new Set(prev.map(c => c.id));
              return [...prev, ...config.rules.customCategories.filter((c: { id: string }) => !existingIds.has(c.id))];
            });
            if (config.rules.customCategories.length > 0) changes.push(`${config.rules.customCategories.length} custom categories`);
          }
        }
      }

      if (options.importPrompts && config.prompts) {
        if (options.mergeMode === 'replace') {
          if (Array.isArray(config.prompts.localPrompts)) {
            setLocalPrompts(config.prompts.localPrompts);
            const promptCount = config.prompts.localPrompts.reduce(
              (acc: number, cat: { prompts?: unknown[] }) => acc + (cat.prompts?.length || 0), 0
            );
            changes.push(`${promptCount} prompts`);
          }
          if (Array.isArray(config.prompts.customPromptCategories)) {
            setCustomPromptCategories(config.prompts.customPromptCategories);
            const customCount = config.prompts.customPromptCategories.reduce(
              (acc: number, cat: { prompts?: unknown[] }) => acc + (cat.prompts?.length || 0), 0
            );
            if (customCount > 0) changes.push(`${customCount} custom prompts`);
          }
        } else {
          if (Array.isArray(config.prompts.localPrompts)) {
            setLocalPrompts(prev => prev.map(cat => {
              const importedCat = config.prompts.localPrompts.find((c: { id: string }) => c.id === cat.id);
              if (importedCat && Array.isArray(importedCat.prompts)) {
                const existingIds = new Set(cat.prompts.map(p => p.id));
                const newPrompts = importedCat.prompts.filter(
                  (p: { id: string }) => !existingIds.has(p.id) && p.id.startsWith('custom-prompt-')
                );
                return { ...cat, prompts: [...cat.prompts, ...newPrompts] };
              }
              return cat;
            }));
            changes.push('prompts merged');
          }
          if (Array.isArray(config.prompts.customPromptCategories)) {
            setCustomPromptCategories(prev => {
              const existingIds = new Set(prev.map(c => c.id));
              return [...prev, ...config.prompts.customPromptCategories.filter((c: { id: string }) => !existingIds.has(c.id))];
            });
          }
        }
      }

      setScanResult(null);
      lastScannedRef.current = '';

      const summary = changes.length > 0
        ? `Imported: ${changes.join(', ')}`
        : 'Configuration imported successfully!';

      return { success: true, summary };
    } catch {
      return { success: false, error: 'Invalid JSON format' };
    }
  };

  // ============================================================================
  // Rule Details Modal Handlers
  // ============================================================================

  const handleRuleClick = (match: RuleMatch) => {
    setSelectedRuleMatch(match);
    setShowRuleDetails(true);
  };

  const handleSegmentClick = (segment: AnnotatedSegment) => {
    // When a user clicks an annotated segment, show the first matched rule
    if (segment.rules.length > 0) {
      setSelectedRuleMatch(segment.rules[0]);
      setShowRuleDetails(true);
    }
  };

  const handleCloseRuleDetails = () => {
    setShowRuleDetails(false);
    // Don't clear selectedRuleMatch immediately to allow for exit animation
    setTimeout(() => setSelectedRuleMatch(null), 300);
  };

  // ============================================================================
  // Helper Functions
  // ============================================================================

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-900/30';
      case 'high': return 'text-orange-400 bg-orange-900/30';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30';
      case 'low': return 'text-green-400 bg-green-900/30';
      default: return 'text-gray-400 bg-gray-900/30';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'keyword': return '🔤';
      case 'regex': return '⚡';
      case 'heuristic': return '🧠';
      default: return '•';
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 bg-[#c9a227] text-gray-900 rounded-lg shadow-lg flex items-center gap-2 ${toastFading ? 'toast-exit' : 'toast-enter'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="border border-gray-800 rounded-lg p-3 sm:p-4 bg-gray-900/30">
        <h2 className="text-xl sm:text-2xl font-semibold text-[#c9a227] mb-1 tracking-wide" style={{ fontFamily: 'serif' }}>
          Prompt Scanner
        </h2>
        <p className="text-gray-400 text-xs sm:text-sm">
          Detect prompt injection attacks using keyword, regex, heuristic, and NLP-based analysis across {enabledRuleCount} active rules. Runs entirely in your browser, no API keys or server required.
        </p>
      </div>

      {/* Mobile Panel Toggle Buttons */}
      <div className="flex gap-2 lg:hidden">
        <button
          onClick={() => setShowMobileRules(!showMobileRules)}
          className={`flex-1 px-3 py-2 rounded-lg border transition-colors flex items-center justify-center gap-2 text-sm ${
            showMobileRules
              ? 'bg-[#c9a227]/20 border-[#c9a227]/50 text-[#c9a227]'
              : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Rules ({enabledRuleCount}/{localRules.length})
        </button>
        <button
          onClick={() => setShowMobilePrompts(!showMobilePrompts)}
          className={`flex-1 px-3 py-2 rounded-lg border transition-colors flex items-center justify-center gap-2 text-sm ${
            showMobilePrompts
              ? 'bg-[#c9a227]/20 border-[#c9a227]/50 text-[#c9a227]'
              : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Test Prompts
        </button>
      </div>

      {/* Main Content Area - Three Column Layout */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left Side - Rules Panel */}
        <RulesPanel
          showMobileRules={showMobileRules}
          onCloseMobile={() => setShowMobileRules(false)}
          enabledRuleCount={enabledRuleCount}
          totalRuleCount={localRules.length}
          ruleSearchQuery={ruleSearchQuery}
          onRuleSearchChange={setRuleSearchQuery}
          filteredRuleCategories={filteredRuleCategories}
          expandedRuleCategory={expandedRuleCategory}
          onToggleRuleCategory={toggleRuleCategory}
          onToggleRule={toggleRule}
          onToggleCategoryRules={toggleCategoryRules}
          editingKeywords={editingKeywords}
          onEditKeywords={setEditingKeywords}
          onUpdateKeywords={updateKeywords}
          getSeverityColor={getSeverityColor}
          getTypeIcon={getTypeIcon}
          onAddRule={handleOpenAddRuleModal}
          onDeleteRule={deleteRule}
          onDeleteSection={deleteSection}
          onViewLogic={setViewLogicRule}
          onEnableAll={() => { setLocalRules(prev => prev.map(r => ({ ...r, enabled: true }))); lastScannedRef.current = ''; }}
          onDisableAll={() => { setLocalRules(prev => prev.map(r => ({ ...r, enabled: false }))); lastScannedRef.current = ''; }}
          onShowAddSectionModal={() => setShowAddSectionModal(true)}
          onImportCommunityRule={(rule) => {
            const importedCategoryId = 'custom-imported';

            // Change rule ID to custom- prefix so it appears in custom categories
            const importedRule = {
              ...rule,
              id: `custom-imported-${rule.id.replace('community-', '')}`
            };

            // Add rule to localRules
            setLocalRules(prev => [...prev, importedRule]);

            // Create "Imported" category with rule, or add rule to existing category
            setCustomCategories(prev => {
              const existingCategory = prev.find(c => c.id === importedCategoryId);

              if (existingCategory) {
                // Add rule to existing Imported category
                return prev.map(cat =>
                  cat.id === importedCategoryId
                    ? { ...cat, rules: [...cat.rules, importedRule] }
                    : cat
                );
              } else {
                // Create new Imported category with the rule
                return [...prev, {
                  id: importedCategoryId,
                  name: 'Imported',
                  description: 'Rules imported from the community',
                  isCustom: true,
                  rules: [importedRule]
                }];
              }
            });

            showToastMessage(`✅ Imported "${rule.name}" to Imported category`, 3000);
            lastScannedRef.current = ''; // Force re-scan
          }}
          importedCommunityRuleIds={new Set(
            localRules
              .filter(r => r.id.startsWith('custom-imported-'))
              .map(r => 'community-' + r.id.replace('custom-imported-', ''))
          )}
          autoImportEnabled={autoImportCommunityRules}
          onToggleAutoImport={setAutoImportCommunityRules}
          matchedRuleIds={scanResult ? new Set(scanResult.matchedRules.map(m => m.ruleId)) : new Set()}
        />

        {/* Center - Input and Results */}
        <div className="flex-1 space-y-3 sm:space-y-4 order-first lg:order-none">
          <ScannerInput
            promptText={promptText}
            onPromptChange={handlePromptChange}
            onClear={handleClear}
            onSavePrompt={() => setShowSavePromptModal(true)}
          />

          {/* Scan Bar */}
          <div className="border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden"
            style={{ borderImage: 'linear-gradient(to right, #8b0000, #c9a227, #8b0000) 1' }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-xs text-gray-500 font-mono">
                {isScanning ? (
                  <span className="text-[#c9a227] flex items-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Scanning...
                  </span>
                ) : scanResult ? (
                  <span>Scanned at {scanResult.timestamp.toLocaleTimeString()}</span>
                ) : (
                  <span>{autoScan ? 'Auto-scan enabled' : 'Manual scan mode'}</span>
                )}
              </div>

              {!autoScan && (
                <button
                  onClick={handleManualScan}
                  disabled={!promptText.trim() || isScanning}
                  className={`px-4 py-1 text-xs font-semibold uppercase tracking-wider rounded transition-all ${
                    promptText.trim() && !isScanning
                      ? 'bg-gradient-to-r from-[#8b0000] to-[#5c0000] text-[#c9a227] hover:from-[#a00000] hover:to-[#700000]'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  Scan
                </button>
              )}

              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-xs text-gray-500">Auto</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={autoScan}
                    onChange={(e) => {
                      setAutoScan(e.target.checked);
                      if (e.target.checked) lastScannedRef.current = '';
                    }}
                    className="sr-only"
                  />
                  <div className={`w-6 h-3 rounded-full transition-colors ${autoScan ? 'bg-[#c9a227]' : 'bg-gray-700'}`}>
                    <div className={`w-2 h-2 rounded-full bg-white shadow-sm transform transition-transform ${autoScan ? 'translate-x-[13px]' : 'translate-x-[2px]'} translate-y-[2px]`} />
                  </div>
                </div>
              </label>
            </div>

            {/* Threshold Row */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-800/50">
              <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">Threshold:</span>
              <input
                type="range"
                min="0"
                max="99"
                value={confidenceThreshold}
                onChange={(e) => {
                  setConfidenceThreshold(Number(e.target.value));
                  lastScannedRef.current = '';
                }}
                className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c9a227] [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-[10px] text-[#c9a227] font-mono w-7 text-right">{confidenceThreshold}%</span>
              <button
                onClick={() => setShowConfidenceInfo(!showConfidenceInfo)}
                className="text-gray-500 hover:text-[#c9a227] transition-colors"
                title="How confidence scoring works"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>

            {/* Confidence Info Panel */}
            {showConfidenceInfo && (
              <div className="px-3 py-2 border-t border-gray-800/50 bg-gray-800/30">
                <div className="text-[10px] text-gray-400 space-y-1">
                  <div className="text-gray-300 font-medium">Confidence Scoring Formula</div>
                  <div>Each matched rule adds its severity weight: <span className="text-green-400">low=10</span>, <span className="text-yellow-400">medium=25</span>, <span className="text-orange-400">high=40</span>, <span className="text-red-400">critical=60</span></div>
                  <div>Bonuses: +5 per extra match within a rule (max +20), +30 per critical finding, +20 for 2+ high findings</div>
                  <div>Final score: <span className="text-[#c9a227] font-mono">50 + 50 * log10(1 + totalScore/50)</span>, capped at 99%</div>
                  <div className="text-gray-500 pt-1">Set threshold to 0% to disable filtering (all matches reported as positive).</div>
                </div>
              </div>
            )}
          </div>

          <ScannerResults
            scanResult={scanResult}
            promptText={promptText}
            isScanning={isScanning}
            onRuleClick={handleRuleClick}
          />

          {/* Annotated Prompt View */}
          {scanResult && promptText && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-[#c9a227] transition-colors">
                  <input
                    type="checkbox"
                    checked={showAnnotations}
                    onChange={(e) => setShowAnnotations(e.target.checked)}
                    className="rounded border-gray-700 bg-gray-800 text-[#c9a227] focus:ring-[#c9a227] focus:ring-offset-0"
                  />
                  <span>Show annotated view</span>
                </label>
                <span className="text-xs text-gray-600">
                  Click or hover highlighted text for details
                </span>
              </div>
              {showAnnotations && (
                <AnnotatedPrompt
                  text={promptText}
                  scanResult={scanResult}
                  onRuleClick={handleRuleClick}
                  onSegmentClick={handleSegmentClick}
                />
              )}
            </div>
          )}

          {/* Cost Estimator - Show after scan results */}
          {scanResult && promptText && (
            <CostEstimator
              promptText={promptText}
              mode="single"
              className="mt-4"
            />
          )}

          <ScanHistory
            entries={scanHistory}
            onSelectEntry={handleSelectHistoryEntry}
            onClear={() => { setScanHistory([]); lastHistoryPromptRef.current = ''; }}
          />

          <AnalyticsDashboard
            scanHistory={scanHistory}
            batchResults={batchResults}
          />
        </div>

        {/* Right Side - Test Battery */}
        <TestBatteryPanel
          showMobilePrompts={showMobilePrompts}
          onCloseMobile={() => setShowMobilePrompts(false)}
          promptSearchQuery={promptSearchQuery}
          onPromptSearchChange={setPromptSearchQuery}
          filteredPromptCategories={filteredPromptCategories}
          allPromptCategories={allPromptCategories}
          expandedCategory={expandedCategory}
          onToggleCategory={toggleCategory}
          onSelectPrompt={handlePromptSelect}
          onOpenAddPromptModal={handleOpenAddPromptModal}
          onDeletePrompt={deletePrompt}
          onDeletePromptSection={deletePromptSection}
          onShowAddPromptSectionModal={() => setShowAddPromptSectionModal(true)}
          selectedPrompts={selectedPrompts}
          onToggleSelection={togglePromptSelection}
          onSelectAll={selectAllPrompts}
          onClearSelection={clearPromptSelection}
          onBatchScan={handleBatchScan}
          isScanning={isScanning}
          onImportCommunityPrompt={(prompt) => {
            const importedCategoryId = 'custom-prompt-section-community-imported';

            // Add prompt to customPromptCategories
            setCustomPromptCategories(prev => {
              const existingCategory = prev.find(c => c.id === importedCategoryId);

              if (existingCategory) {
                return prev.map(cat =>
                  cat.id === importedCategoryId
                    ? { ...cat, prompts: [...cat.prompts, prompt] }
                    : cat
                );
              } else {
                return [...prev, {
                  id: importedCategoryId,
                  name: 'Community Imported',
                  description: 'Test prompts imported from the community',
                  source: 'github/peterhanily/forensicate.ai/community-prompts',
                  prompts: [prompt]
                }];
              }
            });

            showToastMessage(`✅ Imported "${prompt.name}" to Community Imported category`, 3000);
          }}
          importedCommunityPromptIds={new Set(
            customPromptCategories
              .filter(cat => cat.id === 'custom-prompt-section-community-imported')
              .flatMap(cat => cat.prompts.map(p => p.id))
          )}
          autoImportEnabled={autoImportCommunityPrompts}
          onToggleAutoImport={setAutoImportCommunityPrompts}
        />
      </div>

      {/* Configuration Panel */}
      <div className="border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden">
        <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700">
          <h3 className="text-[#c9a227] text-sm font-semibold">Configuration</h3>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const url = generateShareUrl(promptText || undefined);
                navigator.clipboard.writeText(url).then(() => {
                  showToastMessage('Share URL copied to clipboard' + (promptText ? ' (includes current prompt)' : ''));
                }).catch(() => {
                  showToastMessage('Failed to copy URL');
                });
              }}
              className="flex-1 px-3 py-2 bg-[#c9a227]/20 hover:bg-[#c9a227]/30 text-[#c9a227] rounded-lg transition-colors flex items-center justify-center gap-2 border border-[#c9a227]/30"
              title="Copy shareable URL with current configuration and prompt"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span className="text-sm">Share</span>
            </button>
            <button
              onClick={() => setShowExportImportModal(true)}
              className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2 border border-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="text-sm">Export / Import</span>
            </button>
          </div>
          <button
            onClick={() => {
              if (confirm('Reset all rules and prompts to defaults? This will clear all custom rules, prompts, and settings.')) {
                resetToDefaults();
                setScanResult(null);
                lastScannedRef.current = '';
                showToastMessage('Reset to defaults');
              }
            }}
            className="w-full px-3 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2 border border-red-900/30 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Modals */}
      <AddRuleModal
        isOpen={showAddRuleModal}
        onClose={() => { setShowAddRuleModal(false); setAddRuleTargetCategory(undefined); }}
        onAddRule={handleAddRule}
        categories={localCategories}
        targetCategoryId={addRuleTargetCategory}
      />
      <AddSectionModal
        isOpen={showAddSectionModal}
        onClose={() => setShowAddSectionModal(false)}
        onAddSection={handleAddSection}
      />
      <RuleLogicModal
        isOpen={viewLogicRule !== null}
        onClose={() => setViewLogicRule(null)}
        rule={viewLogicRule}
        onSave={handleEditRule}
      />
      <AddPromptModal
        isOpen={showAddPromptModal}
        onClose={() => { setShowAddPromptModal(false); setAddPromptTargetCategory(undefined); }}
        onAddPrompt={handleAddPrompt}
        categories={allPromptCategories.map(c => ({ id: c.id, name: c.name }))}
        targetCategoryId={addPromptTargetCategory}
      />
      <AddPromptSectionModal
        isOpen={showAddPromptSectionModal}
        onClose={() => setShowAddPromptSectionModal(false)}
        onAddSection={handleAddPromptSection}
      />
      <SavePromptModal
        isOpen={showSavePromptModal}
        onClose={() => setShowSavePromptModal(false)}
        onSavePrompt={handleAddPrompt}
        onCreateSection={handleAddPromptSection}
        categories={allPromptCategories.map(c => ({ id: c.id, name: c.name }))}
        initialContent={promptText}
      />
      <ExportImportModal
        isOpen={showExportImportModal}
        onClose={() => setShowExportImportModal(false)}
        onExport={handleExportConfig}
        onImport={handleImportConfig}
      />

      {/* Rule Details Modal */}
      {selectedRuleMatch && (
        <RuleDetailsModal
          isOpen={showRuleDetails}
          onClose={handleCloseRuleDetails}
          rule={localRules.find(r => r.id === selectedRuleMatch.ruleId) || {
            id: selectedRuleMatch.ruleId,
            name: selectedRuleMatch.ruleName,
            description: 'Rule details not available',
            type: selectedRuleMatch.ruleType,
            severity: selectedRuleMatch.severity,
            enabled: true,
          }}
          match={selectedRuleMatch}
        />
      )}

      {/* Batch Results Modal */}
      {showBatchResults && batchResults && (
        <BatchResultsModal
          batchResults={batchResults}
          onClose={() => setShowBatchResults(false)}
          onClearAndClose={() => { clearPromptSelection(); setShowBatchResults(false); }}
        />
      )}
    </div>
  );
}
