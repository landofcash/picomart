// Synthetic interoperability fixture. Never reads wallet or deployment credentials.
import fs from 'node:fs/promises';
import {generateKeyPair,exportJWK} from 'jose';
import * as agentHelpers from '../dist/tempoAgent.js';
const agent={...agentHelpers,...agentHelpers.createTempoAgentProtocol({chainId:42431,contractAddress:'0x3c91183f0454eab6eff6f570ac402be278dbd6f4',apiPath:'/api/v2/moderato',defaultPaymentToken:'0x20c0000000000000000000000000000000000000',paymentTokens:[{tokenId:'0x20c0000000000000000000000000000000000000',name:'PathUSD',symbol:'PathUSD',decimals:6}]})};
import * as protocol from '../dist/tempoProtocol.js';
const orderSeed='AgICAgICAgICAgICAgICAg',catalogSeed='AQEBAQEBAQEBAQEBAQEBAQ',productId='AwMDAwMDAwMDAwMDAwMDAw';
const receiving=(role,account,seed,key)=>protocol.createTempoReceivingIdentity(protocol.createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:42431,contractAddress:agent.AGENT_CONTRACT,
  account,...(role==='buyer'?{role,orderSeed:seed}:{role,catalogSeed:seed})}),Buffer.alloc(32,key).toString('base64'));
const buyerIdentity=receiving('buyer','0x'+'11'.repeat(20),orderSeed,3),sellerIdentity=receiving('seller','0x'+'22'.repeat(20),catalogSeed,4);
const order=protocol.TempoOrderContextSchema.parse({version:1,chainId:42431,contractAddress:agent.AGENT_CONTRACT,orderSeed,catalogSeed,buyerIdentity,sellerIdentity});
const delivery={fullName:'Test recipient',address:'Test street',city:'Test city',postalCode:'Test',country:'PT',phone:'Test',email:'test@example.invalid',noPhysicalDelivery:false};
const deliveryKey=Buffer.alloc(32,1),encryptedDelivery=await agent.encryptAgentDelivery(delivery,orderSeed,deliveryKey,Buffer.alloc(12,2));
const request=agent.AgentQuoteRequestSchema.parse({version:2,orderSeed,catalogSeed,items:[{productId,quantity:2}],encryptedDelivery,deliveryDetailsHash:await agent.canonicalHash(delivery),physicalDelivery:true});
const quote=agent.AgentQuoteSchema.parse({version:2,orderSeed,requestHash:await agent.agentRequestCommitment(request),network:agent.AGENT_NETWORK,
  x402:{protocolVersion:2,scheme:'picomart-order',schemeVersion:2,resourceMethod:'POST',resourcePath:agent.agentConfirmPath(orderSeed),maxTimeoutSeconds:600},
  catalog:{seed:catalogSeed,sellerEvmAddress:sellerIdentity.context.account,sellerPublicKey:'0x'+Buffer.from(sellerIdentity.publicKey,'base64').toString('hex'),sellerIdentityId:sellerIdentity.identityId,catalogUrl:'https://cdn.picomart.zkbytes.com/fixture.json'},
  items:[{productId,quantity:2,name:'Test product',unitAmount:'1250000',lineAmount:'2500000'}],delivery:{required:true,optionId:'pilot-seller-arranged',optionName:'Seller-arranged delivery',amount:'0',deliveryDetailsHash:request.deliveryDetailsHash,encryptedDeliveryHash:await agent.canonicalHash(encryptedDelivery)},
  payment:{symbol:'PathUSD',name:'PathUSD',assetType:'tip20',asset:agent.AGENT_TOKEN,decimals:6,payTo:agent.AGENT_CONTRACT,amount:'2500000'},picomart:{chainId:42431,contractAddress:agent.AGENT_CONTRACT},issuedAt:1700000000,expiresAt:1700000600});
const keys=await generateKeyPair('Ed25519',{extractable:true}),publicKey=(await exportJWK(keys.publicKey)).x,kid='synthetic-tempo-agent-fixture';
const quoteDigest=await agent.canonicalHash(quote),quoteJws=await agent.signQuoteDigest(quoteDigest,kid,keys.privateKey),resourceOrigin='https://x402.example.test';
const resolution={quote,quoteDigest,quoteJws,encryptedDelivery,recoverUntil:quote.expiresAt+86400,paymentRequired:{x402Version:2,error:'approval_required',resource:{url:resourceOrigin+quote.x402.resourcePath,description:'Test',mimeType:'application/json',serviceName:'Picomart'},accepts:[agent.agentRequirements(quote,quoteDigest,quoteJws)],extensions:{}}};
const profile={version:2,profileId:'synthetic-tempo-agent',quoteOrigin:resourceOrigin,resourceOrigin,network:agent.AGENT_NETWORK,chainId:42431,contractAddress:agent.AGENT_CONTRACT,trustedQuoteKeys:[{kid,publicKey}]};
const expected={messageType:'buyer-order',sequence:1},binding=protocol.createTempoMessageBinding(order,expected);
const envelope=role=>protocol.serializeTempoSealedReference({version:1,format:'picomart-sealed-reference',referenceProfile:'picomart-sealed-reference-v1',context:(role==='buyer'?'a':'b').repeat(25)+'a',recipientRole:role,
  recipientIdentityId:order[role+'Identity'].identityId,recipientPublicKey:order[role+'Identity'].publicKey,encryptedKey:Buffer.alloc(80,5).toString('base64'),encryptedPayload:Buffer.alloc(12,6).toString('base64')+':'+Buffer.alloc(16,7).toString('base64')},order,role);
const buyerEnvelope=envelope('buyer'),sellerEnvelope=envelope('seller'),commitment=protocol.tempoReferenceCommitment(binding,buyerEnvelope,sellerEnvelope,order,expected);
await fs.mkdir(new URL('../fixtures/tempo/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../fixtures/tempo/agent-order-v2.json',import.meta.url),JSON.stringify({notice:'Synthetic test data only. The published test delivery key is not a real credential.',request,delivery,deliveryKey:deliveryKey.toString('base64url'),resolution,profile,order,buyerEnvelope,sellerEnvelope,commitment},null,2)+'\n');
