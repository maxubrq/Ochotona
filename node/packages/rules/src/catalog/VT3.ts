import { defineRule } from '../define';
import { PASS, observed } from '../helpers';

/** VT3 · broker báo tính năng đã deprecate đang được dùng; một kết quả cho mỗi tính năng. */
export const VT3 = defineRule({
  code: 'VT3',
  appliesTo: 'broker',
  requires: ['broker.deprecatedInUse'],
  optional: [],
  evaluate(v) {
    const features = [...v['broker.deprecatedInUse']].sort();
    if (features.length === 0) return PASS;
    return features.map((feature) => ({
      result: 'fail',
      severity: 'S3',
      urgency: 'hygiene',
      evidence: [
        observed(
          'broker.deprecatedInUse',
          v.prov('broker.deprecatedInUse'),
          feature,
        ),
      ],
      params: { feature },
      fix: { kind: 'config' },
    }));
  },
});
