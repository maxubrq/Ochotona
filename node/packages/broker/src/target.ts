import { rootCertificates } from 'node:tls';
import type { ConnectionOptions } from 'node:tls';
import type { Result } from '@ochotona/model';

export interface BrokerTarget {
  /** Gốc management, kể cả path prefix. */
  readonly url: string;
  readonly user: string;
  readonly password: string;
  readonly tls?: {
    /** PEM, thêm vào kho gốc mặc định. */
    readonly ca?: string;
    /** mTLS, tuỳ chọn. */
    readonly cert?: string;
    readonly key?: string;
    /** Tắt kiểm chứng chỉ (CX5). */
    readonly insecure?: boolean;
    /** SNI khi khác host trong URL. */
    readonly serverName?: string;
  };
  /** Mặc định `'auto'`. */
  readonly prometheus?: 'auto' | 'off' | { readonly url: string };
  /** Mặc định 5000 và 15000. */
  readonly timeouts?: {
    readonly connectMs?: number;
    readonly requestMs?: number;
  };
  /** Tên context, thay cho origin trong mọi thông báo lỗi đưa ra ngoài. */
  readonly name?: string;
}

export type TargetError = { diag: 'CX4' | 'CX10'; detail: string };

/** URL đã chuẩn hoá. */
export interface NormalizedUrl {
  /** `https://host:15671/rabbitmq`, không có `/` cuối. */
  readonly root: string;
  readonly origin: string;
  readonly protocol: 'http:' | 'https:';
  /** Host không kèm cổng; IPv6 giữ dấu ngoặc. */
  readonly hostname: string;
}

/**
 * Chuẩn hoá URL management theo năm bước của spec. Không đoán cổng.
 * @example normalizeUrl('http://h:15672/rabbitmq/api/') // { ok: true, value: { root: 'http://h:15672/rabbitmq', … } }
 */
export function normalizeUrl(
  input: string,
): Result<NormalizedUrl, TargetError> {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, error: { diag: 'CX10', detail: 'not a URL' } };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return {
      ok: false,
      error: { diag: 'CX10', detail: `scheme ${u.protocol.slice(0, -1)}` },
    };
  }
  if (u.username !== '' || u.password !== '') {
    // Không dùng giá trị đó, kể cả một lần.
    return { ok: false, error: { diag: 'CX4', detail: 'credentials in URL' } };
  }
  if (u.search !== '' || u.hash !== '' || /[?#]/.test(input)) {
    return {
      ok: false,
      error: { diag: 'CX10', detail: 'query or fragment in URL' },
    };
  }
  let path = u.pathname.replace(/\/+$/, '');
  path = path.replace(/\/api$/, '');
  return {
    ok: true,
    value: {
      root: `${u.protocol}//${u.host}${path}`,
      origin: u.origin,
      protocol: u.protocol,
      hostname: u.hostname,
    },
  };
}

/**
 * Đường dẫn API: gốc + `/api` + các đoạn, mỗi đoạn qua `encodeURIComponent`.
 * @example apiUrl('http://h:15672', ['queues', '/'], {}) // 'http://h:15672/api/queues/%2F'
 */
export function apiUrl(
  root: string,
  segments: readonly string[],
  query: Readonly<Record<string, string>>,
): string {
  const path = segments.map(encodeURIComponent).join('/');
  const qs = new URLSearchParams(query).toString();
  return `${root}/api/${path}${qs ? `?${qs}` : ''}`;
}

/** URL Prometheus; `null` khi tắt. */
export function prometheusUrl(
  mgmt: NormalizedUrl,
  setting: BrokerTarget['prometheus'],
): Result<string | null, TargetError> {
  if (setting === 'off') return { ok: true, value: null };
  if (setting === undefined || setting === 'auto') {
    const port = mgmt.protocol === 'https:' ? 15691 : 15692;
    return {
      ok: true,
      value: `${mgmt.protocol}//${mgmt.hostname}:${port}/metrics`,
    };
  }
  let u: URL;
  try {
    u = new URL(setting.url);
  } catch {
    return {
      ok: false,
      error: { diag: 'CX10', detail: 'prometheus URL is not a URL' },
    };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return {
      ok: false,
      error: { diag: 'CX10', detail: 'prometheus URL scheme' },
    };
  }
  if (u.username !== '' || u.password !== '') {
    return {
      ok: false,
      error: { diag: 'CX4', detail: 'credentials in prometheus URL' },
    };
  }
  return { ok: true, value: u.href };
}

/** Tuỳ chọn TLS: CA riêng được thêm vào kho gốc mặc định, không thay nó. */
export function tlsOptions(tls: BrokerTarget['tls']): ConnectionOptions {
  const opts: ConnectionOptions = { minVersion: 'TLSv1.2' };
  if (!tls) return opts;
  if (tls.ca) opts.ca = [...rootCertificates, tls.ca];
  if (tls.cert) opts.cert = tls.cert;
  if (tls.key) opts.key = tls.key;
  if (tls.insecure) opts.rejectUnauthorized = false;
  if (tls.serverName) opts.servername = tls.serverName;
  return opts;
}
