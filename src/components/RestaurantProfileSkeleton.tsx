import React from 'react';
import { 
  Utensils, 
  ShoppingBag, 
  Search, 
  QrCode, 
  Heart, 
  MapPin, 
  Clock, 
  Sparkles,
  Phone,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface RestaurantProfileSkeletonProps {
  username?: string;
}

export default function RestaurantProfileSkeleton({ username }: RestaurantProfileSkeletonProps) {
  return (
    <div className="min-h-screen bg-[#090B12] text-white flex flex-col select-none overflow-x-hidden relative font-sans">
      
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-10 w-96 h-96 bg-[#E63946]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      {/* 1. STICKY NAVBAR SKELETON */}
      <header className="w-full h-20 border-b border-white/[0.08] sticky top-0 z-40 bg-[#111827]/80 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-8 flex items-center justify-between">
          
          {/* Brand Logo & Name Skeleton */}
          <div className="flex items-center gap-3">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-white/10 border-2 border-white/10 flex items-center justify-center relative overflow-hidden shrink-0">
              <Utensils className="w-6 h-6 text-white/20" />
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-28 sm:w-36 bg-white/15 rounded-md relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-amber-400/70 font-semibold">
                  {username ? `@${username}` : '@restaurante'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Center: Desktop Nav Links Skeleton */}
          <nav className="hidden md:flex items-center gap-8">
            <div className="h-3 w-14 bg-white/10 rounded-full" />
            <div className="h-3 w-20 bg-white/10 rounded-full" />
            <div className="h-3 w-16 bg-white/10 rounded-full" />
            <div className="h-3 w-16 bg-white/10 rounded-full" />
          </nav>

          {/* Right Action Icons Skeleton */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search Icon */}
            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
              <Search className="w-4 h-4 opacity-50" />
            </div>

            {/* QR Icon */}
            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
              <QrCode className="w-4 h-4 opacity-50" />
            </div>

            {/* Recommendation Heart Pill Skeleton */}
            <div className="h-9 px-3 rounded-full bg-white/5 border border-white/10 hidden sm:flex items-center gap-1.5 text-white/30">
              <Heart className="w-4 h-4 text-red-500/40" />
              <div className="h-2.5 w-12 bg-white/10 rounded-full" />
            </div>

            {/* Cart Button Skeleton */}
            <div className="h-9 px-3.5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center gap-1.5 text-amber-300/60 relative overflow-hidden">
              <ShoppingBag className="w-4 h-4" />
              <div className="w-4 h-4 rounded-full bg-amber-400/30" />
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </div>
        </div>
      </header>

      {/* 2. IMMERSIVE HERO & COVER SKELETON */}
      <section className="w-full relative min-h-[380px] sm:min-h-[440px] md:min-h-[500px] flex items-center justify-center bg-stone-950 overflow-hidden text-center border-b border-white/[0.08]">
        {/* Cover Shimmer Backdrop */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-stone-900/90 via-stone-950/95 to-[#090B12]">
          <div className="w-full h-full opacity-30 flex items-center justify-center">
            <Utensils className="w-32 h-32 sm:w-48 sm:h-48 text-white/5 animate-pulse" />
          </div>
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        </div>

        {/* Hero Content Skeletons */}
        <div className="relative z-10 max-w-4xl px-4 py-12 flex flex-col items-center w-full">
          
          {/* Floating Verified Badge Skeleton */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/10 border border-white/15 rounded-full text-xs font-semibold text-white/70 mb-5 backdrop-blur-sm shadow-md">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Cargando restaurante...</span>
          </div>

          {/* Big Restaurant Headline Placeholder */}
          <div className="w-full max-w-xl mx-auto space-y-2 mb-4">
            <div className="h-9 sm:h-12 md:h-14 w-4/5 mx-auto bg-white/15 rounded-2xl relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>
            <div className="h-8 sm:h-11 md:h-12 w-3/5 mx-auto bg-white/10 rounded-2xl relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>
          </div>

          {/* Restaurant Bio / Description Placeholder */}
          <div className="w-full max-w-md mx-auto space-y-1.5 mb-6">
            <div className="h-3 w-full bg-white/10 rounded-full relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="h-3 w-3/4 mx-auto bg-white/10 rounded-full relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </div>

          {/* Social Icons Row Skeleton */}
          <div className="flex items-center justify-center gap-3 mb-7">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center" />
            ))}
          </div>

          {/* Main CTA Button Skeleton */}
          <div className="h-12 px-8 rounded-full bg-gradient-to-r from-amber-500/30 to-orange-500/30 border border-amber-500/40 text-amber-300 flex items-center gap-2 shadow-lg relative overflow-hidden">
            <Utensils className="w-4 h-4 opacity-70" />
            <span className="text-xs font-black tracking-widest uppercase opacity-80">CARGANDO MENÚ</span>
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </div>

        </div>
      </section>

      {/* 2.5 RESTAURANT RECOMMENDATION / QUICK INFO CARD SKELETON */}
      <section className="w-full max-w-7xl mx-auto px-4 md:px-8 mt-6">
        <div className="w-full p-4 sm:p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden">
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
              <Heart className="w-6 h-6 text-red-400 animate-pulse fill-red-400/30" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-40 sm:w-52 bg-white/15 rounded-md relative overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
              <div className="h-2.5 w-28 bg-white/10 rounded-full" />
            </div>
          </div>

          {/* Quick Info Badges */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-start sm:justify-end">
            <div className="h-8 px-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 text-xs text-white/50">
              <Clock className="w-3.5 h-3.5 text-amber-400/60" />
              <div className="h-2.5 w-16 bg-white/10 rounded-full" />
            </div>
            <div className="h-8 px-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 text-xs text-white/50">
              <MapPin className="w-3.5 h-3.5 text-emerald-400/60" />
              <div className="h-2.5 w-20 bg-white/10 rounded-full" />
            </div>
          </div>

          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent pointer-events-none" />
        </div>
      </section>

      {/* 3. CATEGORIES ROW SKELETON */}
      <section className="w-full max-w-7xl mx-auto px-4 md:px-8 mt-10 mb-4">
        <div className="border-b border-white/10 pb-5 mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="h-2.5 w-32 bg-white/10 rounded-full mb-2" />
            <div className="h-6 w-48 bg-white/15 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </div>
          <div className="h-3 w-28 bg-white/10 rounded-full" />
        </div>

        {/* Categories Grid (4 cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((catIdx) => (
            <div 
              key={catIdx}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-white/10 bg-white/[0.02] relative overflow-hidden"
            >
              <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4 text-white/20" />
              </div>
              <div className="flex-grow space-y-1.5 min-w-0">
                <div className="h-2 w-12 bg-white/10 rounded-full" />
                <div className="h-3.5 w-20 bg-white/15 rounded-md" />
              </div>
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
            </div>
          ))}
        </div>
      </section>

      {/* 4. PRODUCTS & DISHES FEED GRID SKELETON */}
      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 mt-6 flex flex-col flex-grow z-10 mb-16">
        
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <div className="h-4 w-36 bg-white/15 rounded-md relative overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </div>
          <div className="h-8 w-32 bg-white/5 border border-white/10 rounded-xl hidden sm:block" />
        </div>

        {/* 8 Product Cards Grid (Matches gastronomy card layout) */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((itemIdx) => (
            <div
              key={itemIdx}
              className="border border-white/10 rounded-3xl overflow-hidden flex flex-col justify-between bg-white/[0.02] relative backdrop-blur-sm shadow-md"
            >
              <div>
                {/* Product Image Stage Skeleton */}
                <div className="w-full aspect-square bg-gradient-to-b from-black/50 to-white/[0.03] overflow-hidden flex items-center justify-center relative border-b border-white/5">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <Utensils className="w-7 h-7 text-white/15" />
                  </div>
                  
                  {/* Floating Heart Recommendation Skeleton */}
                  <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-white/20" />
                  </div>

                  {/* Top-left Promo Pill Skeleton */}
                  {itemIdx % 3 === 0 && (
                    <div className="absolute top-3 left-3 h-5 w-20 rounded-full bg-red-500/20 border border-red-500/30" />
                  )}

                  {/* Shimmer sweep */}
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>

                {/* Card Content Skeleton */}
                <div className="p-3.5 flex flex-col gap-2">
                  {/* Category tag */}
                  <div className="flex items-center justify-between">
                    <div className="h-2.5 w-16 bg-amber-400/20 rounded-full" />
                    <div className="h-2.5 w-8 bg-white/10 rounded-full" />
                  </div>

                  {/* Dish Title (2 lines) */}
                  <div className="space-y-1.5 min-h-[2.2rem]">
                    <div className="h-3.5 w-4/5 bg-white/15 rounded-md relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    <div className="h-3.5 w-3/5 bg-white/10 rounded-md" />
                  </div>

                  {/* Short Description */}
                  <div className="h-2 w-full bg-white/5 rounded-full" />
                </div>
              </div>

              {/* Card Footer (Price & Order Button) */}
              <div className="px-3.5 pb-3.5 pt-2 flex items-center justify-between gap-1 border-t border-white/10 mt-auto">
                <div className="space-y-1">
                  <div className="h-4 w-16 bg-amber-400/25 rounded-md relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                  <div className="h-2 w-10 bg-white/5 rounded-full" />
                </div>

                {/* Order Button Pill Skeleton */}
                <div className="h-7 px-3 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center gap-1.5 text-amber-300/60">
                  <span className="text-[9px] font-black uppercase tracking-wider">PEDIR</span>
                  <Utensils className="w-2.5 h-2.5" />
                </div>
              </div>

            </div>
          ))}
        </div>

      </div>

      {/* 5. FOOTER SKELETON */}
      <footer className="w-full mt-auto border-t border-white/10 py-10 bg-[#111827]/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/10" />
            <div className="space-y-1.5">
              <div className="h-2 w-20 bg-white/10 rounded-full" />
              <div className="h-4 w-32 bg-white/15 rounded-md" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
            ))}
          </div>

        </div>
      </footer>

    </div>
  );
}
