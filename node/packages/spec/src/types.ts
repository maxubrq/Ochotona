// Kiểu viết tay cho dữ liệu trong data/. Kiểu literal (RuleCode, I18nKey…)
// được sinh vào src/gen từ chính dữ liệu đó.
import type {
  AssumptionCode,
  ExclusionCode,
  LessonErrorCode,
} from './gen/codes';
import type { CanonicalKey } from './gen/keys';
import type { RuleCode } from './gen/rules';
import type { ObjectKind, Severity } from './gen/spec';

export type { Version } from './version';

/** Giá trị argument hoặc policy, giữ nguyên kiểu JSON. */
export type ArgValue =
  | string
  | number
  | boolean
  | null
  | readonly ArgValue[]
  | { readonly [k: string]: ArgValue };

export type Lang = 'en' | 'vi';
export type SourceId = 'http.list' | 'http.stats' | 'prometheus';
export type FixKind =
  'policy' | 'argument_migration' | 'client_change' | 'config' | 'none';
export type RuleParamType = 'string' | 'number' | 'instant' | 'list';

export interface RuleMeta {
  readonly code: RuleCode;
  readonly family: 'T' | 'R' | 'C' | 'N' | 'Q' | 'L' | 'VT' | 'DX' | 'F';
  /** Bậc I6 cao nhất luật bảo vệ. */
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly appliesTo: readonly ObjectKind[];
  /** Mọi mức luật có thể trả. */
  readonly severities: readonly Severity[];
  readonly dependsOnTolerance: boolean;
  /** Chỉ chạy với `--target-version`. */
  readonly targetVersionOnly: boolean;
  /** Để tài liệu; `requires` thật nằm ở `@ochotona/rules`. */
  readonly sources: readonly SourceId[];
  readonly fix: FixKind;
  /** `spec/0.4#T2` */
  readonly specRef: string;
  /** `['lesson#9.3']` */
  readonly lessonRefs: readonly string[];
  readonly params: Readonly<Record<string, RuleParamType>>;
  readonly status: 'active' | 'experimental' | 'deprecated';
  /** Phiên bản gói đầu tiên có luật. */
  readonly since: string;
  /** Ngày dự kiến gỡ, bắt buộc khi `status` là `deprecated`. */
  readonly deprecatedAt?: string;
}

export interface Capabilities {
  readonly retry: {
    readonly mechanism: 'dlx_ttl_tiers' | 'quorum_delayed_retry';
    readonly transientFailure: 'reject_requeue_false' | 'reject_requeue_true';
    readonly mainQueueDeadLetter: 'ocho.retry' | 'ocho.parking';
  };
  readonly nackCountsTowardDeliveryLimit: boolean;
  readonly consumerTimeoutScope: 'channel' | 'consumer';
  readonly mirroredClassicQueues: 'available' | 'removed';
  readonly metadataStores: readonly ('mnesia' | 'khepri')[];
  readonly metadataDefault: 'mnesia' | 'khepri';
  readonly defaults: {
    readonly classic: { readonly overflow: 'drop-head' };
    readonly quorum: {
      readonly overflow: 'drop-head';
      readonly deadLetterStrategy: 'at-most-once';
      /** `null` = không giới hạn. */
      readonly deliveryLimit: number | null;
    };
  };
  /** Giá trị Ocho đặt (T4). */
  readonly ochoSets: { readonly deliveryLimit: number };
  readonly endpoints: {
    readonly deprecatedFeaturesUsed: boolean;
    readonly vhostDefaultQueueType: boolean;
  };
  /**
   * `/api/{connections,channels,consumers}` khi tắt bộ thu thống kê
   * (`management_agent.disable_metrics_collector`): `listed` trả phần tử thật
   * (ít trường hơn), `rejected` trả 400, `empty` trả 200 với danh sách rỗng
   * không đáng tin.
   */
  readonly statsOffLists: {
    readonly connections: StatsOffList;
    readonly channels: StatsOffList;
    readonly consumers: StatsOffList;
  };
}

export type StatsOffList = 'listed' | 'rejected' | 'empty';

export interface CapabilityRange {
  /** Bao gồm, `4.0.0`. */
  readonly from: string;
  /** Không bao gồm; vắng = tới vô cực. */
  readonly to?: string;
  readonly caps: Capabilities;
}

export type CapabilityLookup =
  | {
      readonly status: 'supported';
      readonly caps: Capabilities;
      readonly range: CapabilityRange;
    }
  | {
      /** Trong khoảng, nhưng ngoài danh sách đã test hoặc là bản pre-release. */
      readonly status: 'untested';
      readonly caps: Capabilities;
      readonly range: CapabilityRange;
    }
  /** Nhỏ hơn `broker.minSupported`. */
  | { readonly status: 'unsupported' };

export type QueueType = 'classic' | 'quorum' | 'stream';

export interface KeyDef {
  readonly canonical: CanonicalKey;
  readonly argument?: string;
  readonly policy?: string;
  readonly appliesTo: readonly ('exchange' | QueueType)[];
  readonly resolution: 'argument_wins' | 'lower_wins' | 'argument_only';
  readonly valueType: 'string' | 'integer' | 'enum';
  readonly enum?: readonly string[];
  readonly unit?: 'ms' | 'bytes' | 'count';
  readonly operatorPolicyAllowed: boolean;
  readonly usedBy: readonly RuleCode[];
  readonly assumption?: AssumptionCode;
}

export interface Exclusion {
  readonly id: ExclusionCode;
  readonly kind: 'exchange' | 'queue' | 'binding' | 'consumer';
  /** Các điều kiện là AND. */
  readonly match: {
    readonly nameEquals?: string;
    readonly namePrefix?: string;
    readonly exclusive?: true;
    /** binding */
    readonly sourceEquals?: string;
    /** consumer */
    readonly queueEquals?: string;
    /** exchange không mang luồng nào */
    readonly hasOutgoingBindings?: false;
  };
  readonly scopes: readonly ('topology' | 'rules')[];
  /** Có khi và chỉ khi `scopes` chứa `rules`. */
  readonly rulesOutcome?: 'skip' | 'not_applicable_with_note';
}

export type CodeKind =
  | 'invariant'
  | 'forbidden'
  | 'spec-rule'
  | 'tool-rule'
  | 'diagnostic'
  | 'assumption'
  | 'test'
  | 'exclusion'
  | 'model-invariant'
  | 'cli-invariant'
  | 'lesson-error';

export interface CodeEntry {
  /** `T2`, `Y4`, `CX3` */
  readonly code: string;
  readonly owner: 'spec-core' | 'tool';
  readonly kind: CodeKind;
  /** Một dòng tiếng Anh. */
  readonly meaning: string;
  /** Mã spec lõi mà luật công cụ này cưỡng chế. */
  readonly enforces?: string;
  readonly status: 'active' | 'deprecated' | 'proposed';
  readonly deprecatedAt?: string;
}

export interface BlindSpot {
  readonly id: LessonErrorCode;
  readonly name: string;
  readonly caughtBy: 'doctor' | 'client' | 'lint' | 'decide' | 'none';
  readonly rules: readonly RuleCode[];
  /** Bản Ocho dự kiến bắt được lỗi này. */
  readonly plannedIn?: string;
}

export interface SeverityDef {
  readonly level: Severity;
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly label: Readonly<Record<Lang, string>>;
}
