/**
 * Regression test for the large-file bsprof fast paths.
 *
 * A real .bsprof can be 600+ MB / 70M+ entries, where a full parse takes minutes.
 * bsprof_info now reads ONLY the header (readHeaderInfo) and analyze/compare cache
 * the parsed profile (getProfile). This test builds a tiny but format-valid .bsprof
 * and asserts that:
 *   1. readHeaderInfo (header-only) reports the same header fields as a full parse.
 *   2. getProfile returns the SAME object instance on a repeat call (cache hit).
 *
 * No device or fixture file is needed — the bytes are synthesized here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseBsprof, buildHeaderInfo } from 'bsprof-cli';
import { readHeaderInfo, getProfile } from '../src/tools/bsprof.js';

/** Unsigned LEB128 varint encoder matching the .bsprof format. */
function varint(value: number | bigint): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v !== 0n) byte |= 0x80;
    out.push(byte);
  } while (v !== 0n);
  return out;
}

function utf8z(s: string): number[] {
  return [...Buffer.from(s, 'utf8'), 0];
}

function float32(n: number): number[] {
  const b = Buffer.alloc(4);
  b.writeFloatLE(n, 0);
  return [...b];
}

/** Build a minimal but valid .bsprof: header + one string + one root path element. */
function buildBsprof(): Buffer {
  // Body after the header: a string-table entry (type 0) and a root path element (type 2).
  // tag for string id 1: (1<<3)|0 = 8 ; then utf8z payload.
  const body: number[] = [
    ...varint(8), ...utf8z('main.brs'),
    // path element id 1, type 2: tag (1<<3)|2 = 10; callingId=0 (root); modId, fileStrId, lineNumber, funcStrId
    ...varint(10), ...varint(0), ...varint(0), ...varint(1), ...varint(1), ...varint(1),
  ];

  // Header fields in parse order, AFTER the 8-byte magic+padding.
  const headerFields: number[] = [
    ...varint(3), ...varint(0), ...varint(0), // major.minor.patch
  ];
  // headerSize is a varint we must back-patch; reserve a fixed 1-byte slot (header < 128 bytes).
  const afterHeaderSize: number[] = [
    ...float32(1.0), ...float32(1.0), // requested/actual sample ratio
    ...varint(1), ...varint(1), // lineSpecificData, memoryOperations (truthy)
    ...varint(0), // timestampStart (vi64)
    ...utf8z('TestApp (dev)'), // targetName
    ...utf8z(''), // supplementalInfo
    ...utf8z('9.9.9999'), // targetVersion
    ...utf8z('Roku'), // deviceVendor
    ...utf8z('TestModel'), // deviceModel
    ...utf8z('TST.000'), // deviceFirmware
  ];

  const magic = [...Buffer.from('bsprof', 'ascii'), 0, 0]; // 6 + 2 padding = offset 8
  // headerSize = total bytes from start of file up to (and including) the header,
  // i.e. where the body begins. Slot is 1 byte, so headerSize occupies index after headerFields.
  const headerSize = magic.length + headerFields.length + 1 + afterHeaderSize.length;
  assert.ok(headerSize < 128, 'header must fit in a single-byte varint for this fixture');

  return Buffer.from([
    ...magic,
    ...headerFields,
    headerSize, // single-byte varint
    ...afterHeaderSize,
    ...body,
  ]);
}

test('readHeaderInfo (header-only) matches a full parse on header fields', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bsprof-'));
  const file = path.join(dir, 'tiny.bsprof');
  writeFileSync(file, buildBsprof());

  const fast = readHeaderInfo(file);
  const full = buildHeaderInfo(parseBsprof(buildBsprof()));

  for (const k of ['targetName', 'targetVersion', 'device', 'firmware', 'formatVersion'] as const) {
    assert.equal(fast[k], full[k], `header field ${k} should match the full parse`);
  }
  assert.equal(fast.device, 'Roku TestModel');
  assert.equal(fast.formatVersion, 'v3.0.0');
  assert.deepEqual(fast.features, ['line-specific-data', 'memory-operations']);
});

test('getProfile caches the parsed profile across repeat calls', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bsprof-'));
  const file = path.join(dir, 'tiny.bsprof');
  writeFileSync(file, buildBsprof());

  const first = getProfile(file);
  const second = getProfile(file);
  assert.equal(first, second, 'second call should return the cached instance');
});
