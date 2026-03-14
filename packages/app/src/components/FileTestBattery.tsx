import { useState } from 'react';
import { fileTestCategories, type FileTestCase } from '../data/fileTestBattery';

interface FileTestBatteryProps {
  onRunTest: (file: File) => void;
  isProcessing: boolean;
}

export default function FileTestBattery({ onRunTest, isProcessing }: FileTestBatteryProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleRunTest = async (test: FileTestCase) => {
    setGeneratingId(test.id);
    try {
      const blob = await test.generate();
      const extMap: Record<string, string> = {
        csv: '.csv', html: '.html', svg: '.svg', eml: '.eml',
        docx: '.docx', pdf: '.pdf',
      };
      const ext = extMap[test.fileType] || '.txt';
      const file = new File([blob], `${test.id}${ext}`, {
        type: blob.type,
      });
      onRunTest(file);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
      <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <span className="text-gray-400 text-xs font-mono">file_test_battery</span>
        <span className="text-gray-600 text-xs font-mono ml-2">
          ({fileTestCategories.reduce((sum, c) => sum + c.tests.length, 0)} tests)
        </span>
      </div>

      <div className="divide-y divide-gray-800/50">
        {fileTestCategories.map(category => (
          <div key={category.id}>
            <button
              onClick={() => setExpandedCategory(
                expandedCategory === category.id ? null : category.id
              )}
              className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-3 h-3 text-gray-500 transition-transform ${
                    expandedCategory === category.id ? 'rotate-90' : ''
                  }`}
                  fill="currentColor" viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-mono text-gray-300">{category.name}</span>
                <span className="text-xs font-mono text-gray-600">{category.tests.length}</span>
              </div>
            </button>

            {expandedCategory === category.id && (
              <div className="px-3 pb-2 space-y-1.5">
                {category.tests.map(test => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-gray-800/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-gray-300 truncate">{test.name}</div>
                      <div className="text-[10px] font-mono text-gray-500 truncate">{test.description}</div>
                      <div className="flex gap-1 mt-0.5">
                        {test.tags.map(tag => (
                          <span key={tag} className="text-[9px] font-mono px-1 py-0.5 rounded bg-gray-700/50 text-gray-500">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRunTest(test)}
                      disabled={isProcessing || generatingId !== null}
                      className={`shrink-0 px-2 py-1 text-[10px] font-mono font-semibold uppercase rounded transition-colors ${
                        isProcessing || generatingId !== null
                          ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                          : 'bg-[#c9a227]/20 text-[#c9a227] hover:bg-[#c9a227]/30'
                      }`}
                    >
                      {generatingId === test.id ? 'Generating...' : 'Scan'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
