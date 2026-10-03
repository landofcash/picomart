import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {startupDiagnostic} from '../src/startup-diagnostics.ts';
import {StorageError} from '../src/storage/bunny.ts';
import {BuildFailure} from '../src/worker/provider.ts';

test('startup diagnostics identify storage, checkpoint, and nested network failures', () => {
  assert.deepEqual(JSON.parse(startupDiagnostic('journal_replay', new StorageError(401))), {
    event: 'builder_startup_failed', stage: 'journal_replay', type: 'storage', status: 401,
  });
  const checkpoint = JSON.parse(startupDiagnostic('checkpoint_metadata', new BuildFailure('checkpoint_environment_mismatch', false, 'private feedback')));
  assert.equal(checkpoint.code, 'checkpoint_environment_mismatch');
  assert.ok(!JSON.stringify(checkpoint).includes('private feedback'));
  const network = new TypeError('fetch failed: secret URL', {cause: Object.assign(new Error('private host'), {code: 'ENOTFOUND'})});
  assert.equal(JSON.parse(startupDiagnostic('journal_replay', network)).code, 'ENOTFOUND');
});

test('startup diagnostics never serialize private payloads, validation values or arbitrary messages', () => {
  const secret = 'merchant-secret-token';
  const invalid = z.object({}).strict().safeParse({[secret]: secret});
  assert.equal(invalid.success, false);
  const errors = [invalid.error, new SyntaxError(`Invalid JSON: ${secret}`), new Error(`Authorization: Bearer ${secret}`), {token: secret}];
  for (const error of errors) {
    const output = startupDiagnostic('journal_replay', error);
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes('stack'));
  }
  assert.equal(JSON.parse(startupDiagnostic('journal_replay', invalid.error)).issueCodes[0], 'unrecognized_keys');
  assert.equal(JSON.parse(startupDiagnostic('private_storage', new Error('Configure private Bunny zone credentials'))).message, 'Configure private Bunny zone credentials');
});
