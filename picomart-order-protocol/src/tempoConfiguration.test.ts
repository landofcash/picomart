import {describe, it, expect} from 'vitest';
import {createTempoAgentProtocol} from './tempoAgent.js';
import fixture from '../fixtures/tempo/agent-order-v2.json';
import {compactCatalogLink, parseCompactCatalogLink, assertTempoChainId} from './tempo.js';

describe('caller supplied network and currency policy',()=>{
  const token={tokenId:'0x1111111111111111111111111111111111111111',name:'Example USD',symbol:'EXUSD',decimals:6};
  const config={chainId:999,contractAddress:'0x2222222222222222222222222222222222222222',apiPath:'/api/v2/example',defaultPaymentToken:token.tokenId,paymentTokens:[token]};
  it('binds quotes to the supplied deployment and rejects a different one',()=>{
    const p=createTempoAgentProtocol(config);
    const q=structuredClone(fixture.resolution.quote);
    Object.assign(q,{network:'eip155:999',picomart:{chainId:999,contractAddress:config.contractAddress}});
    Object.assign(q.payment,{asset:token.tokenId,symbol:token.symbol,name:token.name,payTo:config.contractAddress});
    q.x402.resourcePath=p.agentConfirmPath(q.orderSeed);
    expect(p.AgentQuoteSchema.safeParse(q).success).toBe(true);
    expect(p.AgentQuoteSchema.safeParse(fixture.resolution.quote).success).toBe(false);
    q.payment.symbol='FAKE';
    expect(p.AgentQuoteSchema.safeParse(q).success).toBe(false);
  });
  it('keeps approval links and compact QR profiles bound to supplied settings',()=>{
    const p=createTempoAgentProtocol(config);
    expect(()=>p.parseAgentHandoff('#v=2&chain=42431&deployment='+config.contractAddress+'&orderSeed='+fixture.resolution.quote.orderSeed+'&deliveryKey='+fixture.deliveryKey)).toThrow();
    const seed=fixture.resolution.quote.catalog.seed;
    const url=compactCatalogLink(seed,undefined,'https://example.com','example',{'1':'example'});
    expect(parseCompactCatalogLink(url,{'1':'example'}).network).toBe('example');
    expect(()=>parseCompactCatalogLink(url,{'2':'test'})).toThrow();
    assertTempoChainId(999,999);
    expect(()=>assertTempoChainId(42431,999)).toThrow();
  });
});
