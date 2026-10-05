// `IO` thật trên Node: process, node:fs/promises, child_process.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Exec, Fs, IO } from './io';

export const nodeFs: Fs = {
  readFile: (p) => readFile(p),
  writeFile: (p, d, o) => writeFile(p, d, o),
  rename: (a, b) => rename(a, b),
  unlink: (p) => unlink(p),
  mkdir: (p, o) => mkdir(p, o),
  stat: (p) => stat(p),
  chmod: (p, m) => chmod(p, m),
  async fsyncWrite(p, data, mode) {
    const h = await open(p, 'w', mode);
    try {
      await h.writeFile(data);
      await h.sync();
    } finally {
      await h.close();
    }
    await chmod(p, mode);
  },
};

/** `/bin/sh -c`, trên Windows `cmd.exe /d /s /c`; stdin đóng; giết khi quá giờ. */
export const nodeExec: Exec = (command, opts) =>
  new Promise((resolve) => {
    const [file, args] =
      process.platform === 'win32'
        ? ['cmd.exe', ['/d', '/s', '/c', command]]
        : ['/bin/sh', ['-c', command]];
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(file, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    const done = (r: Parameters<typeof resolve>[0]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    child.stdout.on('data', (b: Buffer) => {
      if (stdout.length < opts.maxBytes)
        stdout += b.toString('utf8').slice(0, opts.maxBytes - stdout.length);
    });
    child.stderr.on('data', (b: Buffer) => {
      if (stderr.length < opts.maxBytes) stderr += b.toString('utf8');
    });
    child.on('error', (e) =>
      done({ code: null, stdout: '', stderr, timedOut, error: e.message }),
    );
    child.on('close', (code) =>
      done({ code: timedOut ? null : code, stdout, stderr, timedOut }),
    );
  });

/** IO của tiến trình hiện tại. Ctrl-C lần đầu huỷ `signal`; lần hai thoát ngay. */
export function nodeIO(): IO {
  const controller = new AbortController();
  process.on('SIGINT', () => {
    if (controller.signal.aborted) process.exit(130);
    controller.abort();
  });
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    env: process.env,
    isTTY: {
      stdin: process.stdin.isTTY === true,
      stdout: process.stdout.isTTY === true,
      stderr: process.stderr.isTTY === true,
    },
    columns: process.stdout.isTTY ? process.stdout.columns : undefined,
    clock: () => Date.now(),
    fs: nodeFs,
    exec: nodeExec,
    signal: controller.signal,
    cwd: process.cwd(),
    platform: process.platform,
    homedir: homedir(),
    pid: process.pid,
    randomBytes: (n) => randomBytes(n),
    nodeVersion: process.version,
    arch: process.arch,
  };
}
