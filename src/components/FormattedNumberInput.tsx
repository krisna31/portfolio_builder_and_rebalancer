import React, { useState } from 'react';

interface FormattedNumberInputProps {
  value: number;
  onChange: (newValue: number) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
  allowDecimals?: boolean;
  maxDecimals?: number;
  locale?: 'id-ID' | 'en-US';
  className?: string;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
}

/**
 * Formats integer Rupiah values with Indonesian dot thousand separators
 * (e.g. 100000000 -> "100.000.000") or optional decimal USD values with US formatting
 * (e.g. 1250.5 -> "1,250.5") while preserving mobile numeric/decimal keyboard and
 * ArrowUp/ArrowDown stepping. Applies clamping to min/max on blur.
 */
export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  onBlur,
  min = 0,
  max,
  step = 1_000_000,
  allowDecimals = false,
  maxDecimals = 2,
  locale = 'id-ID',
  className = '',
  ariaLabel,
  id,
  placeholder,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [inputText, setInputText] = useState('');

  const roundDecimals = (val: number) => {
    if (!allowDecimals) return Math.round(val);
    const factor = 10 ** maxDecimals;
    return Math.round(val * factor) / factor;
  };

  const formatForDisplay = (val: number) => {
    if (!Number.isFinite(val)) return '0';
    if (!allowDecimals) {
      return Math.round(val).toLocaleString(locale);
    }
    const rounded = roundDecimals(val);
    return rounded.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  };

  const clamp = (val: number) => {
    let res = Math.max(min, val);
    if (max !== undefined) {
      res = Math.min(max, res);
    }
    return roundDecimals(res);
  };

  const sanitizeDecimalInput = (raw: string): string => {
    // In en-US decimal mode, strip commas and non-digit/dot chars; keep first dot and maxDecimals digits
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex === -1) return cleaned;
    const intPart = cleaned.slice(0, dotIndex);
    const decPart = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, maxDecimals);
    return `${intPart}.${decPart}`;
  };

  const parseTextValue = (text: string): number => {
    if (!allowDecimals) {
      const rawDigits = text.replace(/[^\d]/g, '');
      return rawDigits ? Number(rawDigits) : 0;
    }
    const sanitized = sanitizeDecimalInput(text);
    if (!sanitized || sanitized === '.') return 0;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (!Number.isFinite(value) || value <= 0) {
      setInputText('');
      return;
    }
    if (allowDecimals) {
      setInputText(String(roundDecimals(value)));
    } else {
      setInputText(Math.round(value).toLocaleString(locale));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!allowDecimals) {
      const rawDigits = e.target.value.replace(/[^\d]/g, '');
      if (!rawDigits) {
        setInputText('');
        onChange(0);
        return;
      }
      const parsed = Number(rawDigits);
      if (!Number.isNaN(parsed)) {
        setInputText(parsed.toLocaleString(locale));
        if (max !== undefined && parsed > max) {
          onChange(max);
        } else {
          onChange(parsed);
        }
      }
      return;
    }

    const sanitized = sanitizeDecimalInput(e.target.value);
    setInputText(sanitized);
    if (!sanitized || sanitized === '.') {
      onChange(0);
      return;
    }
    const parsed = Number(sanitized);
    if (Number.isFinite(parsed)) {
      if (max !== undefined && parsed > max) {
        onChange(max);
      } else {
        onChange(parsed);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const currentNum = parseTextValue(inputText);
    const finalVal = clamp(currentNum);
    setInputText(formatForDisplay(finalVal));
    onChange(finalVal);
    if (onBlur) onBlur(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentNum = isFocused ? parseTextValue(inputText) : value;
      const nextVal = clamp(currentNum + step);
      setInputText(allowDecimals ? String(nextVal) : formatForDisplay(nextVal));
      onChange(nextVal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentNum = isFocused ? parseTextValue(inputText) : value;
      const nextVal = clamp(currentNum - step);
      setInputText(allowDecimals ? String(nextVal) : formatForDisplay(nextVal));
      onChange(nextVal);
    } else if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const displayValue = isFocused ? inputText : formatForDisplay(value);

  return (
    <input
      id={id}
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`font-mono tabular-nums ${className}`.trim()}
    />
  );
};
