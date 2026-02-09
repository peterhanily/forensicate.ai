// React hook for Forensicate.ai API

import { useState, useCallback } from 'react';

interface ScanResult {
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  matchCount: number;
  matches: Array<{
    ruleName: string;
    severity: string;
  }>;
}

interface UseForensicateOptions {
  apiUrl?: string;
  apiToken: string;
  autoScan?: boolean;
  confidenceThreshold?: number;
}

export function useForensicate({
  apiUrl = 'https://api.forensicate.ai',
  apiToken,
  autoScan = false,
  confidenceThreshold = 50
}: UseForensicateOptions) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (text: string) => {
    if (!text.trim()) {
      setError('Text cannot be empty');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/v1/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          confidenceThreshold,
          includePositions: false
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Scan failed');
      }

      setResult(data.data);
      return data.data;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiUrl, apiToken, confidenceThreshold]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    scan,
    reset,
    loading,
    result,
    error,
    isHighRisk: result?.riskLevel === 'high',
    isMediumRisk: result?.riskLevel === 'medium',
    isLowRisk: result?.riskLevel === 'low'
  };
}

// Example usage in component
export function ChatInput() {
  const [message, setMessage] = useState('');

  const forensicate = useForensicate({
    apiToken: process.env.FORENSICATE_API_TOKEN!,
    confidenceThreshold: 50
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Scan before sending
    const scanResult = await forensicate.scan(message);

    if (scanResult && scanResult.riskLevel === 'high') {
      alert('⚠️ This message contains potential prompt injection attempts and cannot be sent.');
      return;
    }

    // Safe to send
    await sendToLLM(message);
    setMessage('');
    forensicate.reset();
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message..."
      />

      {forensicate.loading && <div>🔍 Scanning for threats...</div>}

      {forensicate.error && (
        <div className="error">❌ {forensicate.error}</div>
      )}

      {forensicate.result && (
        <div className={`scan-result ${forensicate.result.riskLevel}`}>
          {forensicate.isHighRisk && '🔴 High Risk - Message blocked'}
          {forensicate.isMediumRisk && '🟡 Medium Risk - Proceed with caution'}
          {forensicate.isLowRisk && '🟢 Low Risk - Safe to send'}
          <div>Confidence: {forensicate.result.confidence}%</div>
        </div>
      )}

      <button
        type="submit"
        disabled={forensicate.loading || forensicate.isHighRisk}
      >
        Send Message
      </button>
    </form>
  );
}

async function sendToLLM(message: string) {
  // Your LLM integration here
  console.log('Sending to LLM:', message);
}
