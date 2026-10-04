import { defineRule } from '../define';
import { PASS, observed } from '../helpers';

/** DX2 · `disk_free_limit` thấp hơn giới hạn bộ nhớ của node. */
export const DX2 = defineRule({
  code: 'DX2',
  appliesTo: 'node',
  requires: ['node.diskFreeLimitBytes', 'node.memLimitBytes'],
  optional: [],
  evaluate(v) {
    const disk = v['node.diskFreeLimitBytes'];
    const mem = v['node.memLimitBytes'];
    if (disk >= mem) return PASS;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'at_risk',
      evidence: [
        observed(
          'node.diskFreeLimitBytes',
          v.prov('node.diskFreeLimitBytes'),
          disk,
        ),
        observed('node.memLimitBytes', v.prov('node.memLimitBytes'), mem),
      ],
      params: { diskFreeLimitBytes: disk, memLimitBytes: mem },
      fix: { kind: 'config' },
    };
  },
});
