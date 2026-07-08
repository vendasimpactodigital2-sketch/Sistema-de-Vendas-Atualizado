import React from "react";

interface NexvoltLogoProps {
  className?: string;
  showText?: boolean;
  iconSize?: number;
}

export function NexvoltLogo({ className = "", showText = false, iconSize = 32 }: NexvoltLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Nexvolt Icon / Symbol */}
      <div className="relative shrink-0" style={{ width: iconSize, height: iconSize }}>
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#d946ef] to-[#06b6d4] opacity-50 blur-[4px] animate-pulse"></div>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_0_8px_rgba(217,70,239,0.3)]"
        >
          <defs>
            {/* Subtle 3D bg gradient */}
            <linearGradient id="solidBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#14112e" />
              <stop offset="50%" stopColor="#0a0a1a" />
              <stop offset="100%" stopColor="#050514" />
            </linearGradient>
            {/* Glowing border gradient matching the Nexvolt theme */}
            <linearGradient id="neonGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d946ef" />
              <stop offset="60%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            {/* Lightning bolt color - extremely bright white-silver gradient */}
            <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            {/* Intense neon outer glow */}
            <filter id="neonFilterGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Outer glowing layer under the rounded square */}
          <rect
            x="12"
            y="12"
            width="488"
            height="488"
            rx="120"
            fill="none"
            stroke="url(#neonGlowGrad)"
            strokeWidth="12"
            opacity="0.6"
            filter="url(#neonFilterGlow)"
          />

          {/* Rounded square container */}
          <rect
            x="16"
            y="16"
            width="480"
            height="480"
            rx="114"
            fill="url(#solidBg)"
            stroke="url(#neonGlowGrad)"
            strokeWidth="24"
            strokeLinejoin="round"
          />

          {/* Sleek metallic lightning bolt in the center */}
          <path
            d="M 310,90 L 170,285 L 265,285 L 202,422 L 342,227 L 247,227 Z"
            fill="url(#boltGrad)"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Nexvolt Branding Typography */}
      {showText && (
        <div className="flex flex-col items-start leading-none gap-0.5">
          <span className="font-extrabold text-white tracking-widest text-lg font-sans flex items-center">
            <span>NE</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d946ef] to-[#06b6d4]">X</span>
            <span>VOLT</span>
            <span className="text-[10px] font-black bg-gradient-to-r from-[#d946ef]/20 to-[#06b6d4]/20 text-white px-1.5 py-0.5 rounded ml-2 font-mono border border-[#06b6d4]/30 uppercase tracking-widest leading-none">
              ORA
            </span>
          </span>
          <span className="text-[9px] font-semibold text-slate-400 tracking-wider uppercase">
            Mais visibilidade · Mais clientes · Mais resultados
          </span>
        </div>
      )}
    </div>
  );
}
