import type { Diag } from '@ochotona/model';

export type Path = readonly (string | number)[];

/** Dòng và cột tính từ 1; `end*` trỏ ngay sau giá trị. */
export interface Position {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * Vị trí của giá trị tại mỗi đường dẫn (của khoá khi giá trị vắng).
 * `nearest` lùi dần về map cha khi đường dẫn không có trong file.
 */
export interface PositionMap {
  get(path: Path): Position | undefined;
  nearest(path: Path): Position;
}

export type YamlCode =
  'YP1' | 'YP2' | 'YP3' | 'YP4' | 'YP5' | 'YP6' | 'YW1' | 'YW2';

export type DiagSeverity = 'error' | 'warning';

/** Chẩn đoán cú pháp của compiler; vị trí đã biết từ mã nguồn YAML. */
export interface YamlDiag {
  readonly code: YamlCode;
  readonly severity: DiagSeverity;
  /** Đường dẫn tới giá trị nếu xác định được (YW1, YW2, YP5); còn lại rỗng. */
  readonly path: Path;
  readonly params: Readonly<Record<string, string | number>>;
  readonly pos: Position;
}

export interface LocatedDiag {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly code: string;
  readonly severity: DiagSeverity;
  readonly path: Path;
  readonly params: Readonly<Record<string, string | number>>;
}

export type AnyDiag = YamlDiag | Diag;

/**
 * Chú thích do Ocho ghi. Mỗi dòng ra file thành `# ocho: <dòng>`.
 * `before`: trên khoá tại `path`. `inside`: ngay dưới khoá, trước phần tử đầu
 * của map tại `path`; map rỗng thì lùi về `before`.
 */
export interface OchoComment {
  readonly path: Path;
  readonly placement: 'before' | 'inside';
  readonly lines: readonly string[];
}
