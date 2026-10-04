import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Sandbox} from 'railway';
import {Attempt} from '../src/railway.ts';
test('an expired attempt aborts transport work but cleanup remains permitted',async()=>{
  let calls=0;
  const attempt=new Attempt('test',{environmentId:'test-environment',fetch:async()=>{calls++;return new Response('{}');}});
  attempt.persist=async()=>{};
  let destroyed=false;
  attempt.sandbox={destroy:async()=>{await attempt.options.fetch!('https://example.test/cleanup');destroyed=true;},refresh:async()=>{},status:'DESTROYED'} as unknown as Sandbox;
  attempt.expire();assert.equal(attempt.signal.aborted,true);
  await assert.rejects(attempt.options.fetch!('https://example.test/work'),/deadline/);assert.equal(calls,0);
  await attempt.destroy();assert.equal(destroyed,true);assert.equal(attempt.record.cleanup,'destroyed');assert.equal(calls,1);
});
test('cleanup failures remain recorded and cannot masquerade as confirmed destruction',async()=>{
  const attempt=new Attempt('test',{environmentId:'test-environment'});attempt.persist=async()=>{};
  attempt.sandbox={destroy:async()=>{throw new Error('provider unavailable');}} as unknown as Sandbox;
  await attempt.destroy();assert.equal(attempt.record.cleanup,'failed');assert.match(attempt.record.error!,/provider unavailable/);
});
