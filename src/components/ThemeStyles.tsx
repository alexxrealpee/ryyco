/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CustomTheme } from '../types';

export function getFontClass(font: string): string {
  switch (font) {
    case 'font-sans':
      return 'font-sans';
    case 'font-serif':
      return 'font-serif';
    case 'font-mono':
      return 'font-mono';
    case 'font-display':
      return 'font-sans tracking-tight font-extrabold';
    default:
      return 'font-sans';
  }
}

export function getButtonStyle(style: string, theme: CustomTheme): string {
  const common = "w-full py-4 px-6 text-center transition-all duration-300 flex items-center justify-between font-medium text-sm border";
  
  let radius = "rounded-lg";
  if (style === 'square') radius = "rounded-none";
  if (style === 'pill') radius = "rounded-full";
  if (style === 'bordered') radius = "rounded-lg border-2";
  
  let appearance = "";
  if (theme.id === 'cyberpunk') {
    appearance = `bg-black/80 hover:bg-emerald-500/10 border-emerald-500 text-emerald-400 font-mono shadow-[0_0_10px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:translate-y-[1px]`;
    return `${common} ${radius} ${appearance}`;
  }

  if (style === 'shadow') {
    appearance = `shadow-[4px_4px_0px_#111827] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#111827] active:translate-x-[0px] active:translate-y-[0px] active:shadow-[2px_2px_0px_#111827]`;
  } else if (style === 'bordered') {
    appearance = `bg-transparent hover:bg-black/5 active:scale-[0.98]`;
  } else {
    // rounded or pill, flat filled
    appearance = `shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99]`;
  }

  // Set background colors dynamically
  return `${common} ${radius} ${appearance}`;
}

export function ThemeBackground({ theme, children }: { theme: CustomTheme; children: React.ReactNode }) {
  const isGradient = theme.bgType === 'gradient';
  const bgStyle: React.CSSProperties = isGradient
    ? { backgroundImage: theme.bgColor }
    : { backgroundColor: theme.bgColor };

  return (
    <div 
      className={`min-h-screen py-10 px-4 flex flex-col items-center transition-all duration-500 ${getFontClass(theme.fontFamily)}`}
      style={{ ...bgStyle, color: theme.textColor }}
    >
      <div className="w-full max-w-md flex flex-col items-center flex-grow">
        {children}
      </div>
    </div>
  );
}
