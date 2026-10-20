/**
 * Pure helpers added from Playlet device sessions: env-alias config resolution,
 * context-aware error text, deploy source validation, the focus-chain walk,
 * and screenshot target validation. No device needed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

import { hostFromParamsOrEnv, passwordFromParamsOrEnv, friendlyError, resolveConfig } from '../src/roku-config.js';
import { validateDeploySource } from '../src/tools/deploy.js';
import { findFocusPath } from '../src/tools/focus-path.js';
import { resolveScreenshotTarget } from '../src/tools/screenshot.js';

test('host: param, then ROKU_DEVICE_HOST, then ROKU_DEV_TARGET', () => {
  const env = { ROKU_DEVICE_HOST: '10.0.0.1', ROKU_DEV_TARGET: '10.0.0.2' };
  assert.equal(hostFromParamsOrEnv({ host: '10.0.0.9' }, env), '10.0.0.9');
  assert.equal(hostFromParamsOrEnv({}, env), '10.0.0.1');
  assert.equal(hostFromParamsOrEnv({}, { ROKU_DEV_TARGET: '10.0.0.2' }), '10.0.0.2');
  assert.equal(hostFromParamsOrEnv({}, {}), undefined);
});

test('host: empty strings count as unset (unexpanded ${user_config} values)', () => {
  assert.equal(hostFromParamsOrEnv({ host: '' }, { ROKU_DEVICE_HOST: '', ROKU_DEV_TARGET: '10.0.0.2' }), '10.0.0.2');
  assert.equal(hostFromParamsOrEnv({ host: '  ' }, { ROKU_DEVICE_HOST: ' ', ROKU_DEV_TARGET: '' }), undefined);
});

test('password: param, then ROKU_DEVICE_PASSWORD, then ROKU_DEVPASSWORD, ignoring empty strings', () => {
  const env = { ROKU_DEVICE_PASSWORD: 'a', ROKU_DEVPASSWORD: 'b' };
  assert.equal(passwordFromParamsOrEnv({ password: 'p' }, env), 'p');
  assert.equal(passwordFromParamsOrEnv({}, env), 'a');
  assert.equal(passwordFromParamsOrEnv({ password: '' }, { ROKU_DEVICE_PASSWORD: '', ROKU_DEVPASSWORD: 'b' }), 'b');
  assert.equal(passwordFromParamsOrEnv({}, { ROKU_DEVICE_PASSWORD: '' }), undefined);
});

test('resolveConfig: missing password error names both variables', async () => {
  const saved = { p1: process.env.ROKU_DEVICE_PASSWORD, p2: process.env.ROKU_DEVPASSWORD };
  process.env.ROKU_DEVICE_PASSWORD = '';
  process.env.ROKU_DEVPASSWORD = '';
  try {
    await assert.rejects(resolveConfig({ host: '10.0.0.1' }), /ROKU_DEVICE_PASSWORD.*ROKU_DEVPASSWORD/);
  } finally {
    for (const [k, v] of [['ROKU_DEVICE_PASSWORD', saved.p1], ['ROKU_DEVPASSWORD', saved.p2]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('friendlyError: ECP 403 points at Network access = Permissive', () => {
  const err = new Error('Request failed with status code 403');
  const ecp = friendlyError(err, 'ecp');
  assert.match(ecp, /Control by mobile apps/);
  assert.match(ecp, /Permissive/);
  assert.doesNotMatch(ecp, /password/i);
  // The device web server (deploy, screenshot) keeps the password / dev-mode hint.
  assert.match(friendlyError(err, 'device-web'), /Developer Mode/);
  assert.match(friendlyError(err), /Developer Mode/);
  // Other errors are unchanged by the context.
  assert.match(friendlyError(new Error('connect ECONNREFUSED 10.0.0.1:8060'), 'ecp'), /Connection refused/);
});

test('validateDeploySource: exactly one of rootDir and zipPath', () => {
  const zip = path.join(os.tmpdir(), 'app.zip');
  assert.deepEqual(validateDeploySource({ rootDir: '/proj' }), { kind: 'rootDir', rootDir: '/proj' });
  assert.deepEqual(validateDeploySource({ zipPath: zip }), { kind: 'zip', zipPath: zip });
  assert.match((validateDeploySource({ rootDir: '/proj', zipPath: zip }) as { error: string }).error, /not both/);
  assert.match((validateDeploySource({}) as { error: string }).error, /rootDir.*zipPath/);
  assert.match((validateDeploySource({ rootDir: '', zipPath: '' }) as { error: string }).error, /rootDir.*zipPath/);
  // Empty rootDir plus a zip is just the zip.
  assert.deepEqual(validateDeploySource({ rootDir: '', zipPath: zip }), { kind: 'zip', zipPath: zip });
});

test('validateDeploySource: zipPath must be absolute and end in .zip', () => {
  assert.match((validateDeploySource({ zipPath: 'out/app.zip' }) as { error: string }).error, /absolute/);
  assert.match((validateDeploySource({ zipPath: path.join(os.tmpdir(), 'app.pkg') }) as { error: string }).error, /\.zip/);
  assert.equal('kind' in validateDeploySource({ zipPath: path.join(os.tmpdir(), 'APP.ZIP') }), true);
});

const APP_UI = `<app-ui><topscreen><plugin id="dev" name="Playlet"/><screen type="SGScreen" focused="true"><BootstrapScene children="1" extends="Scene" focused="true" focusable="true"><MainScene extends="Group" focused="true"><HomeScreen extends="Group" name="HomeScreen" focused="true" focusable="true"><VideoRowList extends="RowList" name="rowList" focused="true" focusable="true"><RowListItem name="Row" focusable="true" index="0" focused="true"><RowCell extends="Group" focusable="true" index="0" focused="true"/></RowListItem><RowListItem name="Row" index="1" focused="false"><RowCell extends="Group" index="0" focused="true"/></RowListItem></VideoRowList></HomeScreen><NavBar name="NavBar" focused="false"><NavBarComponent index="2" focused="true"/></NavBar></MainScene></BootstrapScene></screen></topscreen></app-ui>`;

test('findFocusPath follows the focus chain to the leaf cell of the focused row', () => {
  // Same parser options as src/tools/ecp.ts.
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(APP_UI);
  const result = findFocusPath(parsed);
  assert.ok(result);
  assert.deepEqual(result.path, [
    'screen',
    'BootstrapScene',
    'MainScene',
    'HomeScreen#HomeScreen',
    'VideoRowList#rowList',
    'RowListItem#Row',
    'RowCell',
  ]);
  // The first row's cell (it has focusable="true"; the second row's cell does not), not the NavBar item.
  assert.equal(result.focused.extends, 'Group');
  assert.equal(result.focused.index, '0');
  assert.equal(result.focused.focusable, 'true');
});

test('findFocusPath looks past unmarked containers (RowListItem > MarkupGrid > RowCell)', () => {
  // Shape seen on a Roku OS 15.3 device: the MarkupGrid inside a RowListItem has no focused flag.
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(
    '<app-ui><topscreen><screen focused="true"><RowList name="rowList" focused="true">' +
      '<RowListItem name="Row" index="0" focused="true"><Label text="Subscriptions"/>' +
      '<MarkupGrid focusItem="0"><RowCell index="0" focused="true"><Label text="t"/></RowCell><RowCell index="1"/></MarkupGrid>' +
      '</RowListItem></RowList></screen></topscreen></app-ui>'
  );
  const result = findFocusPath(parsed);
  assert.ok(result);
  assert.deepEqual(result.path, ['screen', 'RowList#rowList', 'RowListItem#Row', 'RowCell']);
  assert.equal(result.focused.index, '0');
});

test('findFocusPath returns null when nothing is focused', () => {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(
    '<app-ui><topscreen><screen focused="false"><Scene/></screen></topscreen></app-ui>'
  );
  assert.equal(findFocusPath(parsed), null);
});

test('resolveScreenshotTarget resolves outDir and rejects outFile with a path', () => {
  assert.deepEqual(resolveScreenshotTarget({}), { outDir: path.resolve(os.tmpdir()), outFile: undefined });
  assert.deepEqual(resolveScreenshotTarget({ outDir: 'shots', outFile: 'home' }), { outDir: path.resolve('shots'), outFile: 'home' });
  assert.ok('error' in resolveScreenshotTarget({ outDir: '.', outFile: '/private/tmp/home' }));
  assert.ok('error' in resolveScreenshotTarget({ outFile: 'sub/home' }));
  assert.ok('error' in resolveScreenshotTarget({ outFile: 'sub\\home' }));
  assert.ok('error' in resolveScreenshotTarget({ outFile: '..' }));
});
