import { defineRule } from '../define';
import { PASS, observed } from '../helpers';

/**
 * Q3 · ứng dụng kết nối bằng `guest` hoặc user có tag `administrator`. Không
 * bao giờ kết luận "không phải admin" khi không đọc được tag (CL2).
 */
export const Q3 = defineRule({
  code: 'Q3',
  appliesTo: 'connection',
  requires: ['connection.user'],
  optional: ['whoami.name', 'whoami.tags', 'user.tags'],
  variants: ['guest', 'administrator'],
  needs: ['user.tags'],
  evaluate(v) {
    const user = v['connection.user'];
    const fail = (
      reason: 'guest' | 'administrator',
      tagsProv = v.prov('connection.user'),
    ) => ({
      result: 'fail' as const,
      severity: 'S3' as const,
      urgency: 'hygiene' as const,
      variant: reason,
      evidence: [
        observed('connection.user', v.prov('connection.user'), user),
      ].concat(
        reason === 'administrator'
          ? [observed('whoami.tags', tagsProv, 'administrator')]
          : [],
      ),
      params: { user, reason },
      fix: { kind: 'config' as const },
    });
    if (user === 'guest') return fail('guest');
    const name = v['whoami.name'];
    const tags = v['whoami.tags'];
    if (name.state === 'known' && name.value === user && tags.state === 'known')
      return tags.value.includes('administrator')
        ? fail('administrator', tags.prov)
        : PASS;
    const users = v['user.tags'];
    if (users.state === 'unknown')
      return { result: 'needs', path: 'user.tags' };
    // User xác thực ngoài broker (LDAP…) không có trong /api/users: chưa biết.
    if (users.value.length === 0)
      return {
        result: 'not_checked',
        path: 'user.tags',
        reason: { kind: 'field_absent' },
        source: users.prov.path,
      };
    return users.value.some((u) => u.value.includes('administrator'))
      ? fail('administrator', users.prov)
      : PASS;
  },
});
