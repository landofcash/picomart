import {isPaymentCurrency} from '@picomart/config';
import {AGENT_RESOLVE_PATH,AgentProfileSchema,parseAgentHandoff,validateAgentResolution,decryptAgentDelivery,base64UrlToBytes,canonicalHash,
  type AgentQuote,type AgentHandoff,type AgentProfile,type PicomartDeliveryDetailsV1} from '../../agentProtocol.js';
import {tempoSeedToId} from '@picomart/order-protocol/tempo-protocol';
import {marketApi,fetchCatalogProducts,prepareCheckout,submitCheckout,TEMPO_MARKET_ENABLED,type MarketCatalog,type CheckoutSelection} from '@/lib/tempoMarket';
import {tempoWalletRevision,assertTempoWalletRevision} from '@/lib/internalWallet/providers/tempoInternalWalletProvider';
import type {WalletAdapter} from '@/context/wallet/types';
import {assertQuoteExecutable} from './quoteExpiry';
import {assertCurrentAgentProfile} from './tempoAgentProfile';
export {installedAgentProfile} from './tempoAgentProfile';
export type TempoAgentIntent={quote:AgentQuote;delivery:PicomartDeliveryDetailsV1;trustedProfile:AgentProfile};
export {parseAgentHandoff};
export async function resolveTempoAgent(handoff:AgentHandoff,profile:AgentProfile,fetcher:typeof fetch=fetch):Promise<TempoAgentIntent>{
  const response=await fetcher(profile.quoteOrigin+AGENT_RESOLVE_PATH,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({orderSeed:handoff.orderSeed}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('The signed quote is unavailable or expired.');
  const text=await response.text();if(text.length>512000)throw new Error('Quote response exceeds its size limit.');
  const resolved=await validateAgentResolution(JSON.parse(text),profile);
  if(resolved.quote.orderSeed!==handoff.orderSeed)throw new Error('This quote belongs to another order.');
  const key=base64UrlToBytes(handoff.deliveryKey);let delivery;
  try{delivery=await decryptAgentDelivery(resolved.encryptedDelivery,handoff.orderSeed,key);}finally{key.fill(0);}
  if(await canonicalHash(delivery)!==resolved.quote.delivery.deliveryDetailsHash||!delivery.noPhysicalDelivery!==resolved.quote.delivery.required)throw new Error('Private delivery details do not match the quote.');
  return {quote:resolved.quote,delivery,trustedProfile:AgentProfileSchema.parse(profile)};
}
export async function executeTempoAgentOrder(intent:TempoAgentIntent,wallet:WalletAdapter){
  const guard=()=>{assertCurrentAgentProfile(intent.trustedProfile);assertQuoteExecutable(intent.quote);};
  if(!TEMPO_MARKET_ENABLED)throw new Error('Tempo commerce is not enabled.');guard();
  if(!isPaymentCurrency(intent.quote.payment.asset))throw new Error('Unsupported quoted payment currency.');
  const revision=tempoWalletRevision(),q=intent.quote,{catalog}=await marketApi<{catalog:MarketCatalog}>('/catalogs/'+q.catalog.seed);
  if(catalog.seller!==q.catalog.sellerEvmAddress||catalog.sellerPublicKey!==q.catalog.sellerPublicKey||catalog.sellerIdentityId!==q.catalog.sellerIdentityId||catalog.catalogUrl!==q.catalog.catalogUrl)throw new Error('The catalog changed; request a new quote.');
  const products=await fetchCatalogProducts(catalog.catalogUrl),selection:CheckoutSelection={catalog,products:q.items.map(i=>{
    const product=products.find(p=>p.ProductId===i.productId);if(!product||product.Name!==i.name||product.Price!==i.unitAmount||product.PriceToken!==q.payment.asset)throw new Error('Product terms changed; request a new quote.');return {...product,quantity:i.quantity};
  })};assertTempoWalletRevision(revision);guard();
  const draft=await prepareCheckout(wallet,selection,{...intent.delivery},tempoSeedToId(q.orderSeed),'createOrderPaid');
  assertTempoWalletRevision(revision);guard();
  const tx=await submitCheckout(wallet,draft,selection,false,undefined,guard);
  if(!tx?.hash)throw new Error('Payment has no transaction hash yet. Resume it through order recovery.');return tx.hash;
}
