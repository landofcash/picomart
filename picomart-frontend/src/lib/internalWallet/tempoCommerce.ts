import {get, set} from "idb-keyval";
import {z} from "zod";
import {clearItemKeys, decodeBase64, decryptPayload, decryptStorageItem, deriveItemKeys, encodeBase32, encodeBase64, encryptPayload, normalizeAndVerifyMasterSignature, parseStrictJson, prepareItem, randomBytes, signEd25519, unwrapAesKey, validateStorageItem, validateX25519PublicKey, verifyEd25519Base64, wrapAesKey, WRAPPING_ALGORITHM, type ItemKeyPair, type StorageItem, type ZkbytesClient} from "@zkbytes/sdk";
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';

import {assertTempoIdentitySnapshot, assertTempoMessageBinding, canonicalJson, createTempoMessageBinding, createTempoReceivingIdentity, parseTempoMessage, parseTempoPrivateReference, parseTempoSealedReference, serializeTempoMessage, serializeTempoPrivateReference, serializeTempoSealedReference, TEMPO_SDK_KEY_PROFILE, TempoHashSchema, TempoMessageBindingSchema, TempoOrderContextSchema, TempoReceivingContextSchema, TempoReceivingIdentitySchema, TempoStorageItemSchema, TempoStorageSeedSchema, TempoTimestampSchema, tempoReceivingSigningMessage, tempoReferenceCommitment, tempoStorageObjectDigest, validateTempoObjectMetadata, type TempoExpectedMessage, type TempoMessagePayload, type TempoOrderContext, type TempoPrivateReference, type TempoReceivingContext, type TempoReceivingIdentity, type TempoSupportedOrigins} from "@picomart/order-protocol/tempo-protocol";
import {APP_KEY_PREFIX} from "@/config";
import type {WalletAdapter} from "@/context/wallet/types";
import {assertTempoWalletRevision, tempoInternalWalletProvider as provider, tempoWalletRevision} from "./providers/tempoInternalWalletProvider";

const states = z.enum(["prepared", "uploading", "pending", "uncertain", "active", "deleted", "expired"]);
// Seller still uses Zod 3. Delegate wire validation instead of mixing Zod versions in object shapes.
const shared = <T>(schema:{safeParse(input:unknown):{success:boolean}}) => z.custom<T>(input => schema.safeParse(input).success);
const journalHeaderSchema = z.object({format:z.literal("picomart-tempo-operation-v1"), identity:shared<TempoReceivingIdentity>(TempoReceivingIdentitySchema), context:shared<string>(TempoStorageSeedSchema)}).strict();
const journalSchema = journalHeaderSchema.extend({encryptedKey:z.string().max(108), encryptedPayload:z.string().max(600_000), signature:z.string().length(88)}).strict();
const operationSchema = z.object({
  header:journalHeaderSchema, order:shared<TempoOrderContext>(TempoOrderContextSchema), binding:shared<TempoMessagePayload["binding"]>(TempoMessageBindingSchema),
  item:shared<StorageItem>(TempoStorageItemSchema), buyerEnvelope:z.string().max(8192), sellerEnvelope:z.string().max(8192),
  commitment:shared<string>(TempoHashSchema), state:states,
}).strict();
type Journal = z.infer<typeof journalSchema>;
type Operation = z.infer<typeof operationSchema>;
export type TempoOperationSummary = {commitment:string; state:z.infer<typeof states>; ready:boolean; expiresAt:string; buyerEnvelope:string; sellerEnvelope:string};
export interface TempoCommerceOptions {
  client: ZkbytesClient;
  /** Locally trusted settings, never taken from imported references. */
  origins: TempoSupportedOrigins;
  /** Resolve the current verified deployment on every checkpoint. Null disables commerce. */
  deployment?: () => string | null;
  /** Confirm against deployed service limits and the agreed lifecycle before enabling preparation. */
  maxRetentionSeconds?: number;
}
let pageRevision = 0;
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { pageRevision++; });
const newContext = () => encodeBase32(randomBytes(16));
const bytes = (value:string) => new TextEncoder().encode(value);
const expectedFor = (op:Operation):TempoExpectedMessage => ({messageType:op.binding.messageType, sequence:op.binding.sequence});
const authorRole = (expected:TempoExpectedMessage) => expected.messageType === "buyer-order" ? "buyer" : "seller";
const identityFor = (order:TempoOrderContext, role:"buyer"|"seller") => role === "buyer" ? order.buyerIdentity : order.sellerIdentity;
const journalKey = (order:TempoOrderContext, expected:TempoExpectedMessage) => `${APP_KEY_PREFIX}_tempo_operation_v1_${order.contractAddress}_${order.orderSeed}_${expected.messageType}_${expected.sequence}_${identityFor(order,authorRole(expected)).identityId}`;
async function exclusive<T>(key:string, work:()=>Promise<T>):Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("This browser cannot safely coordinate recovery operations across tabs.");
  return navigator.locks.request(key, work);
}
const summary = (op:Operation, ready=false):TempoOperationSummary => ({commitment:op.commitment,state:op.state,ready,expiresAt:op.item.expiresAt,buyerEnvelope:op.buyerEnvelope,sellerEnvelope:op.sellerEnvelope});
const journalHeader = (journal:Journal) => journalHeaderSchema.parse({format:journal.format,identity:journal.identity,context:journal.context});
const journalSigningMessage = (journal:Omit<Journal,"signature">) => bytes(`Picomart operation journal\n${canonicalJson(journal)}`);
const unsignedJournal = (journal:Journal) => ({...journalHeader(journal),encryptedKey:journal.encryptedKey,encryptedPayload:journal.encryptedPayload});

/** Application boundary for built-in wallets. It submits storage requests only, never transactions. */
export function createTempoCommerceService(options:TempoCommerceOptions) {
  const {client, origins} = options;
  const deployment = options.deployment ?? (() => PICOMART_TEMPO_CONFIG.deployment.address);
  function trustedClient() {
    if (client.apiOrigin !== origins.apiOrigin || client.downloadOrigin !== origins.downloadOrigin) throw new Error("Storage client differs from the locally trusted origins.");
  }
  async function guard(wallet:WalletAdapter, context:TempoReceivingContext, revision:number, page:number, requireUnlocked=true) {
    assertTempoWalletRevision(revision);
    if (page !== pageRevision || deployment()?.toLowerCase() !== context.contractAddress) throw new Error("Page or deployment changed; restart this action.");
    if (wallet.chain !== "tempo" || wallet.id !== "tempo-internal" || await wallet.getNetwork?.() !== PICOMART_TEMPO_CONFIG.network || (await wallet.getAddress())?.toLowerCase() !== context.account) throw new Error("Select the matching built-in Tempo Moderato wallet.");
    const active = await provider.getActiveWallet("moderato");
    if (!active || (requireUnlocked && active.locked) || active.identity.evmAddress.toLowerCase() !== context.account) throw new Error("Unlock the matching Tempo wallet first.");
    assertTempoWalletRevision(revision);
    if (page !== pageRevision || deployment()?.toLowerCase() !== context.contractAddress) throw new Error("Page or deployment changed; restart this action.");
  }
  async function withKeys<T>(wallet:WalletAdapter, contextInput:TempoReceivingContext, work:(keys:ItemKeyPair, checkpoint:()=>Promise<void>)=>Promise<T>):Promise<T> {
    const context = TempoReceivingContextSchema.parse(contextInput), revision=tempoWalletRevision(), page=pageRevision;
    const checkpoint = () => guard(wallet,context,revision,page);
    // Permit the matching locked wallet to reach its signing-time unlock prompt.
    // Every checkpoint after signing still requires an unlocked, unchanged wallet.
    await guard(wallet,context,revision,page,false);
    const message = tempoReceivingSigningMessage(context);
    const signature = await wallet.signMessage(message);
    let normalized:Uint8Array|undefined, keys:ItemKeyPair|undefined;
    try {
      await checkpoint();
      normalized = normalizeAndVerifyMasterSignature(signature,message,context.account);
      keys = await deriveItemKeys(normalized);
      await checkpoint();
      const result = await work(keys,checkpoint);
      await checkpoint();
      return result;
    } finally { signature.fill(0); normalized?.fill(0); if (keys) clearItemKeys(keys); }
  }
  function matchKeys(keys:ItemKeyPair, identity:TempoReceivingIdentity) {
    assertTempoIdentitySnapshot(createTempoReceivingIdentity(identity.context,encodeBase64(keys.encryptionPublicKey)),identity);
  }
  async function seal(op:Operation, keys:ItemKeyPair):Promise<Journal> {
    matchKeys(keys,op.header.identity);
    const aes = randomBytes(32);
    try {
      const text = canonicalJson(op);
      if (bytes(text).length > 400_000) throw new Error("Recovery operation exceeds its size limit.");
      const encrypted = await encryptPayload(text,aes);
      const wrapped = await wrapAesKey(op.header.context,op.header.identity.publicKey,aes);
      const unsigned={...op.header,encryptedKey:wrapped.encryptedKey,encryptedPayload:encrypted.encryptedPayload};
      return journalSchema.parse({...unsigned,signature:signEd25519(journalSigningMessage(unsigned),keys.signingPrivateKey)});
    } finally { aes.fill(0); }
  }
  async function privateReference(text:string, order:TempoOrderContext, expected:TempoExpectedMessage, role:"buyer"|"seller", keys:ItemKeyPair):Promise<TempoPrivateReference> {
    matchKeys(keys,identityFor(order,role));
    const envelope = parseTempoSealedReference(text,order,role);
    const aes = await unwrapAesKey(envelope.context,{publicKey:envelope.recipientPublicKey,wrappingAlgorithm:WRAPPING_ALGORITHM,encryptedKey:envelope.encryptedKey},keys.encryptionPrivateKey);
    try { return parseTempoPrivateReference(await decryptPayload(envelope.encryptedPayload,aes),envelope,order,expected,origins,role); }
    finally { aes.fill(0); }
  }
  async function decryptItem(op:Operation, role:"buyer"|"seller", keys:ItemKeyPair, itemInput:unknown=op.item) {
    const ref = await privateReference(role === "buyer" ? op.buyerEnvelope : op.sellerEnvelope,op.order,expectedFor(op),role,keys);
    const item = validateStorageItem(await validateTempoObjectMetadata(itemInput,ref,op.order));
    const decrypted = await decryptStorageItem(item,ref.reference.expectedCreator,keys.encryptionPrivateKey);
    if (decrypted.expired) throw new Error("The private message has expired.");
    return parseTempoMessage(decrypted.plaintext,op.order,expectedFor(op));
  }
  async function open(input:unknown, order:TempoOrderContext, expected:TempoExpectedMessage, keys:ItemKeyPair):Promise<Operation> {
    const journal = journalSchema.parse(input), identity=identityFor(order,authorRole(expected));
    assertTempoIdentitySnapshot(journal.identity,identity); matchKeys(keys,identity);
    // Anyone can encrypt to a public receiving key. Authenticate the journal's writer separately.
    if (!verifyEd25519Base64(journalSigningMessage(unsignedJournal(journal)),encodeBase64(keys.signingPublicKey),journal.signature)) throw new Error("Recovery journal signature differs from the restored wallet.");
    const aes = await unwrapAesKey(journal.context,{publicKey:identity.publicKey,wrappingAlgorithm:WRAPPING_ALGORITHM,encryptedKey:journal.encryptedKey},keys.encryptionPrivateKey);
    try {
      const text=await decryptPayload(journal.encryptedPayload,aes);
      if (bytes(text).length > 400_000) throw new Error("Recovery operation exceeds its size limit.");
      const op=operationSchema.parse(parseStrictJson(bytes(text)));
      if (canonicalJson(op) !== text || canonicalJson(op.header) !== canonicalJson(journalHeader(journal)) || canonicalJson(op.order) !== canonicalJson(order)) throw new Error("Recovery header or order differs from its authenticated snapshot.");
      assertTempoMessageBinding(op.binding,order,expected);
      if (tempoReferenceCommitment(op.binding,op.buyerEnvelope,op.sellerEnvelope,order,expected) !== op.commitment) throw new Error("Recovery commitment differs.");
      await decryptItem(op,authorRole(expected),keys);
      return op;
    } finally { aes.fill(0); }
  }
  async function save(key:string, op:Operation, keys:ItemKeyPair, checkpoint:()=>Promise<void>) {
    const journal = await seal(op,keys);
    await checkpoint();
    await set(key,journal);
    await checkpoint();
  }
  return {
    async receivingIdentity(wallet:WalletAdapter, context:TempoReceivingContext) {
      return withKeys(wallet,context,async (keys,checkpoint) => {
        const identity=createTempoReceivingIdentity(context,encodeBase64(keys.encryptionPublicKey));
        // Reject nondeterministic signers before publishing a receiving snapshot.
        await withKeys(wallet,context,async repeated => { matchKeys(repeated,identity); });
        await checkpoint(); return identity;
      });
    },
    async prepare(wallet:WalletAdapter, orderInput:TempoOrderContext, payload:TempoMessagePayload, expected:TempoExpectedMessage, expiresAt:string):Promise<TempoOperationSummary> {
      const order=TempoOrderContextSchema.parse(orderInput), identity=identityFor(order,authorRole(expected)), key=journalKey(order,expected);
      const plaintext=serializeTempoMessage(payload,order,expected);
      trustedClient();
      return exclusive(key,() => withKeys(wallet,identity.context,async (keys,checkpoint) => {
        matchKeys(keys,identity);
        const stored = await get(key); await checkpoint();
        if (stored) {
          const op=await open(stored,order,expected,keys);
          if (serializeTempoMessage(await decryptItem(op,authorRole(expected),keys),order,expected) !== plaintext || op.item.expiresAt !== expiresAt) throw new Error("This message sequence already has a different prepared operation.");
          return summary(op);
        }
        TempoTimestampSchema.parse(expiresAt);
        const max=options.maxRetentionSeconds;
        if (!max || !Number.isSafeInteger(max) || max <= 0 || Date.parse(expiresAt) <= Date.now() || Date.parse(expiresAt)-Date.now() > max*1000) throw new Error("Confirm the storage retention policy and choose a supported expiration first.");
        for (const party of [order.buyerIdentity,order.sellerIdentity]) validateX25519PublicKey(decodeBase64(party.publicKey));
        const signatures:Uint8Array[]=[];
        const prepared=await prepareItem({plaintext,expiresAt,managers:[],recipientPublicKeys:[...new Set([order.buyerIdentity.publicKey,order.sellerIdentity.publicKey])],signer:{address:identity.context.account,signMessage:async message => { await checkpoint(); const supplied=await wallet.signMessage(message); signatures.push(supplied); await checkpoint(); return supplied; }}}).finally(() => { for (const signature of signatures) signature.fill(0); });
        try {
          await checkpoint();
          const item=TempoStorageItemSchema.parse(validateStorageItem(prepared.item)), reference=client.createReference(item), objectDigest=await tempoStorageObjectDigest(item);
          const used=new Set([item.seed]);
          async function envelope(role:"buyer"|"seller") {
            const recipient=identityFor(order,role); let context=newContext(); while (used.has(context)) context=newContext(); used.add(context);
            const header={format:"picomart-sealed-reference" as const,version:1 as const,referenceProfile:payload.binding.referenceProfile,context,recipientRole:role,recipientIdentityId:recipient.identityId,recipientPublicKey:recipient.publicKey};
            const aes=randomBytes(32);
            try {
              const wrapped=await wrapAesKey(context,recipient.publicKey,aes);
              // A valid provisional envelope lets shared validation authenticate the private header.
              const provisional={...header,encryptedKey:wrapped.encryptedKey,encryptedPayload:(await encryptPayload("",aes)).encryptedPayload};
              const privateText=serializeTempoPrivateReference({header,binding:payload.binding,keyDerivationProfile:TEMPO_SDK_KEY_PROFILE,reference,objectDigest},provisional,order,expected,origins,role);
              return serializeTempoSealedReference({...provisional,encryptedPayload:(await encryptPayload(privateText,aes)).encryptedPayload},order,role);
            } finally { aes.fill(0); }
          }
          const buyerEnvelope=await envelope("buyer"),sellerEnvelope=await envelope("seller");
          const op=operationSchema.parse({header:{format:"picomart-tempo-operation-v1",identity,context:newContext()},order,binding:payload.binding,item,buyerEnvelope,sellerEnvelope,commitment:tempoReferenceCommitment(payload.binding,buyerEnvelope,sellerEnvelope,order,expected),state:"prepared"});
          await decryptItem(op,authorRole(expected),keys);
          await save(key,op,keys,checkpoint); return summary(op);
        } finally { clearItemKeys(prepared.keys); }
      }));
    },
    async hasPreparedOperation(orderInput:TempoOrderContext, expected:TempoExpectedMessage):Promise<boolean> {
      const order=TempoOrderContextSchema.parse(orderInput);
      return Boolean(await get(journalKey(order,expected)));
    },
    async exportRecovery(orderInput:TempoOrderContext, expected:TempoExpectedMessage):Promise<string> {
      const order=TempoOrderContextSchema.parse(orderInput),stored=await get(journalKey(order,expected));
      if (!stored) throw new Error("No saved recovery operation.");
      return canonicalJson(journalSchema.parse(stored));
    },
    async importRecovery(wallet:WalletAdapter, text:string, orderInput:TempoOrderContext, expected:TempoExpectedMessage):Promise<TempoOperationSummary> {
      if (bytes(text).length > 600_000) throw new Error("Recovery file is too large.");
      const journal=journalSchema.parse(parseStrictJson(bytes(text))),order=TempoOrderContextSchema.parse(orderInput),key=journalKey(order,expected);
      trustedClient();
      return exclusive(key,() => withKeys(wallet,identityFor(order,authorRole(expected)).context,async (keys,checkpoint) => {
        const imported=await open(journal,order,expected,keys),existing=await get(key); await checkpoint();
        if (existing) {
          const op=await open(existing,order,expected,keys);
          if (op.commitment !== imported.commitment) throw new Error("A different operation already occupies this message sequence.");
          return summary(op);
        }
        // Exported progress is a hint. Read back remote evidence before declaring readiness.
        imported.state="uncertain"; await save(key,imported,keys,checkpoint); return summary(imported);
      }));
    },
    async resumeUpload(wallet:WalletAdapter, orderInput:TempoOrderContext, expected:TempoExpectedMessage, verification:{waitForReady?:boolean; signal?:AbortSignal}={}):Promise<TempoOperationSummary> {
      if (verification.signal?.aborted) throw new Error("Order preparation was cancelled.");
      const order=TempoOrderContextSchema.parse(orderInput),key=journalKey(order,expected);
      trustedClient();
      return exclusive(key,() => withKeys(wallet,identityFor(order,authorRole(expected)).context,async (keys,checkpoint) => {
        const check = async () => {
          if (verification.signal?.aborted) throw new Error("Order preparation was cancelled.");
          await checkpoint();
        };
        const stored=await get(key); await checkpoint();
        if (!stored) throw new Error("Prepare and save the message before uploading.");
        const op=await open(stored,order,expected,keys);
        try {
          let uploaded = false;
          for (let attempt=0; attempt<(verification.waitForReady ? 15 : 1); attempt++) {
            await check();
            const recovery=await client.recoverUpload(op.item.seed,op.item.creator); await check();
            if (recovery.outcome === "active") {
              await decryptItem(op,authorRole(expected),keys,recovery.item); op.state="active";
              await save(key,op,keys,check); return summary(op,true);
            }
            const justUploaded = recovery.outcome === "not-found" && !uploaded;
            if (justUploaded) {
              op.state="uploading"; await save(key,op,keys,check);
              await check(); await client.upload(op.item); await check();
              uploaded = true;
              op.state="pending";
            } else {
              op.state=recovery.outcome === "not-found" ? "pending" : recovery.outcome;
            }
            await save(key,op,keys,check);
            if (!verification.waitForReady || op.state !== "pending" || attempt === 14) return summary(op);
            // Read back immediately after POST. Further checks wait without reposting.
            if (!justUploaded) await new Promise<void>((resolve,reject) => {
              const signal=verification.signal;
              const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new Error("Order preparation was cancelled."));};
              const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},1000);
              signal?.addEventListener("abort",abort,{once:true});
              if (signal?.aborted) abort();
            });
          }
          return summary(op);
        } catch {
          if (verification.signal?.aborted) throw new Error("Order preparation was cancelled.");
          op.state="uncertain";
          // A lock invalidates signing work but the pre-request encrypted journal already exists.
          await checkpoint(); await save(key,op,keys,checkpoint);
          throw new Error("Storage outcome is uncertain. Resume the saved operation; do not prepare a replacement.");
        }
      }));
    },
    async receive(wallet:WalletAdapter, orderInput:TempoOrderContext, expected:TempoExpectedMessage, role:"buyer"|"seller", buyerEnvelope:string, sellerEnvelope:string, trustedCommitment:string):Promise<TempoMessagePayload> {
      const order=TempoOrderContextSchema.parse(orderInput),binding=createTempoMessageBinding(order,expected);
      trustedClient();
      if (tempoReferenceCommitment(binding,buyerEnvelope,sellerEnvelope,order,expected) !== TempoHashSchema.parse(trustedCommitment)) throw new Error("Public reference commitment differs from authenticated order evidence.");
      return withKeys(wallet,identityFor(order,role).context,async (keys,checkpoint) => {
        const ref=await privateReference(role === "buyer" ? buyerEnvelope : sellerEnvelope,order,expected,role,keys); await checkpoint();
        const downloaded=await client.download(ref.reference.seed); await checkpoint();
        const item=validateStorageItem(await validateTempoObjectMetadata(downloaded,ref,order));
        const decrypted=await decryptStorageItem(item,ref.reference.expectedCreator,keys.encryptionPrivateKey);
        if (decrypted.expired) throw new Error("The private message has expired.");
        const result=parseTempoMessage(decrypted.plaintext,order,expected); await checkpoint(); return result;
      });
    },
  };
}
