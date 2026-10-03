import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RailwayProvider} from '../src/worker/provider.ts';

test('moving the hosted builder preserves sandbox scope and reconciliation ownership', async () => {
  const sandboxEnvironment = 'f38b8724-44d7-4e13-aecf-af0407339f60';
  const production = '6e115024-b8a5-4ff0-826b-f6e5a0f32a16';
  const env = {RAILWAY_API_TOKEN: 'test-token', RAILWAY_SANDBOX_ENVIRONMENT_ID: sandboxEnvironment, RAILWAY_ENVIRONMENT_ID: sandboxEnvironment};
  const before = new RailwayProvider('same-prefix', env);
  const after = new RailwayProvider('same-prefix', {...env, RAILWAY_ENVIRONMENT_ID: production}, async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).variables.environmentId, sandboxEnvironment);
    return Response.json({data: {sandboxes: {pageInfo: {hasNextPage: false, endCursor: null}, edges: []}}});
  });
  assert.equal(after.owner, before.owner);
  assert.deepEqual(await after.inventory(), []);
});

test('configured sandbox environments determine inventory requests and reconciliation ownership', async () => {
  const environmentId = '6e115024-b8a5-4ff0-826b-f6e5a0f32a16';
  const env = {RAILWAY_API_TOKEN: 'test-token', RAILWAY_SANDBOX_ENVIRONMENT_ID: environmentId};
  const provider = new RailwayProvider('same-prefix', env, async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).variables.environmentId, environmentId);
    assert.equal(new Headers(init?.headers).get('Project-Access-Token'), 'test-token');
    return Response.json({data: {sandboxes: {pageInfo: {hasNextPage: false, endCursor: null}, edges: []}}});
  });
  assert.deepEqual(await provider.inventory(), []);
  assert.notEqual(provider.owner, new RailwayProvider('same-prefix', {...env, RAILWAY_SANDBOX_ENVIRONMENT_ID: 'f38b8724-44d7-4e13-aecf-af0407339f60'}).owner);
});

test('missing or invalid sandbox scope never falls back to the hosting environment', () => {
  for (const value of [undefined, '', 'not-a-uuid']) {
    assert.throws(() => new RailwayProvider('prefix', {RAILWAY_API_TOKEN: 'test-token',
      RAILWAY_ENVIRONMENT_ID: '6e115024-b8a5-4ff0-826b-f6e5a0f32a16', RAILWAY_SANDBOX_ENVIRONMENT_ID: value}), /RAILWAY_SANDBOX_ENVIRONMENT_ID/);
  }
});

test('inventory refuses sandbox records from a different environment', async () => {
  const provider = new RailwayProvider('prefix', {RAILWAY_API_TOKEN: 'test-token',
    RAILWAY_SANDBOX_ENVIRONMENT_ID: '6e115024-b8a5-4ff0-826b-f6e5a0f32a16'}, async () => Response.json({data: {sandboxes: {
      pageInfo: {hasNextPage: false, endCursor: null}, edges: [{node: {id: '11111111-1111-4111-8111-111111111111',
        environmentId: 'f38b8724-44d7-4e13-aecf-af0407339f60', status: 'RUNNING', createdAt: new Date().toISOString()}}],
    }}}));
  await assert.rejects(provider.inventory());
});
