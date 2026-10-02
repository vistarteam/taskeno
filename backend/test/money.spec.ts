import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  clampMoney,
  formatToman,
  money,
  normalizeDigits,
  toToman,
} from '@taskeno/contracts';

describe('money math', () => {
  it('keeps amounts as exact integers', () => {
    expect(money('1000')).toBe(1000n);
    expect(money(1000)).toBe(1000n);
    // A value that a float would silently corrupt stays exact.
    expect(money('9007199254740993')).toBe(9007199254740993n);
  });

  it('computes commission with half-up rounding and never uses floats', () => {
    expect(applyBasisPoints(1_000_000n, 1000)).toBe(100_000n); // 10%
    expect(applyBasisPoints(1n, 5000)).toBe(1n); // rounds half up
    expect(applyBasisPoints(3n, 5000)).toBe(2n);
    expect(applyBasisPoints(0n, 1000)).toBe(0n);
  });

  it('rejects invalid basis points and negative amounts', () => {
    expect(() => applyBasisPoints(100n, -1)).toThrow();
    expect(() => applyBasisPoints(100n, 10_001)).toThrow();
    expect(() => applyBasisPoints(-100n, 1000)).toThrow();
  });

  it('clamps commission to the configured floor and ceiling', () => {
    expect(clampMoney(50n, 100n, 1000n)).toBe(100n);
    expect(clampMoney(5000n, 100n, 1000n)).toBe(1000n);
    expect(clampMoney(500n, null, null)).toBe(500n);
  });

  it('converts Rial to Toman for display only', () => {
    expect(toToman(1_000_000n)).toBe(100_000n);
    expect(formatToman(1_000_000n)).toContain('تومان');
  });

  it('parses Persian and Arabic-Indic digits typed by users', () => {
    expect(normalizeDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
    expect(normalizeDigits('٤٥٦')).toBe('456');
    expect(money(normalizeDigits('۱۲٬۰۰۰'.replace('٬', '')))).toBe(12_000n);
  });
});
