/** Chẩn đoán có mã (Y1…Y14, SNAP1…SNAP3). `path` là mảng khoá tới chỗ sai. */
export interface Diag {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly params: Readonly<Record<string, string | number>>;
}
