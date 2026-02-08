import { useMemo } from 'react';
import type { AnnotatedSegment } from '@forensicate/scanner';

interface OverviewMapProps {
  text: string;
  segments: AnnotatedSegment[];
}

export default function OverviewMap({ text, segments }: OverviewMapProps) {
  const lines = useMemo(() => text.split('\n'), [text]);

  const lineMarkers = useMemo(() => {
    const markers: Array<{
      lineIndex: number;
      color: string;
      count: number;
      severity: string;
    }> = [];

    lines.forEach((line, lineIndex) => {
      // Calculate character position of this line
      const lineStart = lines.slice(0, lineIndex).join('\n').length + Math.max(0, lineIndex);
      const lineEnd = lineStart + line.length;

      // Find segments that overlap with this line
      const overlappingSegments = segments.filter(
        seg => seg.start < lineEnd && seg.end > lineStart
      );

      if (overlappingSegments.length === 0) return;

      // Get highest severity
      const severities = overlappingSegments.flatMap(seg => seg.rules.map(r => r.severity));
      const hasCritical = severities.includes('critical');
      const hasHigh = severities.includes('high');
      const hasMedium = severities.includes('medium');

      const severity = hasCritical
        ? 'critical'
        : hasHigh
        ? 'high'
        : hasMedium
        ? 'medium'
        : 'low';

      const color = hasCritical
        ? 'bg-red-500'
        : hasHigh
        ? 'bg-orange-500'
        : hasMedium
        ? 'bg-yellow-500'
        : 'bg-blue-500';

      markers.push({
        lineIndex,
        color,
        count: overlappingSegments.length,
        severity,
      });
    });

    return markers;
  }, [lines, segments]);

  if (lineMarkers.length === 0) return null;

  return (
    <div
      className="absolute top-0 right-0 w-3 h-full bg-gray-950 border-l border-gray-800 overflow-hidden rounded-r-lg"
      title="Overview map"
    >
      {lineMarkers.map((marker, idx) => {
        const top = (marker.lineIndex / lines.length) * 100;
        const height = Math.max(2, (1 / lines.length) * 100);

        return (
          <div
            key={`${marker.lineIndex}-${idx}`}
            className={`absolute w-full ${marker.color} opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
            style={{
              top: `${top}%`,
              height: `${height}%`,
              minHeight: '2px',
            }}
            title={`Line ${marker.lineIndex + 1}: ${marker.count} ${marker.severity} issue${marker.count > 1 ? 's' : ''}`}
          />
        );
      })}
    </div>
  );
}
