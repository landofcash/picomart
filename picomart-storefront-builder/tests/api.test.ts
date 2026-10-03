import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {alice, aliceId, bob, bobId, design, fixture, origin, otherSeed, seed} from './helpers.ts';

test('management requests are gated until coordinator startup reconciliation completes', async () => {
  let ready = false; const f = await fixture(undefined, undefined, undefined, () => ready);
  try {
    assert.equal((await f.request('/auth/challenge', {method: 'POST', body: {accountId: aliceId}})).body.error, 'coordinator_recovering');
    assert.equal(f.journal.list('challenge', () => true).length, 0);
    ready = true; assert.equal((await f.request('/auth/challenge', {method: 'POST', body: {accountId: aliceId}})).status, 201);
  } finally { await f.close(); }
});

test('signed challenges bind account/network/origin, expire and are single-use; sessions revoke and detect key rotation', async () => {
  const f = await fixture();
  try {
    const challenge = (await f.request('/auth/challenge', {method: 'POST', body: {accountId: aliceId}})).body.data;
    assert.match(challenge.message, /Origin: http:\/\/localhost:5173/);
    assert.match(challenge.message, /Network: moderato/);
    const body = {accountId: aliceId, challengeId: challenge.challengeId, signature: await alice.signMessage(challenge.message)};
    assert.equal((await f.request('/auth/verify', {method: 'POST', body: {...body, signature: await bob.signMessage(challenge.message)}})).status, 401);
    assert.equal((await f.request('/auth/verify', {method: 'POST', body: {...body, accountId: bobId}})).status, 401);
    assert.equal((await f.request('/auth/verify', {method: 'POST', body, origin: 'http://localhost:5174'})).status, 401);
    assert.equal((await f.request('/auth/verify', {method: 'POST', body, network: 'mainnet'})).status, 400);
    const verified = await Promise.all([f.request('/auth/verify', {method: 'POST', body}), f.request('/auth/verify', {method: 'POST', body})]);
    assert.deepEqual(verified.map(value => value.status).sort(), [200, 401]);
    const token = verified.find(value => value.status === 200)!.body.data.token;
    assert.equal((await f.request('/auth/session', {token})).body.data.accountId, aliceId);
    assert.equal((await f.request('/auth/session', {token, origin: 'http://localhost:5174'})).status, 401);
    assert.equal((await f.request('/auth/session', {token, origin: 'https://attacker.example'})).status, 403);
    assert.equal((await f.request('/auth/session', {token, network: 'mainnet'})).status, 400);
    for (const bytes of f.store.files.values()) assert.equal(bytes.toString().includes(token), false, 'Bearer tokens must never be persisted');
    f.identity.accounts.set(`moderato/${aliceId}`, bob.address.toLowerCase());
    assert.equal((await f.request('/auth/session', {token})).body.error, 'account_key_changed');
    f.identity.accounts.set(`moderato/${aliceId}`, alice.address.toLowerCase());
    assert.equal((await f.request('/auth/logout', {method: 'POST', token})).status, 200);
    assert.equal((await f.request('/auth/session', {token})).status, 401);
    const expiring = (await f.request('/auth/challenge', {method: 'POST', body: {accountId: aliceId}})).body.data;
    f.clock.value += f.config.challengeTtl;
    assert.equal((await f.request('/auth/verify', {method: 'POST', body: {accountId: aliceId, challengeId: expiring.challengeId, signature: await alice.signMessage(expiring.message)}})).status, 401);
    const expiringToken = await f.login(); f.clock.value += f.config.sessionTtl;
    assert.equal((await f.request('/shops', {token: expiringToken})).status, 401);
  } finally { await f.close(); }
});

test('shop/job APIs enforce ownership, retry identity, optimistic versions and durable snapshots across restart', async () => {
  let f = await fixture();
  try {
    const token = await f.login(), otherToken = await f.login(bobId, bob);
    assert.equal((await f.request('/shops')).status, 401);
    assert.equal((await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: otherSeed, design}})).status, 403);
    assert.equal((await f.request('/shops', {method: 'POST', token, body: {catalogSeed: seed, design}})).status, 400);
    const requestId = randomUUID(), createOptions = {method: 'POST', token, requestId, body: {catalogSeed: seed, design}};
    const creates = await Promise.all([f.request('/shops', createOptions), f.request('/shops', createOptions)]);
    assert.deepEqual(creates.map(value => value.status), [201, 201]);
    const shop = creates[0].body.data; assert.deepEqual(shop, creates[1].body.data);
    assert.equal(shop.config.shopId, shop.id);
    assert.equal((await f.request('/shops', {token})).body.data.length, 1);
    const otherShop = (await f.request('/shops', {method: 'POST', token: otherToken, requestId: randomUUID(), body: {catalogSeed: otherSeed, design}})).body.data;
    assert.deepEqual((await f.request('/shops', {token: otherToken})).body.data.map((value: {id: string}) => value.id), [otherShop.id]);
    assert.equal((await f.request(`/shops/${otherShop.id}`, {token})).status, 404);
    assert.equal((await f.request('/shops', {...createOptions, body: {catalogSeed: seed, design: {...design, branding: {...design.branding, name: 'Different'}}}})).status, 409);
    for (const path of [`/shops/${shop.id}`, `/shops/${shop.id}/jobs`, `/shops/${shop.id}/revisions`]) assert.equal((await f.request(path, {token: otherToken})).status, 404);
    assert.equal((await f.request(`/shops/${shop.id}`, {method: 'PATCH', token: otherToken, requestId: randomUUID(), body: {expectedVersion: 1, design}})).status, 404);
    assert.equal((await f.request(`/shops/${shop.id}`, {method: 'PATCH', token, requestId: randomUUID(), body: {expectedVersion: 1, design, ownerAccountId: bobId}})).status, 400);
    const jobOptions = {method: 'POST', token, requestId: randomUUID(), body: {expectedShopVersion: 1, brief: 'Make a calm shop'}};
    const jobs = await Promise.all([f.request(`/shops/${shop.id}/jobs`, jobOptions), f.request(`/shops/${shop.id}/jobs`, jobOptions)]);
    assert.deepEqual(jobs.map(value => value.status), [202, 202]);
    const job = jobs[0].body.data; assert.deepEqual(job, jobs[1].body.data); assert.equal(job.state, 'queued');
    const edit = {...design, branding: {...design.branding, name: 'Revised shop'}};
    const updates = await Promise.all([1, 2].map(() => f.request(`/shops/${shop.id}`, {method: 'PATCH', token, requestId: randomUUID(), body: {expectedVersion: 2, design: edit}})));
    assert.deepEqual(updates.map(value => value.status).sort(), [200, 409]);
    assert.equal((await f.request(`/shops/${shop.id}/jobs/${job.id}`, {token})).body.data.config.branding.name, design.branding.name);
    assert.equal((await f.request(`/shops/${shop.id}/jobs/${job.id}`, {token: otherToken})).status, 404);
    assert.equal((await f.request(`/shops/${shop.id}/jobs`, {method: 'POST', token, requestId: randomUUID(), body: {expectedShopVersion: 3, brief: 'Update', baseRevisionId: randomUUID()}})).status, 404);
    f.identity.catalogs.set(`moderato/${seed}`, bobId);
    assert.equal((await f.request(`/shops/${shop.id}`, {method: 'PATCH', token, requestId: randomUUID(), body: {expectedVersion: 2, design}})).status, 403);
    assert.equal((await f.request(`/shops/${shop.id}/jobs`, {method: 'POST', token, requestId: randomUUID(), body: {expectedShopVersion: 2, brief: 'Update'}})).status, 403);
    f.identity.catalogs.set(`moderato/${seed}`, aliceId);
    await f.close(); f = await fixture(f.store, f.identity, f.clock);
    assert.equal((await f.request('/auth/session', {token})).status, 200);
    assert.equal((await f.request('/shops', createOptions)).body.data.id, shop.id);
    assert.equal((await f.request(`/shops/${shop.id}`, {token})).body.data.recordVersion, 3);
    assert.equal((await f.request(`/shops/${shop.id}/jobs`, jobOptions)).body.data.id, job.id);
    assert.equal((await f.request(`/shops/${shop.id}/jobs`, {token})).body.data.length, 1);
    assert.equal((await f.request(`/shops/${shop.id}/revisions`, {token})).body.data.length, 0);
    assert.equal((await f.request('/shops', {token})).headers.get('Cache-Control'), 'no-store');
  } finally { await f.close(); }
});

test('origin, account syntax, JSON limits and absence of private artifact routes', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/auth/challenge', {method: 'POST', body: {accountId: '../../secrets'}})).status, 400);
    assert.equal((await f.request('/auth/challenge', {method: 'POST', body: {accountId: '0.0.001'}})).status, 400);
    assert.equal((await f.request('/auth/challenge', {method: 'POST', origin: '', body: {accountId: aliceId}})).status, 403);
    const token = await f.login();
    assert.equal((await f.request('/shops', {method: 'POST', token, body: {huge: 'x'.repeat(140000)}})).status, 413);
    assert.equal((await f.request('/source.tar.gz', {token})).status, 404);
    assert.equal((await f.request('/shops', {method: 'POST', token, requestId: randomUUID(), body: {catalogSeed: seed, design: {...design, shopId: randomUUID()}}})).status, 400);
  } finally { await f.close(); }
});
