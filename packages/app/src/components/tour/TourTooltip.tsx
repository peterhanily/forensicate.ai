import { useEffect, useState } from 'react';
import type { TourStep } from './tourSteps';

interface TourTooltipProps {
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  targetRect: DOMRect;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: 'top' | 'bottom' | 'left' | 'right';
  arrowOffset: number;
}

const TOOLTIP_PADDING = 16;
const TOOLTIP_WIDTH = 320;

function calculatePosition(
  targetRect: DOMRect,
  preferredPlacement: TourStep['placement'] = 'bottom'
): TooltipPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipHeight = 200; // Approximate height

  // Try preferred placement first, then fallback
  const placements: Array<'bottom' | 'top' | 'right' | 'left'> = [
    preferredPlacement || 'bottom',
    'bottom',
    'top',
    'right',
    'left',
  ];

  for (const placement of placements) {
    let top = 0;
    let left = 0;
    let arrowPosition: TooltipPosition['arrowPosition'] = 'top';
    let arrowOffset = 0;

    switch (placement) {
      case 'bottom':
        top = targetRect.bottom + 12;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
        arrowPosition = 'top';
        arrowOffset = 50; // percentage from left
        break;
      case 'top':
        top = targetRect.top - tooltipHeight - 12;
        left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2;
        arrowPosition = 'bottom';
        arrowOffset = 50;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + 12;
        arrowPosition = 'left';
        arrowOffset = 50; // percentage from top
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - TOOLTIP_WIDTH - 12;
        arrowPosition = 'right';
        arrowOffset = 50;
        break;
    }

    // Check if tooltip fits in viewport
    const fitsHorizontally =
      left >= TOOLTIP_PADDING &&
      left + TOOLTIP_WIDTH <= viewportWidth - TOOLTIP_PADDING;
    const fitsVertically =
      top >= TOOLTIP_PADDING &&
      top + tooltipHeight <= viewportHeight - TOOLTIP_PADDING;

    if (fitsHorizontally && fitsVertically) {
      return { top, left, arrowPosition, arrowOffset };
    }
  }

  // Fallback: center on screen
  return {
    top: viewportHeight / 2 - tooltipHeight / 2,
    left: viewportWidth / 2 - TOOLTIP_WIDTH / 2,
    arrowPosition: 'top',
    arrowOffset: 50,
  };
}

export default function TourTooltip({
  step,
  currentStep,
  totalSteps,
  targetRect,
  onNext,
  onPrevious,
  onSkip,
}: TourTooltipProps) {
  const [position, setPosition] = useState<TooltipPosition>(() =>
    calculatePosition(targetRect, step.placement)
  );

  useEffect(() => {
    const newPosition = calculatePosition(targetRect, step.placement);
    setPosition(newPosition);
  }, [targetRect, step.placement]);

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      className="tour-tooltip"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${TOOLTIP_WIDTH}px`,
        zIndex: 10001,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-description"
    >
      {/* Arrow */}
      <div
        className={`tour-tooltip-arrow tour-tooltip-arrow-${position.arrowPosition}`}
        style={{
          [position.arrowPosition === 'left' || position.arrowPosition === 'right'
            ? 'top'
            : 'left']: `${position.arrowOffset}%`,
        }}
      />

      {/* Content */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="text-xs text-[#c9a227] font-mono mb-1">
              Step {currentStep + 1} of {totalSteps}
            </div>
            <h3 id="tour-title" className="text-lg font-semibold text-gray-100">
              {step.title}
            </h3>
          </div>
          <button
            onClick={onSkip}
            className="text-gray-500 hover:text-gray-300 transition-colors ml-2"
            aria-label="Skip tour"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p id="tour-description" className="text-sm text-gray-400 mb-4 leading-relaxed">
          {step.description}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={onPrevious}
            disabled={isFirstStep}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              isFirstStep
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
            aria-label="Previous step"
          >
            ← Previous
          </button>

          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-[#c9a227]'
                    : index < currentStep
                    ? 'bg-[#c9a227]/50'
                    : 'bg-gray-700'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>

          <button
            onClick={onNext}
            className="px-4 py-1.5 bg-[#c9a227] text-gray-900 text-sm font-semibold rounded hover:bg-[#d4b030] transition-colors"
            aria-label={isLastStep ? 'Finish tour' : 'Next step'}
          >
            {isLastStep ? 'Finish' : 'Next'} →
          </button>
        </div>
      </div>
    </div>
  );
}
