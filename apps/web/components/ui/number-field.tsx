'use client';
import { useState, useEffect } from 'react';
export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
}) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState(false);
  useEffect(() => {
    setText(String(value));
  }, [value]);
  function commit() {
    const n = Number(text);
    if (
      text.trim() === '' ||
      !Number.isFinite(n) ||
      (min !== undefined && n < min) ||
      (max !== undefined && n > max)
    ) {
      setError(true);
      return;
    }
    setError(false);
    onChange(n);
  }
  return (
    <label className={`number-field ${error ? 'invalid' : ''}`}>
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(String(value));
              setError(false);
            }
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {error && (
        <small>
          Enter a valid value{min !== undefined ? ` ≥ ${min}` : ''}
          {max !== undefined ? ` ≤ ${max}` : ''}.
        </small>
      )}
    </label>
  );
}
