import { describe, expect, it } from 'vitest';
import { runFixture } from '../fixtures/fixture';
import { unitFixtures } from '../fixtures/unit';
import { mismatches } from './match';

describe('fixture tầng đơn vị (chế độ test)', () => {
  for (const f of unitFixtures) {
    it(`${f.rule} ${f.kind}: ${f.title}`, () => {
      const { results, internal } = runFixture(f, 'test');
      expect(internal).toEqual([]);
      expect(mismatches(results, f.expect)).toEqual([]);
    });
  }
});
