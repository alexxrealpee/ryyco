/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface RyycoCartBagIllustrationProps {
  className?: string;
}

export const RyycoCartBagIllustration: React.FC<RyycoCartBagIllustrationProps> = ({
  className = 'w-36 h-36',
}) => {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Halo cálido suave decorativo de fondo */}
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-50/80 to-amber-50/60 rounded-full blur-xl pointer-events-none" />

      {/* Recurso oficial optimizado de la bolsa blanca con chef sonriente y destellos dorados (17 KB WebP) */}
      <picture className="relative z-10 w-full h-full flex items-center justify-center">
        <source
          srcSet="/assets/bolsa-carrito.webp"
          type="image/webp"
        />
        <img
          src="/assets/bolsa-carrito.png"
          alt="Bolsa de pedidos RYYCO vacía esperando insumos"
          width={180}
          height={180}
          loading="eager"
          decoding="async"
          className="w-full h-full object-contain filter drop-shadow-sm pointer-events-none"
        />
      </picture>
    </div>
  );
};
