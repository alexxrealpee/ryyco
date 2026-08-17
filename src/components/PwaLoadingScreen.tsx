import React from 'react';

interface PwaLoadingScreenProps {
  message?: string;
  subtext?: string;
}

export default function PwaLoadingScreen({}: PwaLoadingScreenProps) {
  return (
    <div className="min-h-screen w-full bg-[#090B12] flex flex-col items-center justify-center p-4 text-white relative overflow-hidden select-none font-sans">
      
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 bg-[#E63946]/15 blur-[100px] rounded-full pointer-events-none -z-0" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-60 h-60 bg-[#F4B400]/10 blur-[90px] rounded-full pointer-events-none -z-0" />

      {/* Main Center Container: Multi-Ring Animated Loader */}
      <div className="flex flex-col items-center justify-center gap-6 z-10 text-center">
        
        {/* Modern Multi-Ring Animated Spinner */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border-4 border-[#E63946]/20 border-t-[#E63946] border-r-[#F4B400] animate-spin" style={{ animationDuration: '1.2s' }} />
          
          {/* Inner Ring */}
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-3 border-[#F4B400]/20 border-b-[#F4B400] border-l-[#E63946] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
          
          {/* Center Glowing Pulse Core */}
          <div className="absolute w-6 h-6 rounded-full bg-[#E63946]/30 flex items-center justify-center animate-ping">
            <div className="w-3 h-3 rounded-full bg-[#F4B400]" />
          </div>
        </div>

        {/* Pulsing Progress Line */}
        <div className="w-44 sm:w-56 h-1 bg-[#111827] rounded-full overflow-hidden relative border border-[#232B3A]">
          <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-[#E63946] via-[#F4B400] to-[#E63946] w-full animate-pulse" />
        </div>

      </div>

    </div>
  );
}

