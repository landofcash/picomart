import {beforeEach,describe,expect,it,vi} from 'vitest';
import {hexlify,keccak256,toUtf8Bytes} from 'ethers';
import {createTempoReceivingIdentity,tempoIdToSeed,canonicalJson,createTempoMessageBinding,tempoReferenceCommitment} from '@picomart/order-protocol/tempo-protocol';
import {marketAddress,receivingContext,catalogLink,parseCatalogLink,validateProducts,validateSelection,catalogs,
  fetchCatalogProducts,checkoutIntent,prepareCheckout,loadCheckout,submitCheckout,submitBuiltinCheckout,TEMPO_MARKET_DEPLOYMENT,PATH_USD,
  authenticateOrder,verifyOrderTerms,marketInterface,type MarketOrder,type CheckoutSelection,type MarketCatalog} from './tempoMarket';
import type {WalletAdapter} from '@/context/wallet/types';
import type {TempoPaymentQuote} from './internalWallet/tempoTransactions';

const state=vi.hoisted(()=>({db:new Map<string,unknown>(),revision:1,readCatalog:vi.fn(),receipt:vi.fn(),order:vi.fn(),fetch:vi.fn(),prepare:vi.fn(),resume:vi.fn(),send:vi.fn(),approve:vi.fn(),pay:vi.fn(),autoPay:vi.fn(),recoverOperation:vi.fn()}));
vi.mock('idb-keyval',()=>({get:async(key:string)=>structuredClone(state.db.get(key)),set:async(key:string,value:unknown)=>{state.db.set(key,structuredClone(value));}}));
vi.mock('./tempoDeployment',()=>({TEMPO_UI_DEPLOYMENT:{address:'0x3c91183f0454eab6eff6f570ac402be278dbd6f4',block:37694566},TEMPO_UI_ENABLED:true}));
vi.mock('@picomart/order-protocol/tempo-contract',async load=>{
  const actual=await load<typeof import('@picomart/order-protocol/tempo-contract')>();const {keccak256:hash}=await import('ethers');
  return {...actual,PICOMART_TEMPO_BUILD:{...actual.PICOMART_TEMPO_BUILD,runtimeBytecodeHash:hash('0x6000')}};
});
vi.mock('ethers',async load=>{
  const actual=await load<typeof import('ethers')>();
  return {...actual,JsonRpcProvider:class {send=async()=> '0xa5bf';getCode=async()=> '0x6000';getTransactionReceipt=state.receipt;},Contract:class {catalogs=state.readCatalog;getOrder=state.order;}};
});
vi.mock('./internalWallet/providers/tempoInternalWalletProvider',()=>({
  createTempoWalletTransactions:()=>({sendContract:state.send,approvePayment:state.approve,payOrder:state.pay,payOrderAutomatically:state.autoPay,recoverOperation:state.recoverOperation}),
  tempoWalletRevision:()=>state.revision,assertTempoWalletRevision:(revision:number)=>{if(revision!==state.revision)throw new Error('Wallet changed.');},
}));
vi.mock('./internalWallet/tempoRecoveryProof',()=>({configuredProofClient:()=>({apiOrigin:'https://api.example.test',downloadOrigin:'https://download.example.test'})}));
vi.mock('./internalWallet/tempoCommerce',async()=>{
  const protocol=await import('@picomart/order-protocol/tempo-protocol');
  return {createTempoCommerceService:()=>({receivingIdentity:async(_wallet:unknown,context:Parameters<typeof protocol.createTempoReceivingIdentity>[0])=>protocol.createTempoReceivingIdentity(context,Buffer.alloc(32,9).toString('base64')),
    prepare:state.prepare,resumeUpload:state.resume})};
});
const seller='0x'+'11'.repeat(20),buyer='0x'+'22'.repeat(20),id='0x'+'03'.repeat(16),catalogId='0x'+'04'.repeat(16);
const identity=createTempoReceivingIdentity(receivingContext('seller',seller,tempoIdToSeed(catalogId)),Buffer.alloc(32,8).toString('base64'));
const catalog:MarketCatalog={catalogId,seed:tempoIdToSeed(catalogId),seller,sellerPublicKey:hexlify(Buffer.alloc(32,8)),sellerIdentityId:identity.identityId,catalogUrl:'https://cdn.picomart.zkbytes.com/test.json'};
const product={ProductId:'one',Name:'Product',Description:'Public description',Image:'https://cdn.picomart.zkbytes.com/one.png',PriceToken:PATH_USD,Price:'10000'};
const selection:CheckoutSelection={catalog,products:[{...product,quantity:2}]};
const wallet={getAddress:async()=>buyer} as WalletAdapter;
const delivery={fullName:'Private Buyer',address:'Private Street',city:'Lisbon',postalCode:'1000',country:'PT',phone:'',email:'',noPhysicalDelivery:true};
const response=(data:unknown)=>({ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)}) as Response;
beforeEach(()=>{
  vi.clearAllMocks();state.db.clear();state.revision=1;
  vi.stubGlobal('fetch',state.fetch);
  let lock=Promise.resolve();vi.stubGlobal('navigator',{locks:{request:async(_key:string,action:()=>Promise<unknown>)=>{const previous=lock;let release!:()=>void;lock=new Promise<void>(resolve=>{release=resolve;});await previous;try{return await action();}finally{release();}}}});
  state.readCatalog.mockResolvedValue({...catalog,catalogUrl:catalog.catalogUrl});
  state.fetch.mockResolvedValue(response([product]));state.prepare.mockResolvedValue({state:'prepared'});
  state.resume.mockResolvedValue({ready:true,state:'active',expiresAt:new Date(Date.now()+30*86400_000-1000).toISOString(),buyerEnvelope:'buyer-ciphertext',sellerEnvelope:'seller-ciphertext'});
  state.recoverOperation.mockResolvedValue(null);
  state.autoPay.mockResolvedValue({hash:'payment',state:'confirmed'});state.pay.mockResolvedValue({hash:'payment',state:'confirmed'});state.send.mockResolvedValue({hash:'initial',state:'confirmed'});state.approve.mockResolvedValue({hash:'approval',state:'confirmed'});
});
describe('Tempo commerce UI boundary',()=>{
  it('passes the reviewed fee quote to automatic checkout and validates references, terms and consent before signing',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    const quote={maximumFee:'120'} as TempoPaymentQuote,guard=vi.fn();
    await submitBuiltinCheckout(wallet,draft,selection,quote,undefined,guard);
    expect(state.autoPay).toHaveBeenCalledOnce();expect(state.pay).not.toHaveBeenCalled();expect(state.approve).not.toHaveBeenCalled();
    const [call,reviewed,options]=state.autoPay.mock.calls[0];
    expect(call.method).toBe('createOrderPaid');expect(reviewed).toBe(quote);
    await options.beforeSign();expect(guard).toHaveBeenCalledTimes(2);
    state.fetch.mockResolvedValue(response([{...product,Price:'10001'}]));
    await expect(options.beforeSign()).rejects.toThrow(/price changed/);
  });
  it('compact catalog links select the configured profile without chain or contract fields',()=>{
    const productId=tempoIdToSeed(id),link=catalogLink(catalog.seed,productId,'http://localhost:5173');
    expect(link).toBe('http://localhost:5173/#'+catalog.seed+productId+'2');
    expect(new URL(link).hash.slice(1)).toHaveLength(45);
    expect(parseCatalogLink(link)).toEqual({seed:catalog.seed,productId});
    const catalogOnly=catalogLink(catalog.seed);
    expect(new URL(catalogOnly).hash.slice(1)).toHaveLength(23);
    expect(parseCatalogLink(catalogOnly)).toEqual({seed:catalog.seed,productId:null});
    for(const bad of [link.slice(0,-1)+'1',link.slice(0,-1)+'9',link.slice(0,-1),link+'2',
      'https://example.test/#old-qr','https://example.test/catalog?v=1&catalog='+catalog.seed,
      'https://example.test/#'+'A'.repeat(22)+productId+'2'])expect(()=>parseCatalogLink(bad)).toThrow();
    expect(()=>catalogLink(catalog.seed,'item with spaces')).toThrow();
  });
  it('rejects aliases, zero addresses, duplicate products, unsafe numeric amounts and other tokens',()=>{
    expect(marketAddress(buyer.toUpperCase().replace('0X','0x'))).toBe(buyer);
    for(const bad of ['0.0.1','0x'+'00'.repeat(20),'some.eth'])expect(()=>marketAddress(bad)).toThrow();
    expect(()=>validateProducts([product,product])).toThrow();
    expect(()=>validateProducts([{...product,Price:Number.MAX_SAFE_INTEGER+1}])).toThrow();
    expect(()=>validateProducts([{...product,PriceToken:'0x1111111111111111111111111111111111111111'}])).toThrow();
    expect(validateSelection(selection).amount).toBe(20000n);
    expect(()=>validateSelection({...selection,products:[{...product,quantity:1.5}]})).toThrow();
  });
  it('uses each configured catalog token and rejects mixed-token orders',()=>{
    const alpha={...product,ProductId:'alpha',PriceToken:'0x20c0000000000000000000000000000000000001',quantity:2};
    expect(validateSelection({...selection,products:[alpha]})).toMatchObject({token:alpha.PriceToken,amount:20000n});
    expect(()=>validateSelection({...selection,products:[alpha,{...product,quantity:1}]})).toThrow('one payment currency');
  });
  it('checks response deployment and CDN origin; rejects redirects and missing history',async()=>{
    await expect(fetchCatalogProducts('https://evil.test/catalog.json')).rejects.toThrow(/CDN/);
    expect(state.fetch).not.toHaveBeenCalled();
    await fetchCatalogProducts(catalog.catalogUrl);expect(state.fetch.mock.calls[0][1].redirect).toBe('error');
    state.fetch.mockResolvedValue(response({success:true,data:{chainId:1,address:TEMPO_MARKET_DEPLOYMENT.address,throughBlock:1,catalogs:[]}}));
    await expect(catalogs()).rejects.toThrow(/chain or deployment/);
    state.fetch.mockResolvedValue({ok:false,status:503});await expect(catalogs()).rejects.toThrow(/catching up/);
  });
  it('verifies content-hashed catalog revisions before accepting public product terms',async()=>{
    const bytes=new TextEncoder().encode(JSON.stringify([product]));
    const hash=hexlify(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).slice(2);
    const url=`https://cdn.picomart.zkbytes.com/moderato/v1/${seller}/catalogs/${hash}.json`;
    await expect(fetchCatalogProducts(url)).resolves.toHaveLength(1);
    state.fetch.mockResolvedValue(response([{...product,Price:'999'}]));
    await expect(fetchCatalogProducts(url)).rejects.toThrow(/revision URL/);
  });
  it('serializes tab intent creation and uses a new ID only for a deliberate new operation',async()=>{
    const [a,b]=await Promise.all([checkoutIntent(selection,buyer),checkoutIntent(selection,buyer)]);expect(a).toBe(b);
    expect(await checkoutIntent(selection,buyer)).toBe(a);
    expect(await checkoutIntent(selection,buyer,true)).toBe(a);
    await prepareCheckout(wallet,selection,delivery,a,'createOrderPaid');
    for(const receipt of [null,{state:'uncertain',method:'createOrderPaid'},{state:'reverted',method:'createOrderPaid'},{state:'confirmed',method:'approve'}]){
      state.recoverOperation.mockResolvedValue(receipt);
      expect(await checkoutIntent(selection,buyer,true)).toBe(a);
    }
    state.recoverOperation.mockResolvedValue({state:'confirmed',method:'createOrderPaid'});
    const next=await checkoutIntent(selection,buyer,true);expect(next).not.toBe(a);
    expect(await checkoutIntent(selection,buyer)).toBe(next);
  });
  it('stores only public draft metadata before preparation; delivery stays inside encrypted service',async()=>{
    state.prepare.mockImplementation(async()=>{expect(await loadCheckout(buyer,id)).toBeDefined();return {state:'prepared'};});
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    expect(draft.input.priceAmount).toBe('20000');expect(draft.account).toBe(buyer);
    const text=JSON.stringify([...state.db.values()]);expect(text).not.toContain(delivery.fullName);expect(text).not.toContain(delivery.address);
    expect(state.prepare.mock.calls[0][2].data.delivery).toEqual(delivery);
    expect(await loadCheckout(buyer,id)).toEqual(draft);
  });
  it('rechecks current catalog ownership/key/URL and prices before preparing any private message',async()=>{
    state.readCatalog.mockResolvedValue({...catalog,seller:buyer});
    await expect(prepareCheckout(wallet,selection,delivery,id,'createOrderPaid')).rejects.toThrow(/Catalog changed/);
    expect(state.prepare).not.toHaveBeenCalled();state.readCatalog.mockResolvedValue(catalog);
    state.fetch.mockResolvedValue(response([{...product,Price:'10001'}]));
    await expect(prepareCheckout(wallet,selection,delivery,id,'createOrderPaid')).rejects.toThrow(/price changed/);
  });
  it('separates approval and payment and rechecks storage and terms immediately before signing',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    await submitCheckout(wallet,draft,selection,true);expect(state.approve).toHaveBeenCalledOnce();expect(state.pay).not.toHaveBeenCalled();
    expect(state.resume).toHaveBeenCalledWith(wallet,draft.order,{messageType:'buyer-order',sequence:1},{waitForReady:true,signal:undefined});
    await submitCheckout(wallet,draft,selection);expect(state.pay).toHaveBeenCalledOnce();
    const options=state.pay.mock.calls[0][1];expect(options.expectedAccount).toBe(buyer);expect(options.operationId).toBe('order:'+id);
    await options.beforeSign();
    state.resume.mockResolvedValue({...state.resume.mock.results[0].value,ready:false,state:'pending'});
    await expect(options.beforeSign()).rejects.toThrow(/Resume/);
  });
  it('blocks changed selection and short retention; unpaid creation never calls a payment helper',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderInitial');
    await submitCheckout(wallet,draft,selection);expect(state.send).toHaveBeenCalledOnce();expect(state.pay).not.toHaveBeenCalled();
    await expect(submitCheckout(wallet,draft,{...selection,products:[{...product,quantity:3}]})).rejects.toThrow(/selection differs/);
    state.resume.mockResolvedValue({ready:true,expiresAt:new Date(Date.now()+86400_000).toISOString()});
    await expect(submitCheckout(wallet,draft,selection)).rejects.toThrow(/retention/);
  });
  it('retains the same expiration on retry and prevents switching a saved order between paid and unpaid',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    expect((await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid')).expiresAt).toBe(draft.expiresAt);
    await expect(prepareCheckout(wallet,selection,delivery,id,'createOrderInitial')).rejects.toThrow(/different terms/);
    expect(draft.selectionHash).toBe(keccak256(toUtf8Bytes(canonicalJson(selection))));
  });
  it('authenticates historical terms from creation receipts even after deletion; rejects fabricated prices',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    const envelope=(role:'buyer'|'seller')=>{
      const party=role==='buyer'?draft.order.buyerIdentity:draft.order.sellerIdentity;
      return canonicalJson({format:'picomart-sealed-reference',version:1,referenceProfile:'picomart-sealed-reference-v1',
        context:role==='buyer'?'aaaaaaaaaaaaaaaaaaaaaaaaaa':'bbbbbbbbbbbbbbbbbbbbbbbbba',recipientRole:role,
        recipientIdentityId:party.identityId,recipientPublicKey:party.publicKey,encryptedKey:Buffer.alloc(80,7).toString('base64'),
        encryptedPayload:Buffer.alloc(12,8).toString('base64')+':'+Buffer.alloc(32,9).toString('base64')});
    };
    const be=envelope('buyer'),se=envelope('seller'),expected={messageType:'buyer-order' as const,sequence:1};
    const commitment=tempoReferenceCommitment(createTempoMessageBinding(draft.order,expected),be,se,draft.order,expected);
    const order:MarketOrder={orderId:id,seed:tempoIdToSeed(id),catalogId,priceAmount:'20000',priceToken:PATH_USD,buyer,seller,payer:buyer,
      status:4,deleted:true,deadline:0,context:draft.order,messages:[{messageType:1,sequence:1,author:buyer,commitment,buyerEnvelope:be,sellerEnvelope:se,transactionHash:'0x'+'aa'.repeat(32),blockNumber:1,transactionIndex:0,logIndex:1}]};
    const event=marketInterface.encodeEventLog(marketInterface.getEvent('OrderCreated')!,[id,buyer,seller,catalogId,PATH_USD,20000n,draft.input.buyerPublicKey,catalog.sellerPublicKey,draft.order.buyerIdentity.identityId,draft.order.sellerIdentity.identityId,432000]);
    state.receipt.mockResolvedValue({status:1,logs:[{...event,address:TEMPO_MARKET_DEPLOYMENT.address}]});
    await expect(authenticateOrder(order)).resolves.toBeUndefined();
    await expect(authenticateOrder({...order,priceAmount:'1'})).rejects.toThrow(/creation receipt/);
    state.receipt.mockResolvedValue({status:0,logs:[]});await expect(authenticateOrder(order)).rejects.toThrow(/not verified/);
  });
  it('requires a verified creation reference before any current-order action',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    const order={orderId:id,seed:tempoIdToSeed(id),catalogId,priceAmount:'20000',priceToken:PATH_USD,buyer,seller,payer:buyer,status:2,deleted:false,deadline:1,context:draft.order,messages:[]} as MarketOrder;
    await expect(verifyOrderTerms(order)).rejects.toThrow(/creation reference/);expect(state.order).not.toHaveBeenCalled();
  });
  it('rejects tampered public draft amounts and physical delivery omissions before signing',async()=>{
    const draft=await prepareCheckout(wallet,selection,delivery,id,'createOrderPaid');
    await expect(submitCheckout(wallet,{...draft,input:{...draft.input,priceAmount:'999999'}},selection)).rejects.toThrow(/terms differ/);
    expect(state.pay).not.toHaveBeenCalled();
    await expect(prepareCheckout(wallet,selection,{...delivery,noPhysicalDelivery:false,fullName:''},id,'createOrderPaid')).rejects.toThrow(/required physical/);
  });
});
