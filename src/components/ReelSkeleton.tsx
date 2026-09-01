import React from 'react';
import { ArrowLeft, ShoppingCart, Pause, Utensils, Heart, Share2, Plus, Sparkles } from 'lucide-react';

export default function ReelSkeleton() {
  return (
    <div className="fixed inset-0 bg-[#090B12] text-white flex flex-col justify-between overflow-hidden select-none z-50 animate-pulse">
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#E63946]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#F4B400]/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent via-50% to-black/90" />
      </div>

      {/* 1. Header Bar */}
      <header className="relative z-30 px-4 pt-4 pb-2 flex items-center justify-between">
        {/* Back Button */}
        <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50">
          <ArrowLeft className="w-5 h-5 opacity-60" />
        </div>

        {/* Center Tabs Skeleton */}
        <div className="flex items-center gap-4 text-xs font-black">
          <span className="text-gray-500 text-xs">Menú</span>
          <div className="h-3 w-[1px] bg-white/20" />
          <div className="relative text-white flex items-center gap-1">
            <span className="text-sm tracking-tight font-black opacity-80">Para Ti</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] animate-ping ml-0.5" />
            <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#E63946] rounded-full" />
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50">
            <ShoppingCart className="w-4 h-4 opacity-60" />
          </div>
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50">
            <Pause className="w-4 h-4 opacity-60" />
          </div>
        </div>
      </header>

      {/* 2. Main Stage Skeleton (Dish / Media Preview) */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-6 pointer-events-none">
        {/* Floating Category Badge */}
        <div className="absolute top-4 left-4 h-7 w-36 rounded-full bg-white/10 border border-white/10 backdrop-blur-md flex items-center px-3 gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-[#E63946]/40" />
          <div className="h-2.5 w-20 bg-white/20 rounded-full" />
        </div>

        {/* Big Shimmer Dish Card */}
        <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-3xl bg-white/5 border border-white/10 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-sm">
          <div className="w-24 h-24 rounded-full bg-white/10 border border-white/10 flex items-center justify-center mb-3">
            <Utensils className="w-10 h-10 text-white/20" />
          </div>
          <div className="h-3 w-32 bg-white/15 rounded-full mb-2" />
          <div className="h-2 w-20 bg-white/10 rounded-full" />

          {/* Shimmer sweep */}
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      </div>

      {/* 3. Right Action Column Skeleton */}
      <aside className="absolute right-3 bottom-24 z-30 flex flex-col items-center gap-4.5 pointer-events-none">
        {/* Store Avatar */}
        <div className="relative flex flex-col items-center mb-1">
          <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-[#E63946]/50 via-[#F4B400]/50 to-[#E63946]/50 shadow-xl">
            <div className="w-full h-full rounded-full bg-[#1E293B] border-2 border-black flex items-center justify-center">
              <div className="w-5 h-5 rounded-full bg-white/20" />
            </div>
          </div>
          <div className="absolute -bottom-2 w-5 h-5 bg-[#E63946]/80 text-white rounded-full flex items-center justify-center shadow-lg border border-black">
            <Plus className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Like Button */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white/40" />
          </div>
          <div className="h-2 w-6 bg-white/20 rounded-full" />
        </div>

        {/* Menú Button */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
            <Utensils className="w-5 h-5 text-[#F4B400]/50" />
          </div>
          <div className="h-2 w-7 bg-white/20 rounded-full" />
        </div>

        {/* Share Button */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white/40" />
          </div>
          <div className="h-2 w-8 bg-white/20 rounded-full" />
        </div>
      </aside>

      {/* 4. Bottom Left Product Info & CTA Skeleton */}
      <div className="relative z-30 p-4 pb-6 flex flex-col justify-end bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none pr-16">
        {/* Store Handle Tag */}
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-28 bg-white/20 rounded-full" />
          <div className="h-4 w-12 bg-white/10 rounded-full" />
        </div>

        {/* Product Name & Price Badge */}
        <div className="flex items-center gap-2 mb-2">
          <div className="h-5 w-44 bg-white/25 rounded-md" />
          <div className="h-6 w-20 bg-[#F4B400]/30 rounded-lg" />
        </div>

        {/* Description line */}
        <div className="space-y-1.5 mb-3 max-w-xs">
          <div className="h-3 w-full bg-white/15 rounded-full" />
          <div className="h-3 w-3/4 bg-white/10 rounded-full" />
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 h-11 bg-gradient-to-r from-[#E63946]/40 to-[#D62839]/40 rounded-2xl border border-white/10 flex items-center justify-center gap-2">
            <div className="w-4 h-4 rounded bg-white/30" />
            <div className="h-3 w-28 bg-white/30 rounded-full" />
          </div>
          <div className="w-11 h-11 bg-emerald-600/30 rounded-2xl border border-white/10 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
