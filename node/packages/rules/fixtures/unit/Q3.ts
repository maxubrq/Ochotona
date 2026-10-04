import { brokerAt } from '../builder';
import { fixture, ref } from '../fixture';

const C = ref.connection('c1');

export default [
  fixture({
    rule: 'Q3',
    kind: 'fail',
    title: 'application connects as guest',
    raw: brokerAt('4.2.1').connection('c1', { user: 'guest' }).build(),
    expect: [{ object: C, result: 'fail', severity: 'S3', variant: 'guest' }],
  }),
  fixture({
    rule: 'Q3',
    kind: 'fail',
    title: 'application shares the administrator user Ocho runs as',
    raw: brokerAt('4.2.1')
      .whoami('admin', 'administrator')
      .connection('c1', { user: 'admin' })
      .build(),
    expect: [
      { object: C, result: 'fail', severity: 'S3', variant: 'administrator' },
    ],
  }),
  fixture({
    rule: 'Q3',
    kind: 'anti',
    title: 'tags of another user cannot be read',
    raw: brokerAt('4.2.1').connection('c1', { user: 'app' }).build(),
    expect: [{ object: C, result: 'not_checked', path: 'user.tags' }],
  }),
  fixture({
    rule: 'Q3',
    kind: 'fail',
    title:
      'Ocho reads /api/users as admin: the application user is an administrator',
    raw: brokerAt('4.2.1')
      .whoami('ocho-admin', 'administrator')
      .users({ 'ocho-admin': ['administrator'], app: ['administrator'] })
      .connection('c1', { user: 'app' })
      .build(),
    expect: [
      { object: C, result: 'fail', severity: 'S3', variant: 'administrator' },
    ],
  }),
  fixture({
    rule: 'Q3',
    kind: 'near',
    title: '/api/users read: the application user has only the management tag',
    raw: brokerAt('4.2.1')
      .users({ app: ['management'] })
      .connection('c1', { user: 'app' })
      .build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'Q3',
    kind: 'anti',
    title:
      '/api/users read, but the user is not in it (external authentication)',
    raw: brokerAt('4.2.1')
      .users({ other: [] })
      .connection('c1', { user: 'ldap-app' })
      .build(),
    expect: [{ object: C, result: 'not_checked', path: 'user.tags' }],
  }),
  fixture({
    rule: 'Q3',
    kind: 'near',
    title: 'application uses the monitoring user Ocho runs as',
    raw: brokerAt('4.2.1')
      .whoami('app', 'monitoring')
      .connection('c1', { user: 'app' })
      .build(),
    expect: [{ object: C, result: 'pass' }],
  }),
  fixture({
    rule: 'Q3',
    kind: 'anti',
    title: 'connections cannot be read',
    raw: brokerAt('4.2.1')
      .connection('c1')
      .httpError('connections', 403)
      .build(),
    expect: [{ object: ref.broker, result: 'not_checked', path: 'connection' }],
  }),
];
