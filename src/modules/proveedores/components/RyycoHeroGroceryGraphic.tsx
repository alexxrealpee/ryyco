/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface RyycoHeroGroceryGraphicProps {
  className?: string;
}

export const RyycoHeroGroceryGraphic: React.FC<RyycoHeroGroceryGraphicProps> = ({
  className = '',
}) => {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Contenedor redondeado con tono cálido melocotón / crema como en el diseño de referencia PC */}
      <div className="relative w-full max-w-[480px] aspect-[4/3] rounded-[28px] bg-gradient-to-br from-[#FEEFE4] via-[#FDE8D8] to-[#FCDCC8] p-3 sm:p-5 flex items-center justify-center overflow-hidden shadow-sm border border-[#FAD6BC]/60">
        
        {/* Rayitas decorativas amarillas a la izquierda de la bolsa (como en el mockup oficial) */}
        <div className="absolute left-4 sm:left-7 top-[38%] flex flex-col gap-1.5 sm:gap-2 z-10 pointer-events-none opacity-90">
          <span className="w-4 sm:w-6 h-1.5 sm:h-2 bg-[#F59E0B] rounded-full transform -rotate-12 shadow-xs" />
          <span className="w-5 sm:w-8 h-1.5 sm:h-2 bg-[#F59E0B] rounded-full transform rotate-3 shadow-xs" />
          <span className="w-3.5 sm:w-5 h-1.5 sm:h-2 bg-[#F59E0B] rounded-full transform -rotate-8 shadow-xs" />
        </div>

        {/* Imagen optimizada en WebP con fallback PNG: 82KB ultraligera con máxima fidelidad */}
        <div className="relative z-20 w-full h-full flex items-center justify-center">
          <picture className="w-full h-full flex items-center justify-center">
            {/* Formato WebP comprimido de alta eficiencia (82 KB) */}
            <source
              srcSet="/assets/bolsa-ryyco-hero.webp"
              type="image/webp"
            />
            {/* Fallback PNG optimizado (70 KB) */}
            <img
              src="/assets/bolsa-ryyco-opt.png"
              alt="Bolsa de insumos al por mayor RYYCO con hortalizas frescas"
              width={480}
              height={480}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-contain filter drop-shadow-md transform hover:scale-[1.02] transition-transform duration-300 pointer-events-none"
            />
          </picture>
        </div>

        {/* Brillo sutil de fondo */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/40 rounded-full blur-2xl pointer-events-none" />
      </div>
    </div>
  );
};
