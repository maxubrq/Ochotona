import { planRead } from '@ochotona/model';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/catalog';
import { readNeeds } from '../src/read-plan';
import { selectRules } from '../src/select';

const only = (...codes: string[]) =>
  catalog.filter((d) => codes.includes(d.code));

describe('readNeeds', () => {
  it('maps each rule to the inventory endpoints it reads', () => {
    expect([...readNeeds(only('T2')).requires].sort()).toEqual([
      'bindings',
      'exchanges',
      'operatorPolicies',
      'policies',
      'vhosts',
    ]);
    expect(readNeeds(only('T2')).prometheus).toBe(true);
    expect([...readNeeds(only('C2')).requires].sort()).toEqual([
      'consumers',
      'queues',
    ]);
    expect([...readNeeds(only('R1')).requires]).toEqual(['channels']);
    expect([...readNeeds(only('VT4', 'DX3')).requires]).toEqual([]);
    expect(readNeeds(only('Q3')).wantsUsers).toBe(true);
    expect(readNeeds(only('T1')).wantsUsers).toBe(false);
  });

  it('feeds planRead; users only when the CLI turns it on', () => {
    const needs = readNeeds(
      selectRules({ targetVersion: true, includeExperimental: true }),
    );
    const ids = (users: boolean) =>
      planRead({
        requires: needs.requires,
        prometheus: needs.prometheus,
        users,
      }).inventory.map((r) => r.id);
    expect(ids(false)).toEqual([
      'vhosts',
      'policies',
      'operatorPolicies',
      'deprecatedUsed',
      'exchanges',
      'queues',
      'bindings',
      'connections',
      'channels',
      'consumers',
    ]);
    expect(ids(true)).toContain('users');
  });
});
