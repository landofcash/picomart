// Rebuild synthetic fixture ciphertext after changing the buyer-order schema.
// Only the public test wallets already declared in the fixture are used.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as protocol from '../picomart-order-protocol/dist/tempoProtocol.js';
import {prepareItem,clearItemKeys,encryptPayload,wrapAesKey,randomBytes} from '../picomart-seller/node_modules/@zkbytes/sdk/dist/index.js';
const require=createRequire(new URL('../picomart-seller/package.json',import.meta.url));
const {Wallet}=require('ethers');
const file=new URL('../picomart-order-protocol/fixtures/tempo/message-protocol-v1.json',import.meta.url);
const fixture=JSON.parse(await fs.readFile(file,'utf8'));
const example=fixture.examples.find(e=>e.expected.messageType==='buyer-order');
const wallet=new Wallet(fixture.testPrivateKeys.buyer);
example.payload.version=2;example.payload.profile='picomart-message-v2';
example.payload.data.delivery.phone='123456789';
const seller=fixture.order.sellerIdentity.context.account;
const base=`https://cdn.picomart.example/moderato/v1/${seller}`;
example.payload.data.fulfillment={catalogUrl:`${base}/catalogs/${'a'.repeat(64)}.json`,deliveryOptionsUrl:`${base}/delivery-options/${'b'.repeat(64)}.json`,methodId:'shipping',type:'customer-address',name:'Shipping',description:'',optionId:'standard',optionName:'Standard',optionDescription:'',amount:example.payload.data.deliveryAmount,currency:example.payload.data.payment.tokenAddress};
example.plaintext=protocol.serializeTempoMessage(example.payload,fixture.order,example.expected);
const prepared=await prepareItem({plaintext:example.plaintext,seed:example.item.seed,expiresAt:example.item.expiresAt,managers:[],recipientPublicKeys:[fixture.order.buyerIdentity.publicKey,fixture.order.sellerIdentity.publicKey],signer:{address:wallet.address,signMessage:message=>wallet.signMessage(message)}});
try {
 example.item=prepared.item;example.objectDigest=await protocol.tempoStorageObjectDigest(prepared.item);
 for(const role of ['buyer','seller']) {
  const reference=example.privateReferences[role];reference.objectDigest=example.objectDigest;reference.reference.expectedCreator=prepared.item.creator;
  const key=randomBytes(32);
  try {
   const wrapped=await wrapAesKey(reference.header.context,reference.header.recipientPublicKey,key),encrypted=await encryptPayload(protocol.canonicalJson(reference),key);
   example.envelopes[role]=protocol.serializeTempoSealedReference({...reference.header,encryptedKey:wrapped.encryptedKey,encryptedPayload:encrypted.encryptedPayload},fixture.order,role);
  } finally {key.fill(0);}
 }
 example.abiEncoded=protocol.encodeTempoReferenceCommitment(example.binding,example.envelopes.buyer,example.envelopes.seller,fixture.order,example.expected);
 example.commitment=protocol.tempoReferenceCommitment(example.binding,example.envelopes.buyer,example.envelopes.seller,fixture.order,example.expected);
 await fs.writeFile(file,JSON.stringify(fixture,null,2)+'\n');
} finally {clearItemKeys(prepared.keys);}
