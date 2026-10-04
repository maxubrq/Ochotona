import { defineRule } from '../define';
import { PASS, isAmqp091, observed } from '../helpers';

/** N1 · một connection AMQP vừa có channel publish vừa có channel consume. */
export const N1 = defineRule({
  code: 'N1',
  appliesTo: 'connection',
  requires: [
    'connection.protocol',
    'channel.publishCount',
    'channel.consumerCount',
  ],
  optional: [],
  evaluate(v) {
    if (!isAmqp091(v['connection.protocol']))
      return { result: 'not_applicable', note: 'protocol' };
    const publishChannels = v['channel.publishCount'].filter(
      (c) => c.value > 0,
    ).length;
    const consumeChannels = v['channel.consumerCount'].filter(
      (c) => c.value > 0,
    ).length;
    if (publishChannels === 0 || consumeChannels === 0) return PASS;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'at_risk',
      evidence: [
        observed(
          'channel.publishCount',
          v.prov('channel.publishCount'),
          publishChannels,
        ),
        observed(
          'channel.consumerCount',
          v.prov('channel.consumerCount'),
          consumeChannels,
        ),
      ],
      params: { publishChannels, consumeChannels },
      fix: { kind: 'client_change' },
    };
  },
});
