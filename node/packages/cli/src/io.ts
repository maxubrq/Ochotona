// Mọi thứ bên ngoài mà CLI chạm tới. `bin/ocho.ts` nối bản thật; test truyền
// bản giả để chạy `run(argv, io)` trong tiến trình, không spawn, không cần TTY.

/** Luồng ghi tối thiểu: stdout, stderr. */
export interface Out {
  write(s: string): void;
}

/** Luồng đọc tối thiểu cho stdin; khớp `process.stdin` và `PassThrough`. */
export interface In {
  on(event: 'data', cb: (chunk: Buffer | string) => void): unknown;
  on(event: 'end' | 'close', cb: () => void): unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, cb: (...a: any[]) => void): unknown;
  pause(): unknown;
  resume(): unknown;
  setEncoding?(enc: 'utf8'): unknown;
  /** Chỉ có khi stdin là TTY. */
  setRawMode?(raw: boolean): unknown;
}

/** Tập con của `node:fs/promises` mà CLI dùng; test thay được từng hàm để giả lập sập. */
export interface Fs {
  readFile(path: string): Promise<Buffer>;
  writeFile(
    path: string,
    data: string | Uint8Array,
    opts?: { mode?: number; flag?: string },
  ): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(
    path: string,
    opts: { recursive: true; mode?: number },
  ): Promise<unknown>;
  stat(path: string): Promise<{ mode: number; isFile(): boolean }>;
  chmod(path: string, mode: number): Promise<void>;
  /** Tạo mới (`wx`), ghi, `fsync`, đóng. */
  fsyncWrite(
    path: string,
    data: string | Uint8Array,
    mode: number,
  ): Promise<void>;
}

export interface ExecResult {
  /** `null` khi bị giết vì quá giờ. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** Không chạy được tiến trình (ENOENT…). */
  readonly error?: string;
}

/** Chạy một lệnh shell; stdin đóng; stdout cắt ở `maxBytes`. */
export type Exec = (
  command: string,
  opts: { readonly timeoutMs: number; readonly maxBytes: number },
) => Promise<ExecResult>;

export interface IO {
  readonly stdout: Out;
  readonly stderr: Out;
  readonly stdin: In;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isTTY: {
    readonly stdin: boolean;
    readonly stdout: boolean;
    readonly stderr: boolean;
  };
  /** Bề rộng terminal của stdout; `undefined` khi không phải TTY. */
  readonly columns: number | undefined;
  /** Thời điểm hiện tại, ms từ epoch. */
  readonly clock: () => number;
  readonly fs: Fs;
  readonly exec: Exec;
  /** Huỷ khi người dùng bấm Ctrl-C. */
  readonly signal: AbortSignal;
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly homedir: string;
  readonly pid: number;
  readonly randomBytes: (n: number) => Uint8Array;
  /** Phiên bản Node, cho `ocho version` và lỗi nội bộ. */
  readonly nodeVersion: string;
  readonly arch: string;
}
