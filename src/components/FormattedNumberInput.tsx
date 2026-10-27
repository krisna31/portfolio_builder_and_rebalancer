import React, { useState } from 'react';

interface FormattedNumberInputProps {
  value: number;
  onChange: (newValue: number) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
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
 * Applies clamping to min/max on blur to allow uninterrupted backspacing and typing.
 */
export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  onBlur,
  min = 0,
  max,
  step = 1_000_000,
  className = '',
  ariaLabel,
  id,
  placeholder,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [inputText, setInputText] = useState('');

  const clamp = (val: number) => {
    let res = Math.max(min, val);
    if (max !== undefined) {
      res = Math.min(max, res);
    }
    return res;
  };

  const handleFocus = () => {
    setIsFocused(true);
    setInputText(
      Number.isFinite(value) && value > 0 ? Math.round(value).toLocaleString('id-ID') : ''
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/[^\d]/g, '');
    if (!rawDigits) {
      setInputText('');
      onChange(0);
      return;
    }
    const parsed = Number(rawDigits);
    if (!Number.isNaN(parsed)) {
      setInputText(parsed.toLocaleString('id-ID'));
      if (max !== undefined && parsed > max) {
        onChange(max);
      } else {
        onChange(parsed);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const rawDigits = inputText.replace(/[^\d]/g, '');
    const currentNum = rawDigits ? Number(rawDigits) : 0;
    const finalVal = clamp(currentNum);
    setInputText(Math.round(finalVal).toLocaleString('id-ID'));
    onChange(finalVal);
    if (onBlur) onBlur(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const rawDigits = inputText.replace(/[^\d]/g, '');
      const currentNum = isFocused ? (rawDigits ? Number(rawDigits) : 0) : value;
      const nextVal = clamp(currentNum + step);
      setInputText(nextVal.toLocaleString('id-ID'));
      onChange(nextVal);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const rawDigits = inputText.replace(/[^\d]/g, '');
      const currentNum = isFocused ? (rawDigits ? Number(rawDigits) : 0) : value;
      const nextVal = clamp(currentNum - step);
      setInputText(nextVal.toLocaleString('id-ID'));
      onChange(nextVal);
    } else if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const displayValue = isFocused
    ? inputText
    : Number.isFinite(value)
      ? Math.round(value).toLocaleString('id-ID')
      : '0';

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
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
      className={className}
    />
  );
};
