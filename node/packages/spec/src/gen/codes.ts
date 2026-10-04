// Sinh bởi scripts/codegen.ts từ data/. Không sửa tay.

import type { CodeEntry } from '../types';

export type Code =
  | 'A1'
  | 'A4'
  | 'C1'
  | 'C2'
  | 'CL1'
  | 'CL2'
  | 'CL3'
  | 'CL4'
  | 'CL5'
  | 'CL6'
  | 'CL7'
  | 'CL8'
  | 'CL9'
  | 'CL10'
  | 'CT-01'
  | 'CT-02'
  | 'CT-03'
  | 'CT-04'
  | 'CT-05'
  | 'CT-06'
  | 'CT-07'
  | 'CT-08'
  | 'CT-09'
  | 'CT-10'
  | 'CT-11'
  | 'CT-12'
  | 'CT-13'
  | 'CT-14'
  | 'CT-15'
  | 'CT-16'
  | 'CT-17'
  | 'CT-18'
  | 'CT-19'
  | 'CT-20'
  | 'CT-21'
  | 'CT-22'
  | 'CT-23'
  | 'CT-24'
  | 'CT-25'
  | 'CT-26'
  | 'CT-27'
  | 'CT-28'
  | 'CT-29'
  | 'CT-30'
  | 'CT-31'
  | 'CT-32'
  | 'CT-33'
  | 'CT-34'
  | 'CT-35'
  | 'CT-36'
  | 'CT-37'
  | 'CT-38'
  | 'CT-39'
  | 'CT-40'
  | 'CT-41'
  | 'CT-42'
  | 'CT-43'
  | 'CT-44'
  | 'CT-45'
  | 'CT-46'
  | 'CX1'
  | 'CX2'
  | 'CX3'
  | 'CX4'
  | 'CX5'
  | 'CX6'
  | 'CX7'
  | 'CX8'
  | 'CX9'
  | 'CX10'
  | 'D5'
  | 'DX1'
  | 'DX2'
  | 'DX3'
  | 'E1'
  | 'E2'
  | 'E3'
  | 'EX1'
  | 'EX2'
  | 'EX3'
  | 'EX4'
  | 'EX5'
  | 'EX6'
  | 'EX7'
  | 'EX8'
  | 'EX9'
  | 'F4'
  | 'G1'
  | 'G2'
  | 'G3'
  | 'G4'
  | 'G5'
  | 'G6'
  | 'G7'
  | 'G8'
  | 'G9'
  | 'G10'
  | 'G11'
  | 'G12'
  | 'G13'
  | 'G14'
  | 'GC1'
  | 'GC2'
  | 'GC3'
  | 'GC4'
  | 'GC5'
  | 'GC6'
  | 'GC7'
  | 'GC8'
  | 'GC9'
  | 'GC10'
  | 'GC11'
  | 'GC12'
  | 'GC13'
  | 'GC14'
  | 'GC15'
  | 'GC16'
  | 'GC17'
  | 'GC18'
  | 'GC19'
  | 'H2'
  | 'I1'
  | 'I6'
  | 'I7'
  | 'INV1'
  | 'INV2'
  | 'INV3'
  | 'INV4'
  | 'INV5'
  | 'INV6'
  | 'INV7'
  | 'L3'
  | 'L6'
  | 'LE1'
  | 'LE2'
  | 'LE3'
  | 'LE4'
  | 'LE5'
  | 'LE6'
  | 'LE7'
  | 'LE8'
  | 'LE9'
  | 'LE10'
  | 'LE11'
  | 'LE12'
  | 'LE13'
  | 'LE14'
  | 'LE15'
  | 'LE16'
  | 'LE17'
  | 'LE18'
  | 'LE19'
  | 'LE20'
  | 'MG3'
  | 'N1'
  | 'N2'
  | 'N3'
  | 'OC1'
  | 'P5'
  | 'Q1'
  | 'Q3'
  | 'Q5'
  | 'R1'
  | 'SNAP1'
  | 'SNAP2'
  | 'SNAP3'
  | 'SQ1'
  | 'SQ2'
  | 'SQ3'
  | 'SQ4'
  | 'T1'
  | 'T2'
  | 'T3'
  | 'T4'
  | 'T5'
  | 'T9'
  | 'T10'
  | 'T11'
  | 'T12'
  | 'U2'
  | 'U3'
  | 'U5'
  | 'U6'
  | 'U7'
  | 'U8'
  | 'V1'
  | 'VT1'
  | 'VT2'
  | 'VT3'
  | 'VT4'
  | 'Y1'
  | 'Y2'
  | 'Y3'
  | 'Y4'
  | 'Y5'
  | 'Y6'
  | 'Y7'
  | 'Y8'
  | 'Y9'
  | 'Y10'
  | 'Y11'
  | 'Y12'
  | 'Y13'
  | 'Y14';
export type DiagCode =
  | 'CX1'
  | 'CX2'
  | 'CX3'
  | 'CX4'
  | 'CX5'
  | 'CX6'
  | 'CX7'
  | 'CX8'
  | 'CX9'
  | 'CX10'
  | 'OC1'
  | 'SNAP1'
  | 'SNAP2'
  | 'SNAP3'
  | 'Y1'
  | 'Y2'
  | 'Y3'
  | 'Y4'
  | 'Y5'
  | 'Y6'
  | 'Y7'
  | 'Y8'
  | 'Y9'
  | 'Y10'
  | 'Y11'
  | 'Y12'
  | 'Y13'
  | 'Y14';
export type ExclusionCode =
  'EX1' | 'EX2' | 'EX3' | 'EX4' | 'EX5' | 'EX6' | 'EX7' | 'EX8' | 'EX9';
export type AssumptionCode =
  | 'GC1'
  | 'GC2'
  | 'GC3'
  | 'GC4'
  | 'GC5'
  | 'GC6'
  | 'GC7'
  | 'GC8'
  | 'GC9'
  | 'GC10'
  | 'GC11'
  | 'GC12'
  | 'GC13'
  | 'GC14'
  | 'GC15'
  | 'GC16'
  | 'GC17'
  | 'GC18'
  | 'GC19';
export type LessonErrorCode =
  | 'LE1'
  | 'LE2'
  | 'LE3'
  | 'LE4'
  | 'LE5'
  | 'LE6'
  | 'LE7'
  | 'LE8'
  | 'LE9'
  | 'LE10'
  | 'LE11'
  | 'LE12'
  | 'LE13'
  | 'LE14'
  | 'LE15'
  | 'LE16'
  | 'LE17'
  | 'LE18'
  | 'LE19'
  | 'LE20';

export const CODES = [
  {
    code: 'A1',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'Source rule',
    status: 'active',
  },
  {
    code: 'A4',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'Spec core rule A4 (refers to producer sequence numbers)',
    status: 'active',
  },
  {
    code: 'C1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Consumers acknowledge manually, after the work is committed',
    status: 'active',
  },
  {
    code: 'C2',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Consumer prefetch is bounded and measured',
    status: 'active',
  },
  {
    code: 'CL1',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'Read commands never write to the broker',
    status: 'active',
  },
  {
    code: 'CL2',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning:
      'No silent green: every rule returns fail, pass, not_checked with a reason, or not_applicable',
    status: 'active',
  },
  {
    code: 'CL3',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning:
      'Every finding says what happened, whether data is safe, what to do next, mechanism, source, time, spec section',
    status: 'active',
  },
  {
    code: 'CL4',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'Observed evidence is kept apart from inferred evidence',
    status: 'active',
  },
  {
    code: 'CL5',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'No silent self-repair',
    status: 'active',
  },
  {
    code: 'CL6',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'Never become load on the broker',
    status: 'active',
  },
  {
    code: 'CL7',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'No outbound calls besides the broker',
    status: 'active',
  },
  {
    code: 'CL8',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'One source for rule text: @ochotona/spec',
    status: 'active',
  },
  {
    code: 'CL9',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'User decisions live in ocho.yaml',
    status: 'active',
  },
  {
    code: 'CL10',
    owner: 'tool',
    kind: 'cli-invariant',
    meaning: 'JSON output is a versioned contract',
    status: 'active',
  },
  {
    code: 'CT-01',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-01',
    status: 'active',
  },
  {
    code: 'CT-02',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-02',
    status: 'active',
  },
  {
    code: 'CT-03',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-03',
    status: 'active',
  },
  {
    code: 'CT-04',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-04',
    status: 'active',
  },
  {
    code: 'CT-05',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-05',
    status: 'active',
  },
  {
    code: 'CT-06',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-06',
    status: 'active',
  },
  {
    code: 'CT-07',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-07',
    status: 'active',
  },
  {
    code: 'CT-08',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-08',
    status: 'active',
  },
  {
    code: 'CT-09',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-09',
    status: 'active',
  },
  {
    code: 'CT-10',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-10',
    status: 'active',
  },
  {
    code: 'CT-11',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-11',
    status: 'active',
  },
  {
    code: 'CT-12',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-12',
    status: 'active',
  },
  {
    code: 'CT-13',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-13',
    status: 'active',
  },
  {
    code: 'CT-14',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-14',
    status: 'active',
  },
  {
    code: 'CT-15',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-15',
    status: 'active',
  },
  {
    code: 'CT-16',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-16',
    status: 'active',
  },
  {
    code: 'CT-17',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-17',
    status: 'active',
  },
  {
    code: 'CT-18',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-18',
    status: 'active',
  },
  {
    code: 'CT-19',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-19',
    status: 'active',
  },
  {
    code: 'CT-20',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-20',
    status: 'active',
  },
  {
    code: 'CT-21',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-21',
    status: 'active',
  },
  {
    code: 'CT-22',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-22',
    status: 'active',
  },
  {
    code: 'CT-23',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-23',
    status: 'active',
  },
  {
    code: 'CT-24',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-24',
    status: 'active',
  },
  {
    code: 'CT-25',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-25',
    status: 'active',
  },
  {
    code: 'CT-26',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-26',
    status: 'active',
  },
  {
    code: 'CT-27',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-27',
    status: 'active',
  },
  {
    code: 'CT-28',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-28',
    status: 'active',
  },
  {
    code: 'CT-29',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Overlapping policies resolve to one effective policy',
    status: 'active',
  },
  {
    code: 'CT-30',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'explain shows the layer of every effective value',
    status: 'active',
  },
  {
    code: 'CT-31',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-31',
    status: 'active',
  },
  {
    code: 'CT-32',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'import followed by plan shows zero changes',
    status: 'active',
  },
  {
    code: 'CT-33',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-33',
    status: 'active',
  },
  {
    code: 'CT-34',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-34',
    status: 'active',
  },
  {
    code: 'CT-35',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-35',
    status: 'active',
  },
  {
    code: 'CT-36',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-36',
    status: 'active',
  },
  {
    code: 'CT-37',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-37',
    status: 'active',
  },
  {
    code: 'CT-38',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-38',
    status: 'active',
  },
  {
    code: 'CT-39',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-39',
    status: 'active',
  },
  {
    code: 'CT-40',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-40',
    status: 'active',
  },
  {
    code: 'CT-41',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-41',
    status: 'active',
  },
  {
    code: 'CT-42',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-42',
    status: 'active',
  },
  {
    code: 'CT-43',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-43',
    status: 'active',
  },
  {
    code: 'CT-44',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-44',
    status: 'active',
  },
  {
    code: 'CT-45',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-45',
    status: 'active',
  },
  {
    code: 'CT-46',
    owner: 'spec-core',
    kind: 'test',
    meaning: 'Spec core conformance test CT-46',
    status: 'active',
  },
  {
    code: 'CX1',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Cannot reach the host (DNS, TCP)',
    status: 'active',
  },
  {
    code: 'CX2',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'TLS certificate invalid or CA mismatch',
    status: 'active',
  },
  {
    code: 'CX3',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Broker returns 401 at /api/overview',
    status: 'active',
  },
  {
    code: 'CX4',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'URL contains a password and is refused',
    status: 'active',
  },
  {
    code: 'CX5',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: '--insecure is on',
    status: 'active',
  },
  {
    code: 'CX6',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Context file mode wider than 0600',
    status: 'active',
  },
  {
    code: 'CX7',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'password_command failed or took longer than 10 seconds',
    status: 'active',
  },
  {
    code: 'CX8',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Broker version below broker.minSupported',
    status: 'active',
  },
  {
    code: 'CX9',
    owner: 'tool',
    kind: 'diagnostic',
    meaning:
      'Broker returns 403 at /api/overview: the user has no management tag',
    status: 'active',
  },
  {
    code: 'CX10',
    owner: 'tool',
    kind: 'diagnostic',
    meaning:
      'Invalid broker URL: scheme other than http or https, or a query or fragment',
    status: 'active',
  },
  {
    code: 'D5',
    owner: 'spec-core',
    kind: 'invariant',
    meaning:
      'Every error says what happened, whether data is safe, and what to do next',
    status: 'active',
  },
  {
    code: 'DX1',
    owner: 'tool',
    kind: 'tool-rule',
    meaning: 'Queue used as storage',
    status: 'active',
  },
  {
    code: 'DX2',
    owner: 'tool',
    kind: 'tool-rule',
    meaning: 'disk_free_limit below node memory',
    status: 'active',
  },
  {
    code: 'DX3',
    owner: 'tool',
    kind: 'tool-rule',
    meaning: 'Connections or queues churn constantly',
    status: 'active',
  },
  {
    code: 'E1',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'External effect kind E1',
    status: 'active',
  },
  {
    code: 'E2',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'External effect kind E2',
    status: 'active',
  },
  {
    code: 'E3',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'External effect kind E3',
    status: 'active',
  },
  {
    code: 'EX1',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Default exchange',
    status: 'active',
  },
  {
    code: 'EX2',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Exchange with the reserved amq. prefix (topology)',
    status: 'active',
  },
  {
    code: 'EX3',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'amq. exchange without outgoing bindings (rules)',
    status: 'active',
  },
  {
    code: 'EX4',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Exclusive queue',
    status: 'active',
  },
  {
    code: 'EX5',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Broker-named queue amq.gen-',
    status: 'active',
  },
  {
    code: 'EX6',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'MQTT subscription queue',
    status: 'active',
  },
  {
    code: 'EX7',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Ocho system queue',
    status: 'active',
  },
  {
    code: 'EX8',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Implicit binding of the default exchange',
    status: 'active',
  },
  {
    code: 'EX9',
    owner: 'tool',
    kind: 'exclusion',
    meaning: 'Consumer on direct reply-to',
    status: 'active',
  },
  {
    code: 'F4',
    owner: 'spec-core',
    kind: 'forbidden',
    meaning:
      'Forbidden transition: a failed message is requeued immediately (requeue loop)',
    status: 'active',
  },
  {
    code: 'G1',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G1',
    status: 'active',
  },
  {
    code: 'G2',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G2',
    status: 'active',
  },
  {
    code: 'G3',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G3',
    status: 'active',
  },
  {
    code: 'G4',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G4',
    status: 'active',
  },
  {
    code: 'G5',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G5',
    status: 'active',
  },
  {
    code: 'G6',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G6',
    status: 'active',
  },
  {
    code: 'G7',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G7',
    status: 'active',
  },
  {
    code: 'G8',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G8',
    status: 'active',
  },
  {
    code: 'G9',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G9',
    status: 'active',
  },
  {
    code: 'G10',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G10',
    status: 'active',
  },
  {
    code: 'G11',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G11',
    status: 'active',
  },
  {
    code: 'G12',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G12',
    status: 'active',
  },
  {
    code: 'G13',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G13',
    status: 'active',
  },
  {
    code: 'G14',
    owner: 'spec-core',
    kind: 'assumption',
    meaning: 'Spec core assumption G14',
    status: 'active',
  },
  {
    code: 'GC1',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'A monitoring user reads every list endpoint doctor needs',
    status: 'active',
  },
  {
    code: 'GC2',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'Channel list carries confirm even with management stats disabled',
    status: 'active',
  },
  {
    code: 'GC3',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'Unroutable-dropped counters exist on 3.13 and later',
    status: 'active',
  },
  {
    code: 'GC4',
    owner: 'tool',
    kind: 'assumption',
    meaning: '/api/consumers returns ack_required and prefetch_count',
    status: 'active',
  },
  {
    code: 'GC5',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'List endpoints support paging and column selection',
    status: 'active',
  },
  {
    code: 'GC6',
    owner: 'tool',
    kind: 'assumption',
    meaning: '/api/nodes has disk_free_limit and mem_limit',
    status: 'active',
  },
  {
    code: 'GC7',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'A Node SEA binary starts within 300 ms',
    status: 'active',
  },
  {
    code: 'GC8',
    owner: 'tool',
    kind: 'assumption',
    meaning:
      '/api/overview has message_stats exactly when management stats are on',
    status: 'active',
  },
  {
    code: 'GC9',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'Per-node version is readable from /api/nodes',
    status: 'active',
  },
  {
    code: 'GC10',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'Per-key merge rules between arguments and policies',
    status: 'active',
  },
  {
    code: 'GC11',
    owner: 'tool',
    kind: 'assumption',
    meaning:
      'at-least-once without overflow reject-publish falls back to at-most-once',
    status: 'active',
  },
  {
    code: 'GC12',
    owner: 'tool',
    kind: 'assumption',
    meaning:
      '/api/queues returns effective_policy_definition, readable by a monitoring user',
    status: 'active',
  },
  {
    code: 'GC13',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'List endpoints return items in a stable name order across pages',
    status: 'active',
  },
  {
    code: 'GC14',
    owner: 'tool',
    kind: 'assumption',
    meaning:
      'Missing apply-to means all; operator policies hold only numeric keys',
    status: 'active',
  },
  {
    code: 'GC15',
    owner: 'tool',
    kind: 'assumption',
    meaning: '/api/vhosts has default_queue_type on 3.13',
    status: 'active',
  },
  {
    code: 'GC16',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'Reading /api/overview again at the end detects page_shift',
    status: 'active',
  },
  {
    code: 'GC17',
    owner: 'tool',
    kind: 'assumption',
    meaning: '/api/deprecated-features/used exists from 3.13',
    status: 'active',
  },
  {
    code: 'GC18',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'The broker refuses to declare exchanges starting with amq.',
    status: 'active',
  },
  {
    code: 'GC19',
    owner: 'tool',
    kind: 'assumption',
    meaning: 'Intl.PluralRules has en and vi data in Node 20 and browsers',
    status: 'active',
  },
  {
    code: 'H2',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Family member names contain none of . * # / +',
    status: 'active',
  },
  {
    code: 'I1',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'Never report green on what was not checked',
    status: 'active',
  },
  {
    code: 'I6',
    owner: 'spec-core',
    kind: 'invariant',
    meaning:
      'Severity has five tiers: data safety, semantics, operability, performance, cost',
    status: 'active',
  },
  {
    code: 'I7',
    owner: 'spec-core',
    kind: 'invariant',
    meaning: 'A failing component never reports success',
    status: 'active',
  },
  {
    code: 'INV1',
    owner: 'tool',
    kind: 'model-invariant',
    meaning: 'refKey is unique within each collection',
    status: 'active',
  },
  {
    code: 'INV2',
    owner: 'tool',
    kind: 'model-invariant',
    meaning: 'Every known collection is sorted by refKey',
    status: 'active',
  },
  {
    code: 'INV3',
    owner: 'tool',
    kind: 'model-invariant',
    meaning: 'Every observedAt lies within the read window',
    status: 'active',
  },
  {
    code: 'INV4',
    owner: 'tool',
    kind: 'model-invariant',
    meaning: 'queue.type is one of three types; quorum queues are durable',
    status: 'active',
  },
  {
    code: 'INV5',
    owner: 'tool',
    kind: 'model-invariant',
    meaning:
      'builtin_default entries exist only for keys in the default table of the queue type and version',
    status: 'active',
  },
  {
    code: 'INV6',
    owner: 'tool',
    kind: 'model-invariant',
    meaning:
      'Counter.count is not negative and completeSince is not after readStartedAt',
    status: 'active',
  },
  {
    code: 'INV7',
    owner: 'tool',
    kind: 'model-invariant',
    meaning: 'No numeric field is NaN or infinite',
    status: 'active',
  },
  {
    code: 'L3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning:
      'Exactly one policy applies to an object; keys are never merged across policies',
    status: 'active',
  },
  {
    code: 'L6',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Every effective value can be explained by the layer that set it',
    status: 'active',
  },
  {
    code: 'LE1',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Publishing without confirms',
    status: 'active',
  },
  {
    code: 'LE2',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Dual write',
    status: 'active',
  },
  {
    code: 'LE3',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Unroutable messages not handled',
    status: 'active',
  },
  {
    code: 'LE4',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Auto-ack in a strict flow',
    status: 'active',
  },
  {
    code: 'LE5',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Ack before commit',
    status: 'active',
  },
  {
    code: 'LE6',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Non-idempotent consumer',
    status: 'active',
  },
  {
    code: 'LE7',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Classic queue for data that must not be lost',
    status: 'active',
  },
  {
    code: 'LE8',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Relying on global ordering',
    status: 'active',
  },
  {
    code: 'LE9',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'At-most-once dead-lettering',
    status: 'active',
  },
  {
    code: 'LE10',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Not handling the UNKNOWN outcome',
    status: 'active',
  },
  {
    code: 'LE11',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Immediate requeue on failure',
    status: 'active',
  },
  {
    code: 'LE12',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Prefetch 0 or 1 without measuring',
    status: 'active',
  },
  {
    code: 'LE13',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'One connection per message',
    status: 'active',
  },
  {
    code: 'LE14',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Sharing a channel across threads',
    status: 'active',
  },
  {
    code: 'LE15',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Publisher and consumer on one connection',
    status: 'active',
  },
  {
    code: 'LE16',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Queue used as storage',
    status: 'active',
  },
  {
    code: 'LE17',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Per-message TTL for retry',
    status: 'active',
  },
  {
    code: 'LE18',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Unbounded dynamic queue creation',
    status: 'active',
  },
  {
    code: 'LE19',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'Cluster spread across regions',
    status: 'active',
  },
  {
    code: 'LE20',
    owner: 'tool',
    kind: 'lesson-error',
    meaning: 'RabbitMQ as synchronous RPC for everything',
    status: 'active',
  },
  {
    code: 'MG3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Changing a queue argument needs a migration, not a hot change',
    status: 'active',
  },
  {
    code: 'N1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Publishing and consuming use separate connections',
    status: 'active',
  },
  {
    code: 'N2',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Every connection sets a connection name',
    status: 'active',
  },
  {
    code: 'N3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Connections use heartbeats',
    status: 'active',
  },
  {
    code: 'OC1',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Read-only command runs as a user tagged administrator',
    status: 'active',
  },
  {
    code: 'P5',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Plain definitions, policies and users are an export target',
    status: 'active',
  },
  {
    code: 'Q1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Each service has its own RabbitMQ user',
    status: 'active',
  },
  {
    code: 'Q3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Applications do not connect as guest or as an administrator',
    status: 'active',
  },
  {
    code: 'Q5',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Passwords are never stored as plain text',
    status: 'active',
  },
  {
    code: 'R1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Publishers use publisher confirms',
    status: 'active',
  },
  {
    code: 'SNAP1',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Unsupported snapshot schema',
    status: 'active',
  },
  {
    code: 'SNAP2',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Malformed snapshot',
    status: 'active',
  },
  {
    code: 'SNAP3',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Snapshot breaks a model invariant',
    status: 'active',
  },
  {
    code: 'SQ1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Producer sequence rule 1 (proposed rename of S1, spec core 5.2)',
    status: 'proposed',
  },
  {
    code: 'SQ2',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Producer sequence rule 2 (proposed rename of S2, spec core 5.2)',
    status: 'proposed',
  },
  {
    code: 'SQ3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Producer sequence rule 3 (proposed rename of S3, spec core 5.2)',
    status: 'proposed',
  },
  {
    code: 'SQ4',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Producer sequence rule 4 (proposed rename of S4, spec core 5.2)',
    status: 'proposed',
  },
  {
    code: 'T1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning:
      'Data that must not be lost lives in a quorum queue, not a classic queue',
    status: 'active',
  },
  {
    code: 'T2',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning:
      'Every exchange that routes messages has a working alternate exchange',
    status: 'active',
  },
  {
    code: 'T3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'A length-limited queue does not use overflow drop-head',
    status: 'active',
  },
  {
    code: 'T4',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning:
      'A quorum queue that can drop at its delivery limit has a dead-letter target',
    status: 'active',
  },
  {
    code: 'T5',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning:
      'Dead-lettering from a quorum queue is at-least-once with overflow reject-publish',
    status: 'active',
  },
  {
    code: 'T9',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'A queue with message TTL or expires has a dead-letter exchange',
    status: 'active',
  },
  {
    code: 'T10',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Stream rule, out of scope for Ocho v0.1',
    status: 'active',
  },
  {
    code: 'T11',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'MQTT session rule, out of scope for Ocho v0.1',
    status: 'active',
  },
  {
    code: 'T12',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'MQTT session rule, out of scope for Ocho v0.1',
    status: 'active',
  },
  {
    code: 'U2',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Command surface of the tool',
    status: 'active',
  },
  {
    code: 'U3',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'plan right after import shows zero changes',
    status: 'active',
  },
  {
    code: 'U5',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning:
      'A finding names the rule, three facts, mechanism, data source and spec section',
    status: 'active',
  },
  {
    code: 'U6',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Color is never the only signal; NO_COLOR is honored',
    status: 'active',
  },
  {
    code: 'U7',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'First response arrives within its time budget',
    status: 'active',
  },
  {
    code: 'U8',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'No rule is downloaded at run time',
    status: 'active',
  },
  {
    code: 'V1',
    owner: 'spec-core',
    kind: 'spec-rule',
    meaning: 'Spec core rule V1 (refers to producer sequence numbers)',
    status: 'active',
  },
  {
    code: 'VT1',
    owner: 'tool',
    kind: 'tool-rule',
    meaning:
      'Mirrored classic queue that the target version will stop mirroring',
    enforces: 'T1',
    status: 'active',
  },
  {
    code: 'VT2',
    owner: 'tool',
    kind: 'tool-rule',
    meaning:
      'Quorum queue without dead-letter that gets a default delivery limit on the target version',
    enforces: 'T4',
    status: 'active',
  },
  {
    code: 'VT3',
    owner: 'tool',
    kind: 'tool-rule',
    meaning: 'Deprecated broker features in use',
    status: 'active',
  },
  {
    code: 'VT4',
    owner: 'tool',
    kind: 'tool-rule',
    meaning: 'Nodes in the cluster run different versions',
    status: 'active',
  },
  {
    code: 'Y1',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Unknown key in ocho.yaml',
    status: 'active',
  },
  {
    code: 'Y2',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Wrong type in ocho.yaml',
    status: 'active',
  },
  {
    code: 'Y3',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Required key missing in ocho.yaml',
    status: 'active',
  },
  {
    code: 'Y4',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Flow does not have exactly one target form',
    status: 'active',
  },
  {
    code: 'Y5',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Flow refers to a family that does not exist',
    status: 'active',
  },
  {
    code: 'Y6',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Invalid name template',
    status: 'active',
  },
  {
    code: 'Y7',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Family member contains a reserved character',
    status: 'active',
  },
  {
    code: 'Y8',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Service refers to a flow that does not exist',
    status: 'active',
  },
  {
    code: 'Y9',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Waiver missing reason, by or until',
    status: 'active',
  },
  {
    code: 'Y10',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Waiver expired',
    status: 'active',
  },
  {
    code: 'Y11',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Malformed waiver object',
    status: 'active',
  },
  {
    code: 'Y12',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'spec major differs',
    status: 'active',
  },
  {
    code: 'Y13',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'Two flows claim the same binding',
    status: 'active',
  },
  {
    code: 'Y14',
    owner: 'tool',
    kind: 'diagnostic',
    meaning: 'broker.min_version does not parse',
    status: 'active',
  },
] as const satisfies readonly CodeEntry[];
