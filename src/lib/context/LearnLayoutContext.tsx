
import React, { createContext, useContext, useState, useEffect } from 'react';

export type LearnLayoutType = '3-layout' | 'toc-content' | 'content-tutor' | 'content-only';

interface LearnLayoutContextType {
  layout: LearnLayoutType;
  setLayout: (layout: LearnLayoutType) => void;
}

const LearnLayoutContext = createContext<LearnLayoutContextType | undefined>(undefined);

export function LearnLayoutProvider({ children }: { children: React.ReactNode }) {
  // Default to 'toc-content': the AI tutor panel ('3-layout' / 'content-tutor') isn't built yet (Phase 5).
  const [layout, setLayout] = useState<LearnLayoutType>('toc-content');

  // Load layout preference from localStorage on mount. Stale '3-layout'/'content-tutor'
  // values from a future build are still accepted here — Learn.tsx treats anything
  // other than 'content-only' as "show TOC", so they degrade gracefully.
  useEffect(() => {
    const savedLayout = localStorage.getItem('open-tutorials-learn-layout') as LearnLayoutType;
    if (savedLayout && ['3-layout', 'toc-content', 'content-tutor', 'content-only'].includes(savedLayout)) {
      setLayout(savedLayout);
    }
  }, []);

  const handleSetLayout = (newLayout: LearnLayoutType) => {
    setLayout(newLayout);
    localStorage.setItem('open-tutorials-learn-layout', newLayout);
  };

  return (
    <LearnLayoutContext.Provider value={{ layout, setLayout: handleSetLayout }}>
      {children}
    </LearnLayoutContext.Provider>
  );
}

export function useLearnLayout() {
  const context = useContext(LearnLayoutContext);
  if (context === undefined) {
    return {
      layout: '3-layout' as LearnLayoutType,
      setLayout: () => {},
    };
  }
  return context;
}
