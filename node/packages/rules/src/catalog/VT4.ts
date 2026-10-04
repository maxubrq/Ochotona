import { compareStr } from '@ochotona/model';
import { defineRule } from '../define';
import { PASS, observed } from '../helpers';

/** VT4 · các node đang chạy báo phiên bản khác nhau. */
export const VT4 = defineRule({
  code: 'VT4',
  appliesTo: 'broker',
  requires: ['node.running', 'node.version'],
  optional: [],
  evaluate(v) {
    const running = new Set(
      v['node.running']
        .filter((n) => n.value)
        .map((n) => JSON.stringify(n.ref)),
    );
    const versions = [
      ...new Set(
        v['node.version']
          .filter((n) => running.has(JSON.stringify(n.ref)))
          .map((n) => n.value.raw),
      ),
    ].sort(compareStr);
    if (versions.length < 2) return PASS;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'hygiene',
      evidence: [observed('node.version', v.prov('node.version'), versions)],
      params: { versions },
      fix: { kind: 'config' },
    };
  },
});
