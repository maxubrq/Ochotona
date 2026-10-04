import { afterAll, expect } from 'vitest';
import { drainSink, findSecrets } from './secrets';

afterAll(() => {
  expect(findSecrets(drainSink())).toEqual([]);
});
