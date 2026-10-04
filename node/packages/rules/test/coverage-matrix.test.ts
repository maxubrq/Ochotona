import { describe, expect, it } from 'vitest';
import { coverageMatrix } from '../fixtures/coverage-matrix';

describe('ma trận phủ', () => {
  const gaps = coverageMatrix();

  it('has every unit cell for every rule', () => {
    expect(gaps.filter((g) => g.tier === 'unit')).toEqual([]);
  });

  it('has a fail and a near case on real recordings for every S1 rule', () => {
    expect(gaps.filter((g) => g.tier === 'integration')).toEqual([]);
  });
});
