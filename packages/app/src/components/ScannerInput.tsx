interface ScannerInputProps {
  promptText: string;
  onPromptChange: (text: string) => void;
  onClear: () => void;
  onSavePrompt?: () => void;
}

export default function ScannerInput({
  promptText,
  onPromptChange,
  onClear,
  onSavePrompt,
}: ScannerInputProps) {
  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs font-mono">prompt_input</span>
        </div>
        <div className="flex items-center gap-2">
          {onSavePrompt && promptText.trim() && (
            <button
              onClick={onSavePrompt}
              className="text-gray-500 hover:text-[#c9a227] text-xs font-mono transition-colors"
              title="Save prompt to test battery"
            >
              save
            </button>
          )}
          <button
            onClick={onClear}
            className="text-gray-500 hover:text-gray-300 text-xs font-mono transition-colors"
          >
            clear
          </button>
        </div>
      </div>
      <div className="relative">
        <textarea
          value={promptText}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Enter or paste a prompt to analyze..."
          className="w-full h-32 sm:h-48 p-3 sm:p-4 bg-transparent text-green-400 font-mono text-sm resize-none focus:outline-none placeholder-gray-600"
          style={{
            caretColor: '#22c55e',
            lineHeight: '1.6'
          }}
        />
        <div className="absolute bottom-2 right-2 text-gray-600 text-xs font-mono">
          {promptText.length} chars
        </div>
      </div>
    </div>
  );
}
