import { defineRule } from '../define';
import { PASS, isAmqp091, observed } from '../helpers';

/** N2 · connection AMQP không đặt `connection_name`. */
export const N2 = defineRule({
  code: 'N2',
  appliesTo: 'connection',
  requires: [
    'connection.protocol',
    'connection.connectionName',
    'connection.user',
  ],
  optional: ['connection.clientProduct'],
  variants: ['product'],
  evaluate(v) {
    if (!isAmqp091(v['connection.protocol']))
      return { result: 'not_applicable', note: 'protocol' };
    if (v['connection.connectionName'] !== null) return PASS;
    const product = v['connection.clientProduct'];
    const known =
      product.state === 'known' && product.value !== null
        ? product.value
        : null;
    return {
      result: 'fail',
      severity: 'S3',
      urgency: 'hygiene',
      ...(known ? { variant: 'product' } : {}),
      evidence: [
        observed(
          'connection.connectionName',
          v.prov('connection.connectionName'),
          null,
        ),
      ],
      params: {
        user: v['connection.user'],
        ...(known ? { clientProduct: known } : {}),
      },
      fix: { kind: 'client_change' },
    };
  },
});
