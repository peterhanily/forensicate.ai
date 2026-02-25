import { useEffect, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import TourTooltip from './TourTooltip';
import type { TourStep } from './tourSteps';

interface TourOverlayProps {
  isActive: boolean;
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  targetElement: HTMLElement | null;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export default function TourOverlay({
  isActive,
  step,
  currentStep,
  totalSteps,
  targetElement,
  onNext,
  onPrevious,
  onSkip,
}: TourOverlayProps) {
  const overlayRef = useFocusTrap<HTMLDivElement>(isActive);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});

  // Update target rect and spotlight when target element changes
  useEffect(() => {
    if (!targetElement) {
      setTimeout(() => setTargetRect(null), 0);
      return;
    }

    const updateRect = () => {
      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);

      // Calculate spotlight clip-path
      const padding = 8; // padding around highlighted element
      const x = Math.max(0, rect.left - padding);
      const y = Math.max(0, rect.top - padding);
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;

      // Create clip-path polygon that cuts out the highlighted area
      // The polygon creates a "hole" in the overlay
      setSpotlightStyle({
        clipPath: `polygon(
          0% 0%,
          100% 0%,
          100% 100%,
          0% 100%,
          0% 0%,
          ${x}px ${y}px,
          ${x}px ${y + height}px,
          ${x + width}px ${y + height}px,
          ${x + width}px ${y}px,
          ${x}px ${y}px
        )`,
      });
    };

    updateRect();

    // Update on scroll and resize
    const handleUpdate = () => {
      requestAnimationFrame(updateRect);
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [targetElement]);

  if (!isActive || !targetRect) {
    return null;
  }

  return (
    <div ref={overlayRef}>
      {/* Overlay with spotlight cutout */}
      <div
        className="tour-overlay"
        style={spotlightStyle}
        aria-hidden="true"
      />

      {/* Tooltip */}
      <TourTooltip
        step={step}
        currentStep={currentStep}
        totalSteps={totalSteps}
        targetRect={targetRect}
        onNext={onNext}
        onPrevious={onPrevious}
        onSkip={onSkip}
      />

      {/* Screen reader announcement */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {currentStep + 1} of {totalSteps}: {step.title}. {step.description}
      </div>
    </div>
  );
}
