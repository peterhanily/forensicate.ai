export interface TourStep {
  id: string;
  target: string; // CSS selector for the target element
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  beforeShow?: () => void; // Optional callback before showing step
}

export const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="header"]',
    title: 'Welcome to Forensicate.ai',
    description: 'This scanner helps you detect prompt injection attacks using 78+ detection rules. Everything runs in your browser - no API keys or server required.',
    placement: 'bottom',
  },
  {
    id: 'prompt-input',
    target: '[data-tour="prompt-input"]',
    title: 'Paste Your Prompt',
    description: 'Enter or paste the prompt you want to analyze here. We\'ve included a sample prompt for this tour so you can see the scanner in action.',
    placement: 'bottom',
  },
  {
    id: 'scan-controls',
    target: '[data-tour="scan-controls"]',
    title: 'Scan Controls',
    description: 'Auto-scan analyzes prompts as you type. You can adjust the confidence threshold to control how strict the detection is (higher = fewer false positives).',
    placement: 'bottom',
  },
  {
    id: 'scan-results',
    target: '[data-tour="scan-results"]',
    title: 'View Scan Results',
    description: 'See the overall risk level and which detection rules matched. Each match shows the severity, category, and confidence score.',
    placement: 'top',
  },
  {
    id: 'annotated-view',
    target: '[data-tour="annotated-view"]',
    title: 'Annotated Highlights',
    description: 'Click on highlighted text segments to see which rule detected them. This helps you understand exactly where potential injection attempts were found.',
    placement: 'top',
    beforeShow: () => {
      // Expand the annotated view section
      const annotatedSection = document.querySelector('[data-tour="annotated-view"] button') as HTMLButtonElement;
      if (annotatedSection && !annotatedSection.getAttribute('aria-expanded')) {
        annotatedSection.click();
      }
    },
  },
  {
    id: 'cost-estimator',
    target: '[data-tour="cost-estimator"]',
    title: 'Cost Estimator',
    description: 'Estimate the token count and API costs for your prompts across different AI providers (OpenAI, Anthropic, Google, etc.). Helps you budget for production deployments.',
    placement: 'top',
  },
  {
    id: 'rules-panel',
    target: '[data-tour="rules-panel"]',
    title: 'Detection Rules',
    description: 'Browse and customize the detection rules. You can enable/disable rules, adjust their weights, view rule logic, and even add your own custom rules.',
    placement: 'right',
  },
  {
    id: 'community-rules',
    target: '[data-tour="community-rules-tab"]',
    title: 'Community Rules',
    description: 'Explore detection rules submitted by the community. You can import any rule into your local collection. Submit your own custom rules via GitHub to share with others!',
    placement: 'right',
    beforeShow: () => {
      // Click the community tab to show it
      const communityTab = document.querySelector('[data-tour="community-rules-tab"]') as HTMLButtonElement;
      if (communityTab) {
        communityTab.click();
      }
    },
  },
  {
    id: 'test-battery',
    target: '[data-tour="test-battery"]',
    title: 'Test Prompts',
    description: 'Use pre-built test prompts to see how the scanner works. You can also add your own test cases and run batch scans across multiple prompts.',
    placement: 'left',
  },
  {
    id: 'community-prompts',
    target: '[data-tour="community-prompts-tab"]',
    title: 'Community Test Prompts',
    description: 'Access test prompts shared by the community, including real-world injection examples. Import them to your collection or submit your own via GitHub!',
    placement: 'left',
    beforeShow: () => {
      // Click the community tab to show it
      const communityTab = document.querySelector('[data-tour="community-prompts-tab"]') as HTMLButtonElement;
      if (communityTab) {
        communityTab.click();
      }
    },
  },
  {
    id: 'config-panel',
    target: '[data-tour="config-panel"]',
    title: 'Configuration & Sharing',
    description: 'Export your custom rules and settings, or generate a shareable URL to collaborate with others. You can also reset to defaults at any time.',
    placement: 'top',
  },
  {
    id: 'standalone-button',
    target: '[data-tour="standalone-button"]',
    title: 'Offline Standalone Version',
    description: 'Download a single HTML file that works completely offline. Perfect for air-gapped environments, security testing, or keeping a local backup.',
    placement: 'bottom',
    beforeShow: () => {
      // Scroll to top to show header
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  },
  {
    id: 'github-button',
    target: '[data-tour="github-button"]',
    title: 'View Source on GitHub',
    description: 'Forensicate.ai is open source! View the code, report issues, submit pull requests, or contribute community rules and test prompts.',
    placement: 'bottom',
  },
  {
    id: 'extension-button',
    target: '[data-tour="extension-button"]',
    title: 'Chrome Extension',
    description: 'Install the Chrome extension to scan prompts directly from any website. Right-click text to analyze it, build a library of suspicious prompts, and export your findings.',
    placement: 'bottom',
  },
];
