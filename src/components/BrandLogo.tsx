import React from 'react';

interface BrandLogoProps {
  className?: string;
}

/**
 * Minimalist geometric logo mark for QuantPorto:
 * - Three ascending bars representing Risk Parity / Risk Budgeting allocation & compounding
 * - A crisp horizontal equilibrium bar & pivot triangle representing Portfolio Rebalancing
 * - A Pareto frontier trajectory node at the peak
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
        className="fill-zinc-900 dark:fill-zinc-900"
      />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="12.5"
        className="stroke-zinc-800 dark:stroke-zinc-700"
        strokeWidth="3"
      />

      {/* Allocation & Compounding Bars */}
      <rect x="14" y="34" width="8" height="14" rx="2" fill="#71717a" />
      <rect x="26" y="25" width="8" height="23" rx="2" fill="#34d399" />
      <rect x="38" y="15" width="8" height="33" rx="2" fill="#10b981" />

      {/* Rebalance Equilibrium Base & Fulcrum */}
      <path
        d="M11 48H53"
        stroke="#fafafa"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M30 48L26 54H34L30 48Z" fill="#10b981" />

      {/* Pareto Frontier Curve & Optimal Node */}
      <path
        d="M16 28C22 25 29 19 42 13"
        stroke="#fafafa"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle
        cx="42"
        cy="13"
        r="3"
        fill="#10b981"
        stroke="#fafafa"
        strokeWidth="1.5"
      />
    </svg>
  );
};
