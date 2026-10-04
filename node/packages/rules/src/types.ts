import type {
  Actual,
  ArgMap,
  FlowMap,
  Indexes,
  Instant,
  ObjectKind,
  ObjectRef,
  Provenance,
  Severity,
  UnknownReason,
  Version,
  Waiver,
} from '@ochotona/model';
import type {
  Capabilities,
  FixKind,
  Result,
  RuleCode,
  Tolerance,
} from '@ochotona/spec';
import type { PolicyTarget } from './fix';
import type { FieldPath, View } from './paths';

/** Bậc cơ chế của trình tự sửa; thứ tự trong mảng là thứ tự ưu tiên. */
export type Urgency =
  'loss_occurred' | 'active_loss_path' | 'at_risk' | 'hygiene';
export const URGENCIES: readonly Urgency[] = [
  'loss_occurred',
  'active_loss_path',
  'at_risk',
  'hygiene',
];

export type ParamValue = string | number | readonly string[];
export type Params = Readonly<Record<string, ParamValue>>;

export interface Evidence {
  readonly kind: 'observed' | 'inferred';
  readonly path: FieldPath;
  /** Lấy từ `Observed`; bằng chứng `inferred` có thể không có. */
  readonly prov?: Provenance;
  readonly value?: unknown;
  /** Mốc bắt đầu của bộ đếm. */
  readonly since?: Instant;
  readonly note?: string;
}

export interface FixSpec {
  readonly kind: FixKind;
  /** Khoá policy đề xuất. */
  readonly set?: ArgMap;
  /** Lệnh dựng sẵn từ `fix-templates.json`, không có bí mật. */
  readonly rabbitmqadmin?: string;
  /** Policy mà lệnh khai; nội bộ, `toFinding` không xuất. */
  readonly policy?: PolicyTarget;
}

export interface Fail {
  readonly result: 'fail';
  readonly severity: Severity;
  readonly urgency: Urgency;
  /** Chọn khuôn câu: `rule.<MÃ>.<trường>.<biến thể>`. */
  readonly variant?: string;
  readonly evidence: readonly Evidence[];
  readonly params: Params;
  readonly fix?: FixSpec;
}

export type Verdict =
  | { readonly result: 'pass'; readonly note?: 'loose_by_declaration' }
  | { readonly result: 'not_applicable'; readonly note?: string }
  /** Trường `optional` cần cho nhánh đang chấm mà `unknown`. */
  | { readonly result: 'needs'; readonly path: FieldPath }
  /**
   * Kết luận phụ thuộc một phép suy ra `unknown` mà không phải trường nào
   * (L3: pattern ngoài tập hỗ trợ). Lý do đi thẳng vào `not_checked`.
   */
  | {
      readonly result: 'not_checked';
      readonly path: FieldPath;
      readonly reason: UnknownReason;
      readonly source: string;
    }
  | Fail;

export interface Ctx {
  readonly actual: Actual;
  readonly index: Indexes;
  readonly flows: FlowMap;
  /** Năng lực của phiên bản broker (spec). */
  readonly caps: Capabilities;
  readonly version: Version;
  readonly targetVersion: Version | null;
  readonly now: Instant;
}

export interface RuleDef<
  K extends ObjectKind = ObjectKind,
  R extends readonly FieldPath[] = readonly FieldPath[],
  O extends readonly FieldPath[] = readonly FieldPath[],
> {
  /** Phải có trong `rules.json`. */
  readonly code: RuleCode;
  /** Một loại; L3 khai hai `RuleDef` cùng mã. */
  readonly appliesTo: K;
  readonly requires: R;
  readonly optional: O;
  /** Biến thể luật có thể trả; ma trận phủ đòi một ca cho mỗi biến thể. */
  readonly variants?: readonly string[];
  /** Trường `optional` luật có thể trả `needs`; ma trận phủ đòi một ca cho mỗi trường. */
  readonly needs?: readonly O[number][];
  /** Một đối tượng có thể cho nhiều kết quả (VT3, DX3): trả mảng. */
  evaluate(view: View<K, R, O>, ctx: Ctx): Verdict | readonly Verdict[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRuleDef = RuleDef<
  any,
  readonly FieldPath[],
  readonly FieldPath[]
>;

export interface RuleResult {
  readonly rule: RuleCode;
  readonly object: ObjectRef;
  readonly result: Result;
  /** Có khi `fail`. */
  readonly severity?: Severity;
  readonly urgency?: Urgency;
  readonly variant?: string;
  readonly evidence: readonly Evidence[];
  readonly params: Params;
  readonly fix?: FixSpec;
  readonly note?: string;
  readonly notChecked?: {
    readonly path: string;
    readonly reason: UnknownReason;
    /** Đường dẫn nguồn của nguyên nhân gốc (`http:/api/queues`). */
    readonly source: string;
  };
  /** Có khi miễn trừ còn hiệu lực. */
  readonly waiver?: Waiver;
  readonly experimental: boolean;
  /** Dung sai của đối tượng lúc chấm. */
  readonly tolerance: Tolerance;
}

export interface InternalIssue {
  readonly kind: 'exception' | 'contract' | 'cl4_downgrade';
  readonly rule: RuleCode;
  readonly object: ObjectRef;
  readonly detail: string;
}

export interface Action {
  readonly rule: RuleCode;
  readonly variant?: string;
  readonly severity: Severity;
  readonly urgency: Urgency;
  readonly vhost: string;
  readonly objects: readonly ObjectRef[];
  readonly fixKind: FixKind;
}
