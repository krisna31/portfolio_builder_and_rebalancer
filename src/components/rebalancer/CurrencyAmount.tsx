import React from 'react';
import { CurrencyCode } from '../../lib/quant/types';
import { formatIdr, formatUsd, idrToUsd, usdToIdr } from '../../lib/formatters';
import { FormattedNumberInput } from '../FormattedNumberInput';

/**
 * Formats an IDR-stored monetary value in the active Rebalancer display currency.
 */
export function formatRebalancerMoney(
  amountIdr: number,
  currency: CurrencyCode,
  usdIdrRate: number,
  compact: boolean = false
): string {
  if (currency === 'USD') {
    return formatUsd(idrToUsd(amountIdr, usdIdrRate), compact);
  }
  return formatIdr(amountIdr, compact);
}

/**
 * Formats an IDR-stored monetary value as a single inline string.
 * In USD mode, appends the converted IDR value in parentheses: "$1,000.00 (≈ Rp 18.000.000)".
 */
export function formatRebalancerMoneyWithIdr(
  amountIdr: number,
  currency: CurrencyCode,
  usdIdrRate: number,
  compact: boolean = false
): string {
  if (currency === 'USD') {
    return `${formatUsd(idrToUsd(amountIdr, usdIdrRate), compact)} (≈ ${formatIdr(amountIdr, compact)})`;
  }
  return formatIdr(amountIdr, compact);
}

interface CurrencyAmountProps {
  amountIdr: number;
  currency: CurrencyCode;
  usdIdrRate: number;
  compact?: boolean;
  /** Compact formatting specifically for the secondary IDR line when in USD mode */
  compactSecondaryIdr?: boolean;
  inline?: boolean;
  prefix?: string;
  className?: string;
  secondaryClassName?: string;
}

/**
 * Renders a monetary amount in IDR (clean single value) or USD (primary USD + secondary ≈ IDR).
 */
export const CurrencyAmount: React.FC<CurrencyAmountProps> = ({
  amountIdr,
  currency,
  usdIdrRate,
  compact = false,
  compactSecondaryIdr,
  inline = false,
  prefix = '',
  className = '',
  secondaryClassName = '',
}) => {
  if (currency === 'IDR') {
    return (
      <span className={`tabular-nums ${className}`.trim()}>
        {prefix}
        {formatIdr(amountIdr, compact)}
      </span>
    );
  }

  const usdText = formatUsd(idrToUsd(amountIdr, usdIdrRate), compact);
  const idrText = formatIdr(amountIdr, compactSecondaryIdr ?? compact);

  if (inline) {
    return (
      <span className={`tabular-nums ${className}`.trim()}>
        {prefix}
        {usdText}{' '}
        <span className={`text-[0.8em] font-normal opacity-75 ${secondaryClassName}`.trim()}>
          (≈ {idrText})
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col tabular-nums ${className}`.trim()}>
      <span>
        {prefix}
        {usdText}
      </span>
      <span
        className={`text-[10px] font-normal ui-text-muted leading-tight ${secondaryClassName}`.trim()}
      >
        ≈ {idrText}
      </span>
    </span>
  );
};

interface CurrencyNumberInputProps {
  valueIdr: number;
  onChangeIdr: (newValueIdr: number) => void;
  currency: CurrencyCode;
  usdIdrRate: number;
  stepIdr?: number;
  stepUsd?: number;
  min?: number;
  max?: number;
  className?: string;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
}

/**
 * Currency-aware numeric input backed by an IDR value.
 * In IDR mode: integer Indonesian formatting (100.000.000).
 * In USD mode: 2-decimal US formatting (5,555.56), converting cleanly via usdIdrRate.
 */
export const CurrencyNumberInput: React.FC<CurrencyNumberInputProps> = ({
  valueIdr,
  onChangeIdr,
  currency,
  usdIdrRate,
  stepIdr = 1_000_000,
  stepUsd = 100,
  min = 0,
  max,
  className = '',
  ariaLabel,
  id,
  placeholder,
}) => {
  const isUsd = currency === 'USD';
  const displayVal = isUsd
    ? Number(idrToUsd(valueIdr, usdIdrRate).toFixed(2))
    : valueIdr;

  return (
    <FormattedNumberInput
      key={currency}
      id={id}
      min={min}
      max={max !== undefined && isUsd ? Number(idrToUsd(max, usdIdrRate).toFixed(2)) : max}
      step={isUsd ? stepUsd : stepIdr}
      allowDecimals={isUsd}
      maxDecimals={2}
      locale={isUsd ? 'en-US' : 'id-ID'}
      value={displayVal}
      onChange={(val) => {
        if (isUsd) {
          onChangeIdr(usdToIdr(val, usdIdrRate));
        } else {
          onChangeIdr(val);
        }
      }}
      className={className}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
    />
  );
};
