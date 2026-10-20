import React from 'react';

interface FormattedNumberInputProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
}

/**
 * Formats integer Rupiah / numeric values with Indonesian dot thousand separators
 * (e.g. 100000000 -> "100.000.000", 1000000000 -> "1.000.000.000") on input
 * while preserving numeric mobile keyboard (inputMode="numeric") and ArrowUp/ArrowDown stepping.
 */
export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  step = 1_000_000,
  className = '',
  ariaLabel,
  id,
  placeholder,
}) => {
  const formattedDisplay = Number.isFinite(value)
    ? Math.round(value).toLocaleString('id-ID')
    : '0';

  const clamp = (val: number) => {
    let res = Math.max(min, val);
    if (max !== undefined) {
      res = Math.min(max, res);
    }
    return res;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/[^\d]/g, '');
    if (!rawDigits) {
      onChange(clamp(0));
      return;
    }
    const parsed = Number(rawDigits);
    if (!Number.isNaN(parsed)) {
      onChange(clamp(parsed));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(clamp(value + step));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(clamp(value - step));
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      value={formattedDisplay}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  );
};
