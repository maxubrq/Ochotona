import { expect, it } from 'vitest';
import { format } from '../src/format';

// File riêng để registry còn trống: không import entry i18n nào.
it('says which entry to import when a language is not loaded', () => {
  expect(() => format('vi', 'rule.T2.title', {})).toThrow(
    /import '@ochotona\/spec\/i18n\/vi'/,
  );
});
