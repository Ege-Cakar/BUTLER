// Create a new file src/components/ComputerUseIndicator.tsx
import React from 'react';

export default function ComputerUseIndicator() {
  return (
    <div className="flex items-center p-3 my-2 bg-butler-accent/10 rounded-lg">
      <div className="w-5 h-5 mr-3 border-2 border-butler-primary border-t-transparent rounded-full animate-spin"></div>
      <span className="text-butler-dark">Using the computer...</span>
    </div>
  );
}