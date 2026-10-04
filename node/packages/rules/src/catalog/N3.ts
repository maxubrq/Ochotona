import { defineRule } from '../define';
import { PASS, isAmqp091, observed } from '../helpers';

/** N3 · connection AMQP tắt heartbeat. */
export const N3 = defineRule({
  code: 'N3',
  appliesTo: 'connection',
  requires: ['connection.protocol', 'connection.heartbeat', 'connection.user'],
  optional: [],
  evaluate(v) {
    if (!isAmqp091(v['connection.protocol']))
      return { result: 'not_applicable', note: 'protocol' };
    if (v['connection.heartbeat'] !== 0) return PASS;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'at_risk',
      evidence: [
        observed('connection.heartbeat', v.prov('connection.heartbeat'), 0),
      ],
      params: { user: v['connection.user'] },
      fix: { kind: 'client_change' },
    };
  },
});
