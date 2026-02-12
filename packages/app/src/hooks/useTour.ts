import { useState, useEffect, useRef, useCallback } from 'react';
import { tourSteps, type TourStep } from '../components/tour/tourSteps';

export interface UseTourReturn {
  isActive: boolean;
  currentStep: number;
  currentStepData: TourStep | null;
  targetElement: HTMLElement | null;
  startTour: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  goToStep: (stepIndex: number) => void;
  totalSteps: number;
}

interface UseTourOptions {
  onComplete?: () => void;
  onSkip?: () => void;
  onStart?: () => void;
}

export function useTour({ onComplete, onSkip, onStart }: UseTourOptions = {}): UseTourReturn {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const currentStepData = isActive && currentStep < tourSteps.length
    ? tourSteps[currentStep]
    : null;

  // Update target element when step changes
  useEffect(() => {
    if (!isActive || !currentStepData) {
      setTargetElement(null);
      return;
    }

    // Call beforeShow callback if it exists (handles scrolling and panel expansion)
    if (currentStepData.beforeShow) {
      currentStepData.beforeShow();
    }

    // Find target element
    const findTarget = () => {
      const element = document.querySelector<HTMLElement>(currentStepData.target);
      if (element) {
        setTargetElement(element);
      }
    };

    // Wait for beforeShow actions to complete (scrolling, expanding panels)
    // Then find the target element
    const timeoutId = setTimeout(findTarget, 300);

    return () => clearTimeout(timeoutId);
  }, [isActive, currentStep, currentStepData]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          nextStep();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          previousStep();
          break;
        case 'Escape':
          event.preventDefault();
          skipTour();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTour = useCallback(() => {
    // Store currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;
    setIsActive(true);
    setCurrentStep(0);
    if (onStart) {
      onStart();
    }
  }, [onStart]);

  const nextStep = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Tour completed
      setIsActive(false);
      setCurrentStep(0);
      if (onComplete) {
        onComplete();
      }
      // Restore focus
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus();
      }
    }
  }, [currentStep, onComplete]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    if (onSkip) {
      onSkip();
    }
    // Restore focus
    if (previousActiveElement.current && previousActiveElement.current.focus) {
      previousActiveElement.current.focus();
    }
  }, [onSkip]);

  const goToStep = useCallback((stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < tourSteps.length) {
      setCurrentStep(stepIndex);
    }
  }, []);

  return {
    isActive,
    currentStep,
    currentStepData,
    targetElement,
    startTour,
    nextStep,
    previousStep,
    skipTour,
    goToStep,
    totalSteps: tourSteps.length,
  };
}
