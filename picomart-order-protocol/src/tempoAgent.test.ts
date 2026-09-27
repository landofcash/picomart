import {describe,it,expect} from 'vitest';
import fixture from '../fixtures/tempo/agent-order-v2.json';
import {AgentProfileSchema,AgentQuoteRequestSchema,AgentQuoteSchema,AgentHandoffSchema,validateAgentResolution,decryptAgentDelivery,encryptAgentDelivery,base64UrlToBytes,parseAgentHandoff,
  encodeAgentPaymentRequired,decodeAgentPaymentRequired,AGENT_CONTRACT} from './tempoAgent.js';
describe('Tempo agent interoperability and private handoff',()=>{
  it('validates the pinned signed cross-package quote and decrypts only with the local key',async()=>{
    const r=await validateAgentResolution(fixture.resolution,AgentProfileSchema.parse(fixture.profile),1700000001);
    expect(await decryptAgentDelivery(r.encryptedDelivery,r.quote.orderSeed,base64UrlToBytes(fixture.deliveryKey))).toEqual(fixture.delivery);
    expect(await encryptAgentDelivery(fixture.delivery,r.quote.orderSeed,base64UrlToBytes(fixture.deliveryKey),new Uint8Array(12).fill(2))).toEqual(fixture.request.encryptedDelivery);
    expect(decodeAgentPaymentRequired(encodeAgentPaymentRequired(r.paymentRequired))).toEqual(r.paymentRequired);
  });
  it('rejects keys/plaintext in quote requests and inherited network/asset/deployment formats',()=>{
    for(const extra of [{deliveryKey:fixture.deliveryKey},{delivery:fixture.delivery},{version:1}])expect(()=>AgentQuoteRequestSchema.parse({...fixture.request,...extra})).toThrow();
    for(const change of [{network:'hedera:testnet'},{picomart:{chainId:1,contractAddress:AGENT_CONTRACT}},{payment:{...fixture.resolution.quote.payment,asset:'0x20c0000000000000000000000000000000000001'}}])expect(()=>AgentQuoteSchema.parse({...fixture.resolution.quote,...change})).toThrow();
  });
  it('rejects expiry, untrusted keys, tampered signatures and modified commitments',async()=>{
    const profile=AgentProfileSchema.parse(fixture.profile);
    await expect(validateAgentResolution(fixture.resolution,profile,1700000600)).rejects.toThrow();
    await expect(validateAgentResolution(fixture.resolution,{...profile,trustedQuoteKeys:[{kid:'other',publicKey:profile.trustedQuoteKeys[0].publicKey}]},1700000001)).rejects.toThrow();
    for(const modify of [(r:any)=>r.quote.items[0].name='changed',(r:any)=>r.quoteJws=r.quoteJws.slice(0,-3)+'xxx',(r:any)=>r.encryptedDelivery.ciphertext='AAAA',(r:any)=>r.paymentRequired.resource.url='https://evil.example/confirm']){
      const r=structuredClone(fixture.resolution);modify(r);await expect(validateAgentResolution(r,profile,1700000001)).rejects.toThrow();}
  });
  it('rejects wrong delivery keys and cross-order ciphertext replay',async()=>{
    await expect(decryptAgentDelivery(AgentQuoteRequestSchema.parse(fixture.request).encryptedDelivery,fixture.request.orderSeed,new Uint8Array(32).fill(9))).rejects.toThrow();
    await expect(decryptAgentDelivery(AgentQuoteRequestSchema.parse(fixture.request).encryptedDelivery,fixture.request.catalogSeed,base64UrlToBytes(fixture.deliveryKey))).rejects.toThrow();
  });
  it('binds fragments to the deployment and rejects duplicate or unknown parameters',()=>{
    const fragment='#'+new URLSearchParams({v:'2',chain:'42431',deployment:AGENT_CONTRACT,orderSeed:fixture.request.orderSeed,deliveryKey:fixture.deliveryKey});
    expect(parseAgentHandoff(fragment)).toEqual(AgentHandoffSchema.parse({version:2,chainId:42431,contractAddress:AGENT_CONTRACT,orderSeed:fixture.request.orderSeed,deliveryKey:fixture.deliveryKey}));
    for(const hash of [fragment+'&deliveryKey='+fixture.deliveryKey,fragment+'&network=testnet',fragment.replace('42431','1')])expect(()=>parseAgentHandoff(hash)).toThrow();
  });
});
