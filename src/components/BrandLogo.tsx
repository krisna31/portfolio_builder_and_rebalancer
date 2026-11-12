import React from 'react';

interface BrandLogoProps {
  className?: string;
}

/**
 * Geometric logo mark for QuantPorto:
 * - Three ascending bars representing Risk Parity / Risk Budgeting allocation & compounding
 * - A crisp horizontal equilibrium bar & pivot triangle representing Portfolio Rebalancing
 * - A Pareto frontier trajectory node at the peak
 * Dynamically binds to active theme semantic tokens (background, border, accent, text).
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ className = 'h-8 w-8' }) => {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        width="64"
        height="64"
        rx="14"
        className="fill-[var(--bg-subtle)]"
      />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="12.5"
        className="stroke-[var(--border-default)]"
        strokeWidth="2.5"
      />

      {/* Allocation & Compounding Bars */}
      <rect x="14" y="34" width="8" height="14" rx="2" className="fill-[var(--border-strong)] opacity-70" />
      <rect x="26" y="25" width="8" height="23" rx="2" className="fill-[var(--accent-hover)] opacity-85" />
      <rect x="38" y="15" width="8" height="33" rx="2" className="fill-[var(--accent-primary)]" />

      {/* Rebalance Equilibrium Base & Fulcrum */}
      <path
        d="M11 48H53"
        className="stroke-[var(--text-primary)]"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M30 48L26 54H34L30 48Z" className="fill-[var(--accent-secondary)]" />

      {/* Pareto Frontier Curve & Optimal Node */}
      <path
        d="M16 28C22 25 29 19 42 13"
        className="stroke-[var(--accent-primary)]"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle
        cx="42"
        cy="13"
        r="3.5"
        className="fill-[var(--accent-secondary)] stroke-[var(--bg-canvas)]"
        strokeWidth="1.5"
      />
    </svg>
  );
};
