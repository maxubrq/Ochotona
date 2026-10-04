import { defineRule } from '../define';
import { PASS, observed, threshold } from '../helpers';

/** DX1 · queue tồn quá nhiều message sẵn sàng: đang bị dùng làm kho. */
export const DX1 = defineRule({
  code: 'DX1',
  appliesTo: 'queue',
  requires: ['queue.ready'],
  optional: [],
  evaluate(v) {
    const ready = v['queue.ready'];
    if (ready <= threshold('DX1', 'ready')) return PASS;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'hygiene',
      evidence: [observed('queue.ready', v.prov('queue.ready'), ready)],
      params: { ready },
      fix: { kind: 'config' },
    };
  },
});
