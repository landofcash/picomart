import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import fixture from '@picomart/order-protocol/fixtures/tempo/agent-order-v2.json';
import {AgentProfileSchema,AgentHandoffSchema,AgentQuoteSchema} from '../../agentProtocol.js';
import {resolveTempoAgent,executeTempoAgentOrder} from './tempoAgentClient';
const mocks=vi.hoisted(()=>({assertProfile:vi.fn(),marketApi:vi.fn(),fetchCatalogProducts:vi.fn(),prepareCheckout:vi.fn(),submitCheckout:vi.fn(),assertRevision:vi.fn(),extraCheckout:false}));
vi.mock('@picomart/config',async importOriginal=>{
  const actual=await importOriginal<typeof import('@picomart/config')>();
  return {...actual,isPaymentCurrency:(token:unknown)=>actual.isPaymentCurrency(token)||mocks.extraCheckout&&token==='0x20c0000000000000000000000000000000000001'};
});
vi.mock('./tempoAgentProfile',()=>({assertCurrentAgentProfile:mocks.assertProfile,installedAgentProfile:()=>fixture.profile}));
vi.mock('@/lib/tempoMarket',()=>({...mocks,PATH_USD:'0x20c0000000000000000000000000000000000000',TEMPO_MARKET_ENABLED:true}));
vi.mock('@/lib/internalWallet/providers/tempoInternalWalletProvider',()=>({tempoWalletRevision:()=>1,assertTempoWalletRevision:mocks.assertRevision}));
const handoff=AgentHandoffSchema.parse({version:2,chainId:42431,contractAddress:fixture.profile.contractAddress,orderSeed:fixture.request.orderSeed,deliveryKey:fixture.deliveryKey}),profile=AgentProfileSchema.parse(fixture.profile);
beforeEach(()=>{vi.resetAllMocks();mocks.extraCheckout=false;vi.useFakeTimers();vi.setSystemTime(1700000001000);});afterEach(()=>vi.useRealTimers());
describe('Tempo browser approval boundary',()=>{
  it('uses the quoted extra checkout currency and rejects mismatched product tokens',async()=>{
    mocks.extraCheckout=true;
    const q=structuredClone(fixture.resolution.quote) as ReturnType<typeof AgentQuoteSchema.parse>;
    q.payment.asset='0x20c0000000000000000000000000000000000001';
    mocks.marketApi.mockResolvedValue({catalog:{seller:q.catalog.sellerEvmAddress,sellerPublicKey:q.catalog.sellerPublicKey,sellerIdentityId:q.catalog.sellerIdentityId,catalogUrl:q.catalog.catalogUrl}});
    const product={ProductId:q.items[0].productId,Name:q.items[0].name,Price:q.items[0].unitAmount,PriceToken:q.payment.asset};
    mocks.fetchCatalogProducts.mockResolvedValue([product]);mocks.prepareCheckout.mockResolvedValue({});mocks.submitCheckout.mockResolvedValue({hash:'0x'+'ab'.repeat(32)});
    const intent={quote:q,delivery:fixture.delivery,trustedProfile:profile};
    await executeTempoAgentOrder(intent,{} as never);
    expect(mocks.prepareCheckout.mock.calls[0][1].products[0].PriceToken).toBe(q.payment.asset);
    mocks.prepareCheckout.mockClear();mocks.submitCheckout.mockClear();
    mocks.fetchCatalogProducts.mockResolvedValue([{...product,PriceToken:fixture.resolution.quote.payment.asset}]);
    await expect(executeTempoAgentOrder(intent,{} as never)).rejects.toThrow('Product terms changed');
    expect(mocks.prepareCheckout).not.toHaveBeenCalled();expect(mocks.submitCheckout).not.toHaveBeenCalled();
    mocks.extraCheckout=false;
    await expect(executeTempoAgentOrder(intent,{} as never)).rejects.toThrow('Unsupported quoted payment currency');
  });
  it('stops payment if trust settings change during preparation',async()=>{
    const q=AgentQuoteSchema.parse(fixture.resolution.quote);
    mocks.marketApi.mockResolvedValue({catalog:{seed:q.catalog.seed,seller:q.catalog.sellerEvmAddress,sellerPublicKey:q.catalog.sellerPublicKey,sellerIdentityId:q.catalog.sellerIdentityId,catalogUrl:q.catalog.catalogUrl}});
    mocks.fetchCatalogProducts.mockResolvedValue([{ProductId:q.items[0].productId,Name:q.items[0].name,Price:q.items[0].unitAmount,PriceToken:q.payment.asset}]);
    mocks.prepareCheckout.mockImplementation(async()=>{mocks.assertProfile.mockImplementation(()=>{throw new Error('Trust settings changed');});return {};});
    await expect(executeTempoAgentOrder({quote:q,delivery:fixture.delivery,trustedProfile:profile},{} as never)).rejects.toThrow('Trust settings changed');
    expect(mocks.submitCheckout).not.toHaveBeenCalled();
  });
  it('verifies the shared signed quote and decrypts delivery without sending the key',async()=>{
    const fetcher=vi.fn<(url:unknown,init?:RequestInit)=>Promise<Response>>(async()=>Response.json(fixture.resolution));const intent=await resolveTempoAgent(handoff,profile,fetcher as typeof fetch);
    expect(intent.delivery).toEqual(fixture.delivery);expect(String(fetcher.mock.calls[0][1]?.body)).not.toContain(fixture.deliveryKey);
  });
  it('rejects cross-order handoff and private delivery key tampering',async()=>{
    const fetcher=async()=>Response.json(fixture.resolution);
    await expect(resolveTempoAgent({...handoff,orderSeed:fixture.request.catalogSeed},profile,fetcher)).rejects.toThrow();
    await expect(resolveTempoAgent({...handoff,deliveryKey:'CQ'.repeat(21)+'k'},profile,fetcher)).rejects.toThrow();
  });
  it('uses the quoted public order ID and encrypted Tempo checkout, with an expiry guard before every signature',async()=>{
    const q=AgentQuoteSchema.parse(fixture.resolution.quote),catalog={seed:q.catalog.seed,catalogId:'0x'+'01'.repeat(16),seller:q.catalog.sellerEvmAddress,sellerPublicKey:q.catalog.sellerPublicKey,sellerIdentityId:q.catalog.sellerIdentityId,catalogUrl:q.catalog.catalogUrl};
    mocks.marketApi.mockResolvedValue({catalog});mocks.fetchCatalogProducts.mockResolvedValue([{ProductId:q.items[0].productId,Name:q.items[0].name,Price:q.items[0].unitAmount,PriceToken:q.payment.asset,Description:'Test',Image:''}]);
    mocks.prepareCheckout.mockResolvedValue({});mocks.submitCheckout.mockResolvedValue({hash:'0x'+'ab'.repeat(32)});
    const intent={quote:q,delivery:fixture.delivery,trustedProfile:profile};expect(await executeTempoAgentOrder(intent,{} as never)).toBe('0x'+'ab'.repeat(32));
    expect(mocks.prepareCheckout.mock.calls[0][3]).toBe('0x'+'02'.repeat(16));const guard=mocks.submitCheckout.mock.calls[0][5];vi.setSystemTime(1700000550000);expect(()=>guard()).toThrow();
  });
  it('rejects changed catalog ownership or product prices before preparing private storage',async()=>{
    const q=AgentQuoteSchema.parse(fixture.resolution.quote);mocks.marketApi.mockResolvedValue({catalog:{seller:'0x'+'99'.repeat(20)}});
    await expect(executeTempoAgentOrder({quote:q,delivery:fixture.delivery,trustedProfile:profile},{} as never)).rejects.toThrow('catalog changed');expect(mocks.prepareCheckout).not.toHaveBeenCalled();
    mocks.marketApi.mockResolvedValue({catalog:{seller:q.catalog.sellerEvmAddress,sellerPublicKey:q.catalog.sellerPublicKey,sellerIdentityId:q.catalog.sellerIdentityId,catalogUrl:q.catalog.catalogUrl}});
    mocks.fetchCatalogProducts.mockResolvedValue([{ProductId:q.items[0].productId,Name:q.items[0].name,Price:'1',PriceToken:q.payment.asset}]);
    await expect(executeTempoAgentOrder({quote:q,delivery:fixture.delivery,trustedProfile:profile},{} as never)).rejects.toThrow('Product terms changed');expect(mocks.prepareCheckout).not.toHaveBeenCalled();
  });
});
