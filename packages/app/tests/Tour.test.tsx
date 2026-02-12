import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useTour } from '../src/hooks/useTour';
import TourOverlay from '../src/components/tour/TourOverlay';
import TourTooltip from '../src/components/tour/TourTooltip';
import { tourSteps } from '../src/components/tour/tourSteps';

// Mock useFocusTrap hook
vi.mock('../src/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

// Test component for useTour hook
function TourTestComponent() {
  const tour = useTour();

  return (
    <div>
      <button onClick={tour.startTour} data-testid="start-tour">
        Start Tour
      </button>
      <button onClick={tour.nextStep} data-testid="next-step">
        Next
      </button>
      <button onClick={tour.previousStep} data-testid="previous-step">
        Previous
      </button>
      <button onClick={tour.skipTour} data-testid="skip-tour">
        Skip
      </button>
      <div data-testid="tour-status">
        {tour.isActive ? 'active' : 'inactive'}
      </div>
      <div data-testid="current-step">{tour.currentStep}</div>
      <div data-testid="total-steps">{tour.totalSteps}</div>
    </div>
  );
}

describe('useTour hook', () => {
  it('should initialize with inactive state', () => {
    render(<TourTestComponent />);

    expect(screen.getByTestId('tour-status')).toHaveTextContent('inactive');
    expect(screen.getByTestId('current-step')).toHaveTextContent('0');
    expect(screen.getByTestId('total-steps')).toHaveTextContent('14');
  });

  it('should start tour when startTour is called', () => {
    render(<TourTestComponent />);

    fireEvent.click(screen.getByTestId('start-tour'));

    expect(screen.getByTestId('tour-status')).toHaveTextContent('active');
  });

  it('should navigate to next step', () => {
    render(<TourTestComponent />);

    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step'));

    expect(screen.getByTestId('current-step')).toHaveTextContent('1');
  });

  it('should navigate to previous step', () => {
    render(<TourTestComponent />);

    fireEvent.click(screen.getByTestId('start-tour'));
    fireEvent.click(screen.getByTestId('next-step'));
    fireEvent.click(screen.getByTestId('previous-step'));

    expect(screen.getByTestId('current-step')).toHaveTextContent('0');
  });

  it('should complete tour when reaching last step and clicking next', () => {
    const onComplete = vi.fn();

    function TestComponent() {
      const tour = useTour({ onComplete });

      return (
        <div>
          <button onClick={tour.startTour}>Start</button>
          <button onClick={() => tour.goToStep(13)}>Go to last step</button>
          <button onClick={tour.nextStep}>Next</button>
          <div data-testid="active">{tour.isActive ? 'yes' : 'no'}</div>
        </div>
      );
    }

    render(<TestComponent />);

    fireEvent.click(screen.getByText('Start'));
    fireEvent.click(screen.getByText('Go to last step'));
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByTestId('active')).toHaveTextContent('no');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should skip tour when skipTour is called', () => {
    const onSkip = vi.fn();

    function TestComponent() {
      const tour = useTour({ onSkip });

      return (
        <div>
          <button onClick={tour.startTour}>Start</button>
          <button onClick={tour.skipTour}>Skip</button>
          <div data-testid="active">{tour.isActive ? 'yes' : 'no'}</div>
        </div>
      );
    }

    render(<TestComponent />);

    fireEvent.click(screen.getByText('Start'));
    fireEvent.click(screen.getByText('Skip'));

    expect(screen.getByTestId('active')).toHaveTextContent('no');
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('TourTooltip', () => {
  const mockTargetRect = new DOMRect(100, 100, 200, 100);
  const mockStep = tourSteps[0];

  it('should render tooltip with correct content', () => {
    render(
      <TourTooltip
        step={mockStep}
        currentStep={0}
        totalSteps={14}
        targetRect={mockTargetRect}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    expect(screen.getByText('Welcome to Forensicate.ai')).toBeInTheDocument();
    expect(screen.getByText(/This scanner helps you detect/)).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 14')).toBeInTheDocument();
  });

  it('should disable Previous button on first step', () => {
    render(
      <TourTooltip
        step={mockStep}
        currentStep={0}
        totalSteps={14}
        targetRect={mockTargetRect}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    const prevButton = screen.getByLabelText('Previous step');
    expect(prevButton).toBeDisabled();
  });

  it('should show Finish button on last step', () => {
    render(
      <TourTooltip
        step={tourSteps[13]}
        currentStep={13}
        totalSteps={14}
        targetRect={mockTargetRect}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    expect(screen.getByText(/Finish/)).toBeInTheDocument();
  });

  it('should call onNext when Next button is clicked', () => {
    const onNext = vi.fn();

    render(
      <TourTooltip
        step={mockStep}
        currentStep={0}
        totalSteps={14}
        targetRect={mockTargetRect}
        onNext={onNext}
        onPrevious={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('should call onSkip when close button is clicked', () => {
    const onSkip = vi.fn();

    render(
      <TourTooltip
        step={mockStep}
        currentStep={0}
        totalSteps={14}
        targetRect={mockTargetRect}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onSkip={onSkip}
      />
    );

    fireEvent.click(screen.getByLabelText('Skip tour'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('tourSteps configuration', () => {
  it('should have 14 tour steps', () => {
    expect(tourSteps).toHaveLength(14);
  });

  it('should have valid step structure', () => {
    tourSteps.forEach((step, index) => {
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('target');
      expect(step).toHaveProperty('title');
      expect(step).toHaveProperty('description');
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.target).toMatch(/^\[data-tour="[\w-]+"\]$/);
    });
  });

  it('should cover all major features', () => {
    const stepIds = tourSteps.map(s => s.id);

    expect(stepIds).toContain('welcome');
    expect(stepIds).toContain('prompt-input');
    expect(stepIds).toContain('scan-controls');
    expect(stepIds).toContain('scan-results');
    expect(stepIds).toContain('annotated-view');
    expect(stepIds).toContain('cost-estimator');
    expect(stepIds).toContain('rules-panel');
    expect(stepIds).toContain('community-rules');
    expect(stepIds).toContain('test-battery');
    expect(stepIds).toContain('community-prompts');
    expect(stepIds).toContain('config-panel');
    expect(stepIds).toContain('standalone-button');
    expect(stepIds).toContain('github-button');
    expect(stepIds).toContain('extension-button');
  });
});
