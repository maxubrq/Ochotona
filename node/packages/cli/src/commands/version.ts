// `ocho version`.

import { SPEC_VERSION } from '@ochotona/spec';
import type { ExitCode } from '../errors';
import { writeJson } from '../render/json';
import type { Session } from '../session';
import { TOOL_VERSION } from '../version';

export function version(s: Session): ExitCode {
  if (s.json) {
    writeJson(s, {
      schema: 'ocho.version/1',
      version: TOOL_VERSION,
      spec: SPEC_VERSION,
      node: s.io.nodeVersion,
      platform: s.io.platform,
      arch: s.io.arch,
    });
    return 0;
  }
  s.io.stdout.write(
    `${s.t('version.line', {
      version: TOOL_VERSION,
      spec: SPEC_VERSION,
      node: s.io.nodeVersion,
      platform: `${s.io.platform}-${s.io.arch}`,
    })}\n`,
  );
  return 0;
}
