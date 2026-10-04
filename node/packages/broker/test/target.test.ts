import { rootCertificates } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { apiUrl, normalizeUrl, prometheusUrl, tlsOptions } from '../src/target';

const root = (u: string) => {
  const r = normalizeUrl(u);
  if (!r.ok) throw new Error(`expected ok: ${r.error.diag}`);
  return r.value.root;
};
const diag = (u: string) => {
  const r = normalizeUrl(u);
  return r.ok ? null : r.error.diag;
};

describe('normalizeUrl', () => {
  it('giữ path prefix', () => {
    expect(root('http://host:15672/rabbitmq')).toBe(
      'http://host:15672/rabbitmq',
    );
  });
  it('bỏ /api cuối và / cuối', () => {
    expect(root('http://host:15672/api')).toBe('http://host:15672');
    expect(root('http://host:15672/api/')).toBe('http://host:15672');
    expect(root('https://host/rabbitmq/api/')).toBe('https://host/rabbitmq');
    expect(root('http://host:15672/')).toBe('http://host:15672');
    expect(root('http://host:15672//')).toBe('http://host:15672');
  });
  it('không đoán cổng', () => {
    expect(root('https://b-1.mq.example')).toBe('https://b-1.mq.example');
    expect(root('http://host')).toBe('http://host');
  });
  it('từ chối user:pass@ bằng CX4', () => {
    expect(diag('http://u:p@host:15672')).toBe('CX4');
    expect(diag('http://u@host:15672')).toBe('CX4');
  });
  it('từ chối scheme khác, query, fragment bằng CX10', () => {
    expect(diag('amqp://host:5672')).toBe('CX10');
    expect(diag('http://host:15672/?x=1')).toBe('CX10');
    expect(diag('http://host:15672/?')).toBe('CX10');
    expect(diag('http://host:15672/#a')).toBe('CX10');
    expect(diag('not a url')).toBe('CX10');
  });
  it('host IPv6', () => {
    const r = normalizeUrl('http://[::1]:15672/');
    expect(r.ok && r.value.root).toBe('http://[::1]:15672');
    expect(r.ok && r.value.hostname).toBe('[::1]');
  });
});

describe('apiUrl', () => {
  it('encode từng đoạn', () => {
    expect(apiUrl('http://h', ['queues', '/'], {})).toBe(
      'http://h/api/queues/%2F',
    );
    expect(apiUrl('http://h/p', ['queues', 'a b'], {})).toBe(
      'http://h/p/api/queues/a%20b',
    );
    expect(apiUrl('http://h', ['vhosts', '/', 'channels'], {})).toBe(
      'http://h/api/vhosts/%2F/channels',
    );
  });
  it('ghép query', () => {
    expect(apiUrl('http://h', ['queues'], { page: '1', sort: 'name' })).toBe(
      'http://h/api/queues?page=1&sort=name',
    );
  });
});

describe('prometheusUrl', () => {
  const mgmt = (u: string) => {
    const r = normalizeUrl(u);
    if (!r.ok) throw new Error();
    return r.value;
  };
  it('auto theo scheme', () => {
    expect(prometheusUrl(mgmt('https://h:15671/x'), 'auto')).toEqual({
      ok: true,
      value: 'https://h:15691/metrics',
    });
    expect(prometheusUrl(mgmt('http://h:15672'), undefined)).toEqual({
      ok: true,
      value: 'http://h:15692/metrics',
    });
    expect(prometheusUrl(mgmt('http://[::1]:15672'), 'auto')).toEqual({
      ok: true,
      value: 'http://[::1]:15692/metrics',
    });
  });
  it('off và URL riêng', () => {
    expect(prometheusUrl(mgmt('http://h'), 'off')).toEqual({
      ok: true,
      value: null,
    });
    expect(
      prometheusUrl(mgmt('http://h'), { url: 'http://p:9419/metrics' }),
    ).toEqual({
      ok: true,
      value: 'http://p:9419/metrics',
    });
    expect(prometheusUrl(mgmt('http://h'), { url: 'ftp://p' })).toMatchObject({
      ok: false,
    });
    expect(
      prometheusUrl(mgmt('http://h'), { url: 'http://a:b@p' }),
    ).toMatchObject({
      ok: false,
      error: { diag: 'CX4' },
    });
  });
});

describe('tlsOptions', () => {
  it('CA được thêm vào kho gốc, không thay', () => {
    const o = tlsOptions({ ca: 'PEM' });
    expect(o.ca).toHaveLength(rootCertificates.length + 1);
    expect((o.ca as string[]).at(-1)).toBe('PEM');
    expect(o.minVersion).toBe('TLSv1.2');
  });
  it('insecure, SNI, mTLS', () => {
    expect(
      tlsOptions({ insecure: true, serverName: 'x', cert: 'c', key: 'k' }),
    ).toMatchObject({
      rejectUnauthorized: false,
      servername: 'x',
      cert: 'c',
      key: 'k',
    });
    expect(tlsOptions(undefined).ca).toBeUndefined();
  });
});
