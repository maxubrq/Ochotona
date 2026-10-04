import type {
  Actual,
  ActualBase,
  Channel,
  Connection,
  Consumer,
  ReadAnomaly,
} from './actual';
import type { CapabilityTable } from './caps';
import { baseOf, deriveActual } from './derive';
import { type Violation, checkInvariants } from './invariants';
import { type Observed, unknown } from './observed';
import { type ObjectRef, sha256Hex } from './ref';
import { actualBaseShape, bool, instant, obj, str } from './snapshot-shape';
import { type Instant, type Result, err, ok } from './units';

export const SNAPSHOT_SCHEMA = 'ocho.snapshot/1';

export interface SnapshotOptions {
  toolVersion: string;
  specVersion: string;
  takenAt: Instant;
  contextName: string;
  /** Chỉ lưu băm, không bao giờ lưu URL. */
  url: string;
  redactHosts: boolean;
  /** Truyền vào để test tất định; thường là `crypto.randomBytes`. */
  randomBytes: (n: number) => Uint8Array;
}

export interface SnapshotError {
  readonly code: 'SNAP1' | 'SNAP2' | 'SNAP3';
  readonly message: string;
  /** Đường dẫn JSON tới chỗ sai (SNAP2). */
  readonly path?: string;
  readonly violations?: readonly Violation[];
}

class Redactor {
  private readonly codes = new Map<string, string>();
  constructor(private readonly salt: Uint8Array) {}

  code(value: string): string {
    let c = this.codes.get(value);
    if (c === undefined) {
      c = `h-${sha256Hex(this.salt, value).slice(0, 12)}`;
      this.codes.set(value, c);
    }
    return c;
  }

  /** Tên channel là `<tên connection> (n)`: thay phần connection, giữ hậu tố. */
  channel(name: string, connection?: string): string {
    if (connection !== undefined && name.startsWith(`${connection} (`)) {
      return this.code(connection) + name.slice(connection.length);
    }
    const m = /^(.*)( \(\d+\))$/.exec(name);
    return m ? this.code(m[1]) + m[2] : this.code(name);
  }

  observed(o: Observed<string>): Observed<string> {
    return o.state === 'known' ? { ...o, value: this.code(o.value) } : o;
  }

  ref(ref: ObjectRef | null): ObjectRef | null {
    if (ref === null) return null;
    switch (ref.kind) {
      case 'connection':
        return { ...ref, name: this.code(ref.name) };
      case 'channel':
        return { ...ref, name: this.channel(ref.name) };
      case 'consumer':
        return { ...ref, channel: this.channel(ref.channel) };
      default:
        return ref;
    }
  }
}

function redact(base: ActualBase, r: Redactor): ActualBase {
  const mapList = <T>(
    o: Observed<readonly T[]>,
    f: (x: T) => T,
  ): Observed<readonly T[]> =>
    o.state === 'known' ? { ...o, value: o.value.map(f) } : o;
  return {
    ...base,
    connections: mapList(base.connections, (c: Connection) => ({
      ...c,
      ref: { kind: 'connection', name: r.code(c.ref.name) },
      peerHost: r.observed(c.peerHost),
    })),
    channels: mapList(base.channels, (c: Channel) => ({
      ...c,
      ref: { kind: 'channel', name: r.channel(c.ref.name, c.connection) },
      connection: r.code(c.connection),
    })),
    consumers: mapList(base.consumers, (c: Consumer) => ({
      ...c,
      ref: { ...c.ref, channel: r.channel(c.ref.channel, c.connection) },
      connection: r.code(c.connection),
    })),
    anomalies: base.anomalies.map((a: ReadAnomaly) => ({
      ...a,
      ref: r.ref(a.ref),
    })),
  };
}

/**
 * Ghi ảnh chụp `ocho.snapshot/1`. Chỉ lưu dữ liệu đọc được; mọi trường suy ra
 * được tính lại khi nạp. URL chỉ lưu băm. Với `redactHosts`, host và tên
 * connection thay bằng mã `h-<12 hex>` có muối ngẫu nhiên không ghi vào file.
 */
export function saveSnapshot(actual: Actual, opts: SnapshotOptions): string {
  let base = baseOf(actual);
  if (opts.redactHosts) base = redact(base, new Redactor(opts.randomBytes(32)));
  return JSON.stringify({
    schema: SNAPSHOT_SCHEMA,
    tool: { name: 'ocho', version: opts.toolVersion, spec: opts.specVersion },
    takenAt: opts.takenAt,
    context: {
      name: opts.contextName,
      urlHash: `sha256:${sha256Hex(opts.url).slice(0, 12)}`,
    },
    redaction: { hosts: opts.redactHosts },
    actual: base,
  });
}

const envelope = obj({
  schema: str,
  tool: obj({ name: str, version: str, spec: str }),
  takenAt: instant,
  context: obj({ name: str, urlHash: str }),
  redaction: obj({ hosts: bool }),
  actual: actualBaseShape,
});

/**
 * Nạp ảnh chụp, kiểm theo thứ tự SNAP1 (schema), SNAP2 (hình dạng), SNAP3 (bất biến),
 * rồi tính lại mọi trường suy ra bằng mã hiện tại. Nén `.gz` là việc của CLI.
 */
export function loadSnapshot(
  json: string,
  caps: CapabilityTable,
  file = '',
): Result<Actual, SnapshotError> {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (e) {
    return err({
      code: 'SNAP2',
      message: `invalid JSON: ${(e as Error).message}`,
      path: '$',
    });
  }
  const schema = (doc as { schema?: unknown } | null)?.schema;
  const m =
    typeof schema === 'string'
      ? /^ocho\.snapshot\/(\d+)(?:\.\d+)*$/.exec(schema)
      : null;
  if (!m || Number(m[1]) !== 1) {
    return err({
      code: 'SNAP1',
      message: `unsupported schema ${JSON.stringify(schema)}`,
    });
  }
  const shapeError = envelope(doc, '$');
  if (shapeError) {
    const [path, ...rest] = shapeError.split(': ');
    return err({ code: 'SNAP2', message: rest.join(': '), path });
  }
  const d = doc as { takenAt: Instant; actual: ActualBase };
  const base: ActualBase = {
    ...d.actual,
    users:
      d.actual.users ??
      unknown({ kind: 'source_unavailable' }, 'http.list', 'http:/api/users'),
    meta: { ...d.actual.meta, fromSnapshot: { takenAt: d.takenAt, file } },
  };
  const actual = deriveActual(base, caps);
  const violations = checkInvariants(actual, caps);
  if (violations.length > 0) {
    return err({
      code: 'SNAP3',
      message: `${violations.length} invariant violation(s)`,
      violations,
    });
  }
  return ok(actual);
}
