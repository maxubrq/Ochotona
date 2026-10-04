// Mọi phép suy ra trên phần đọc được: phiên bản cluster, metadata store,
// completeSince, Effective, tự kiểm, consistency. Dùng chung cho buildActual
// và loadSnapshot, nên ảnh chụp cũ luôn được tính lại bằng mã hiện tại.
import {
  type Actual,
  type ActualBase,
  COLLECTIONS,
  type Counter,
  type Exchange,
  type Queue,
  type QueueType,
  type ReadAnomaly,
} from './actual';
import { type CapabilityTable, capabilitiesFor } from './caps';
import { resolveEffective, selfCheck } from './effective';
import { type Observed, all, derive, known, unknown } from './observed';
import { refKey } from './ref';
import {
  type Version,
  compareVersion,
  instantFromMs,
  instantMs,
} from './units';

function clusterVersion(base: ActualBase): Observed<Version> {
  const path = 'derived:broker.version';
  const nodes = base.nodes;
  if (nodes.state === 'known') {
    const versions = nodes.value
      .map((n) => n.version)
      .filter((v) => v.state === 'known');
    if (versions.length > 0) {
      let min = versions[0];
      for (const v of versions)
        if (compareVersion(v.value, min.value) < 0) min = v;
      return known(min.value, {
        source: 'derived',
        path,
        observedAt: min.prov.observedAt,
      });
    }
  }
  const rep = base.broker.reported.version;
  return derive([rep], ([v]) => v, path);
}

function counter(
  base: ActualBase,
  count: Observed<number>,
  name: string,
): Observed<Counter> {
  const path = `derived:broker.counters.${name}`;
  if (count.state === 'unknown') return count;
  const nodes = base.nodes;
  if (nodes.state === 'unknown') {
    return unknown(
      { kind: 'depends_on', path: nodes.path, reason: nodes.reason },
      'derived',
      path,
    );
  }
  const running = nodes.value.filter((n) => n.running);
  if (running.length === 0) {
    return unknown(
      { kind: 'error', message: 'no running node' },
      'derived',
      path,
    );
  }
  const uptimes = all(
    running.map((n) => n.uptime),
    path,
  );
  if (uptimes.state === 'unknown') return uptimes;
  const minUptime = Math.min(...(uptimes.value as number[]));
  const completeSince = instantFromMs(
    instantMs(base.meta.readStartedAt) - minUptime * 1000,
  );
  return known(
    { count: count.value, completeSince },
    {
      source: count.prov.source,
      path: count.prov.path,
      observedAt: count.prov.observedAt,
    },
  );
}

function consistency(
  base: ActualBase,
  anomalies: readonly ReadAnomaly[],
): Record<string, 'ok' | 'degraded'> {
  const out: Record<string, 'ok' | 'degraded'> = {};
  for (const c of COLLECTIONS) {
    const list = base[c];
    const n = list.state === 'known' ? list.value.length : 0;
    const k = anomalies.filter((a) => a.collection === c).length;
    out[c] = k > 0.01 * n ? 'degraded' : 'ok';
  }
  return out;
}

/** Dựng `Actual` đầy đủ từ phần đọc được. Không đọc đồng hồ, tất định. */
export function deriveActual(base: ActualBase, table: CapabilityTable): Actual {
  const version = clusterVersion(base);
  const ff = base.broker.featureFlags;
  const metadataStore = derive(
    [ff],
    ([flags]): 'mnesia' | 'khepri' =>
      flags['khepri_db'] === 'enabled' ? 'khepri' : 'mnesia',
    'derived:broker.metadataStore',
  );
  const caps =
    version.state === 'known' ? capabilitiesFor(table, version.value) : null;

  const vhostDefaults = new Map<string, QueueType | null | undefined>();
  if (base.vhosts.state === 'known') {
    for (const v of base.vhosts.value) {
      vhostDefaults.set(
        v.ref.name,
        v.defaultQueueType.state === 'known'
          ? v.defaultQueueType.value
          : undefined,
      );
    }
  }

  const extra = new Map<string, ReadAnomaly>();
  const noteAnomalies = (as: readonly ReadAnomaly[]) => {
    for (const a of as)
      extra.set(`${a.kind}|${a.ref ? refKey(a.ref) : ''}|${a.detail}`, a);
  };
  // Mặc định dựng sẵn phụ thuộc phiên bản; không biết phiên bản thì không tính được.
  const versionUnknown = (): Observed<never> =>
    unknown(
      version.state === 'unknown'
        ? { kind: 'depends_on', path: version.path, reason: version.reason }
        : { kind: 'error', message: 'no capabilities' },
      'derived',
      'derived:effective',
    );

  const exchanges: Observed<readonly Exchange[]> =
    base.exchanges.state === 'unknown'
      ? base.exchanges
      : known(
          base.exchanges.value.map((x): Exchange => {
            if (!caps)
              return {
                ...x,
                effective: versionUnknown(),
                effectiveCheck: 'unverified',
              };
            const r = resolveEffective(
              { ref: x.ref, arguments: x.arguments },
              base.policies,
              base.operatorPolicies,
              caps,
            );
            noteAnomalies(r.anomalies);
            return {
              ...x,
              ...selfCheck(r, { appliedPolicy: x.appliedPolicy }),
            };
          }),
          base.exchanges.prov,
        );

  const queues: Observed<readonly Queue[]> =
    base.queues.state === 'unknown'
      ? base.queues
      : known(
          base.queues.value.map((q): Queue => {
            if (!caps)
              return {
                ...q,
                effective: versionUnknown(),
                effectiveCheck: 'unverified',
              };
            const r = resolveEffective(
              {
                ref: q.ref,
                queueType: q.type,
                arguments: q.arguments,
                vhostDefaultQueueType: vhostDefaults.has(q.ref.vhost)
                  ? vhostDefaults.get(q.ref.vhost)
                  : undefined,
              },
              base.policies,
              base.operatorPolicies,
              caps,
            );
            noteAnomalies(r.anomalies);
            return {
              ...q,
              ...selfCheck(r, {
                appliedPolicy: q.appliedPolicy,
                appliedOperatorPolicy: q.appliedOperatorPolicy,
                brokerEffectivePolicy: q.brokerEffectivePolicy,
              }),
            };
          }),
          base.queues.prov,
        );

  const anomalies = [...base.anomalies, ...extra.values()];
  const { reported, ...brokerRest } = base.broker;
  return {
    ...base,
    meta: { ...base.meta, consistency: consistency(base, anomalies) },
    broker: {
      ...brokerRest,
      version,
      metadataStore,
      counters: {
        unroutableDropped: counter(
          base,
          reported.unroutableDropped,
          'unroutableDropped',
        ),
        unroutableReturned: counter(
          base,
          reported.unroutableReturned,
          'unroutableReturned',
        ),
      },
      reported,
    },
    exchanges,
    queues,
    anomalies,
  };
}

/** Phần đọc được của một `Actual`, bỏ mọi trường suy ra. Ảnh chụp lưu đúng dạng này. */
export function baseOf(actual: Actual): ActualBase {
  const {
    version: _v,
    metadataStore: _m,
    counters: _c,
    ...broker
  } = actual.broker;
  const strip = <T extends { effective: unknown; effectiveCheck: unknown }>(
    x: T,
  ) => {
    const { effective: _e, effectiveCheck: _k, ...rest } = x;
    return rest;
  };
  return {
    ...actual,
    broker,
    exchanges:
      actual.exchanges.state === 'known'
        ? { ...actual.exchanges, value: actual.exchanges.value.map(strip) }
        : actual.exchanges,
    queues:
      actual.queues.state === 'known'
        ? { ...actual.queues, value: actual.queues.value.map(strip) }
        : actual.queues,
    anomalies: actual.anomalies.filter(
      (a) => a.kind !== 'unexpected_operator_key',
    ),
  };
}
