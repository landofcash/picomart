import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Interface} from 'ethers';
import {createTempoReceivingContext,createTempoReceivingIdentity,tempoSeedToId} from '@picomart/order-protocol/tempo-protocol';
import {PICOMART_TEMPO_ABI} from '@picomart/order-protocol/tempo-contract';
import {PicomartIdentity} from '../src/auth/identity.ts';
import {TEMPO_CONTRACT_ADDRESS} from '../src/tempo.ts';
import {loadConfig} from '../src/config.ts';
import {aliceId,bobId,seed} from './helpers.ts';
const code=fs.readFileSync(new URL('./fixtures/tempo-runtime.hex',import.meta.url),'utf8').trim();
const abi=new Interface(PICOMART_TEMPO_ABI),key='0x'+'05'.repeat(32);
const identity=createTempoReceivingIdentity(createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:42431,contractAddress:TEMPO_CONTRACT_ADDRESS,role:'seller',account:aliceId,catalogSeed:seed}),Buffer.from(key.slice(2),'hex').toString('base64'));
function rpcFixture(){
  const calls:Array<{method:string;params:any[];init:RequestInit}>=[];
  const state={chain:'0xa5bf',code,seller:aliceId,identityId:identity.identityId,failure:false};
  const transport=(async(url,init)=>{
    assert.equal(String(url),'https://rpc.moderato.tempo.xyz');assert.equal(init?.redirect,'error');
    const req=JSON.parse(init!.body as string);calls.push({...req,init});
    if(state.failure)return new Response('',{status:503});
    const result=req.method==='eth_chainId'?state.chain:req.method==='eth_blockNumber'?'0x2400000':req.method==='eth_getCode'?state.code:abi.encodeFunctionResult('catalogs',[state.seller,key,state.identityId,'https://cdn.picomart.zkbytes.com/test.json']);
    return Response.json({jsonrpc:'2.0',id:req.id,result});
  }) as typeof fetch;
  return {state,calls,service:new PicomartIdentity(loadConfig({}),transport)};
}
test('Tempo account identity uses the nonzero EVM address and rejects inherited aliases without RPC',async()=>{
  const f=rpcFixture();assert.deepEqual(await f.service.account('moderato',aliceId),{accountId:aliceId,signerAddress:aliceId});assert.equal(f.calls.length,0);
  for(const address of ['0.0.1001','alice.eth','0x'+'0'.repeat(40),aliceId.toUpperCase()])await assert.rejects(f.service.account('moderato',address));
  await assert.rejects(f.service.account('mainnet' as any,aliceId),{code:'unsupported_network'});
});
test('ownership checks exact deployed code and current catalog snapshot at one block',async()=>{
  const f=rpcFixture();await f.service.assertCatalogOwner('moderato',seed,aliceId);
  assert.deepEqual(f.calls.map(c=>c.method),['eth_chainId','eth_blockNumber','eth_getCode','eth_call']);
  assert.equal(f.calls[3].params[0].to,TEMPO_CONTRACT_ADDRESS);assert.equal(f.calls[3].params[0].data,abi.encodeFunctionData('catalogs',[tempoSeedToId(seed)]));
  assert.equal(f.calls[2].params[1],f.calls[3].params[1]);
  await assert.rejects(f.service.assertCatalogOwner('moderato',seed,bobId),{code:'catalog_not_owned'});
  f.state.seller='0x'+'0'.repeat(40);await assert.rejects(f.service.assertCatalogOwner('moderato',seed,aliceId),{code:'catalog_not_found'});
});
test('wrong chain/runtime, receiving identity and unavailable RPC cannot prove ownership',async()=>{
  for(const patch of [{chain:'0x1'},{code:'0x6000'},{identityId:'0x'+'00'.repeat(32)},{failure:true}]){
    const f=rpcFixture();Object.assign(f.state,patch);await assert.rejects(f.service.assertCatalogOwner('moderato',seed,aliceId));
  }
});
