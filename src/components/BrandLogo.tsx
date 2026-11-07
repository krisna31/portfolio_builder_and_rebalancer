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
        className="fill-[#E4E2D8] dark:fill-[#1B231E]"
      />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="12.5"
        className="stroke-[#C9C6B8] dark:stroke-[#2E3B33]"
        strokeWidth="2.5"
      />

      {/* Allocation & Compounding Bars (Mineral & Botanical) */}
      <rect x="14" y="34" width="8" height="14" rx="2" className="fill-[#A8A492] dark:fill-[#526458]" />
      <rect x="26" y="25" width="8" height="23" rx="2" className="fill-[#3D8B66] dark:fill-[#8FC9A8]" />
      <rect x="38" y="15" width="8" height="33" rx="2" className="fill-[#21543D] dark:fill-[#68B68E]" />

      {/* Rebalance Equilibrium Base & Fulcrum */}
      <path
        d="M11 48H53"
        className="stroke-[#19201C] dark:stroke-[#EAECE7]"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M30 48L26 54H34L30 48Z" className="fill-[#BC544B] dark:fill-[#E07A5F]" />

      {/* Pareto Frontier Curve & Optimal Node */}
      <path
        d="M16 28C22 25 29 19 42 13"
        className="stroke-[#21543D] dark:stroke-[#68B68E]"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle
        cx="42"
        cy="13"
        r="3.5"
        className="fill-[#BC544B] dark:fill-[#E07A5F] stroke-[#F1F0EA] dark:stroke-[#111613]"
        strokeWidth="1.5"
      />
    </svg>
  );
};
