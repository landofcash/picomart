import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ZkbytesClient, type StorageItem} from "@zkbytes/sdk";
import fixture from "@picomart/order-protocol/fixtures/tempo/message-protocol-v1.json";
import {canonicalJson, TempoOrderContextSchema, TempoMessagePayloadSchema, type TempoExpectedMessage} from "@picomart/order-protocol/tempo-protocol";
import {createTempoCommerceService} from "./tempoCommerce";
import {tempoInternalWalletProvider as provider} from "./providers/tempoInternalWalletProvider";
import {loadWalletRecords, lockWalletSession} from "./store";

import {setInternalWalletUnlockHandler} from "./unlockGate";

afterEach(()=>setInternalWalletUnlockHandler(null));

const db=vi.hoisted(() => new Map<string,unknown>());
vi.mock("idb-keyval", () => ({get:async (key:string) => structuredClone(db.get(key)),set:async (key:string,value:unknown) => { db.set(key,structuredClone(value)); }}));
const order=TempoOrderContextSchema.parse(fixture.order);
const password="disposable test password";
const adapter=provider.getWalletAdapter("moderato");
const expiration=() => new Date(Date.now()+6*86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const operationEntries=() => [...db.entries()].filter(([key]) => key.includes("_tempo_operation_v1_"));
async function select(role:"buyer"|"seller") {
  const address=order[role === "buyer" ? "buyerIdentity" : "sellerIdentity"].context.account;
  const existing=(await provider.listWallets("moderato")).find(wallet => wallet.identity.evmAddress.toLowerCase() === address);
  if (existing) { await provider.activateWallet("moderato",existing.id); return provider.unlockWallet("moderato",existing.id,password); }
  return provider.importWallet("moderato",{passphrase:password,privateKey:fixture.testPrivateKeys[role]});
}
function server() {
  let stored:StorageItem|undefined;
  let mode:"normal"|"pending"|"uncertain"|"expired"|"deleted"|"bad-object"="normal";
  let posts=0;
  const requests:string[]=[];
  const posted:string[]=[];
  const fetch=vi.fn(async (input:RequestInfo|URL,init?:RequestInit) => {
    const url=String(input); requests.push(url);
    if (init?.method === "POST") {
      posts++; posted.push(String(init.body)); stored=JSON.parse(String(init.body));
      // The journal must already exist when a request can leave the browser.
      expect(operationEntries()).toHaveLength(1);
      if (mode === "uncertain") throw new Error("Connection lost after accepting the object");
      return new Response(JSON.stringify({seed:stored!.seed,state:"pending"}),{status:202});
    }
    if (url.endsWith("/status")) {
      const seed=url.split("/").at(-2);
      if (mode === "pending") return new Response(JSON.stringify({seed,state:"pending"}),{status:202});
      if (mode === "expired") return new Response(JSON.stringify({seed,state:"expired"}));
      if (mode === "deleted") return new Response(JSON.stringify({seed,state:"deleted",deletedBy:{publicKey:stored!.creator.publicKey},deletedAt:new Date().toISOString()}));
      if (!stored) return new Response(JSON.stringify({error:{code:"OBJECT_NOT_FOUND",message:"missing"}}),{status:404});
      return new Response(JSON.stringify({seed,state:"active",createdAt:new Date().toISOString(),expiresAt:stored.expiresAt}));
    }
    const body=structuredClone(stored!);
    if (mode === "bad-object") body.itemSignature.value=fixture.examples[1].item.itemSignature.value;
    return new Response(JSON.stringify(body));
  });
  const client=new ZkbytesClient({...fixture.origins,fetch});
  const service=createTempoCommerceService({client,origins:fixture.origins,deployment:() => order.contractAddress,maxRetentionSeconds:7*86400});
  return {client,service,fetch,requests,posted,get posts(){return posts;},get stored(){return stored;},set mode(value:typeof mode){mode=value;},forget(){stored=undefined;}};
}
beforeEach(async () => {
  for (const record of await loadWalletRecords()) lockWalletSession(record.id);
  db.clear(); vi.restoreAllMocks();
  const queues=new Map<string,Promise<unknown>>();
  vi.stubGlobal("navigator",{locks:{request:<T>(name:string,work:()=>Promise<T>) => {
    const next=(queues.get(name) ?? Promise.resolve()).catch(() => {}).then(work);
    queues.set(name,next); return next;
  }}});
});

describe("built-in Tempo commerce preparation and durable encrypted recovery", () => {
  for (const example of fixture.examples) {
    it(`automatically uploads and verifies ${example.expected.messageType} without a second action`,async()=>{
      const s=server(),expected=example.expected as TempoExpectedMessage,payload=TempoMessagePayloadSchema.parse(example.payload);
      await select(expected.messageType==="buyer-order" ? "buyer" : "seller");
      const prepared=await s.service.prepare(adapter,order,payload,expected,expiration());
      const verified=await s.service.resumeUpload(adapter,order,expected,{waitForReady:true});
      expect(verified).toMatchObject({ready:true,state:"active",commitment:prepared.commitment});
      expect(s.posts).toBe(1);
      expect(s.requests.filter(url=>url.endsWith("/status"))).toHaveLength(2);
    });
    it(`prepares, restores and decrypts ${example.expected.messageType} for both parties`, async () => {
      const s=server(),expected=example.expected as TempoExpectedMessage,payload=TempoMessagePayloadSchema.parse(example.payload);
      const role=expected.messageType === "buyer-order" ? "buyer" : "seller";
      const wallet=await select(role);
      expect(await s.service.receivingIdentity(adapter,order[role === "buyer" ? "buyerIdentity" : "sellerIdentity"].context)).toEqual(order[role === "buyer" ? "buyerIdentity" : "sellerIdentity"]);
      expect(await s.service.hasPreparedOperation(order,expected)).toBe(false);
      const prepared=await s.service.prepare(adapter,order,payload,expected,expiration());
      expect(await s.service.hasPreparedOperation(order,expected)).toBe(true);
      expect(prepared.ready).toBe(false); expect(s.posts).toBe(0);
      const file=await s.service.exportRecovery(order,expected);
      expect(file).not.toContain(payload.binding.messageType);
      expect(file).not.toContain(canonicalJson(payload.data));
      expect(file).not.toContain("seed"); expect(file).not.toContain(fixture.origins.apiOrigin);
      const packet=JSON.parse(file); expect(packet.format).toBe("picomart-tempo-operation-v1");
      await provider.removeWallet("moderato",wallet.id);
      await provider.importWallet("moderato",{passphrase:"a different wallet password",privateKey:fixture.testPrivateKeys[role]});
      for (const [key] of operationEntries()) db.delete(key);
      expect((await s.service.importRecovery(adapter,file,order,expected)).commitment).toBe(prepared.commitment);
      expect((await s.service.resumeUpload(adapter,order,expected)).ready).toBe(false);
      const uploaded=await s.service.resumeUpload(adapter,order,expected);
      expect(uploaded.ready).toBe(true); expect(s.posts).toBe(1);
      expect(file).not.toContain(s.stored!.seed);
      expect(s.stored!.managers).toEqual([]);
      expect(new Set(s.stored!.encryptedKeys.map(entry => entry.publicKey)).size).toBe(3);
      for (const party of ["buyer","seller"] as const) {
        // The restored author now uses its new local password.
        if (party !== role) await select(party);
        else {
          const existing=(await provider.listWallets("moderato")).find(w => w.identity.evmAddress.toLowerCase() === order[party === "buyer" ? "buyerIdentity" : "sellerIdentity"].context.account)!;
          await provider.activateWallet("moderato",existing.id); await provider.unlockWallet("moderato",existing.id,"a different wallet password");
        }
        expect(await s.service.receive(adapter,order,expected,party,uploaded.buyerEnvelope,uploaded.sellerEnvelope,uploaded.commitment)).toEqual(payload);
      }
    });
  }
  it("unlocks the selected wallet during receiving-identity signing and retains deterministic identity",async()=>{
    const s=server(),selected=await select("seller");
    await provider.lockWallet(selected.id);
    const unlock=vi.fn(async()=>password);
    setInternalWalletUnlockHandler(unlock);
    expect(await s.service.receivingIdentity(adapter,order.sellerIdentity.context)).toEqual(order.sellerIdentity);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect((await provider.getActiveWallet("moderato"))?.locked).toBe(false);
    expect(s.posts).toBe(0);
  });
  it("leaves a cancelled receiving-identity unlock locked without creating an operation or uploading",async()=>{
    const s=server(),selected=await select("seller");
    await provider.lockWallet(selected.id);
    setInternalWalletUnlockHandler(async()=>{throw new Error("Wallet unlock was cancelled.");});
    await expect(s.service.receivingIdentity(adapter,order.sellerIdentity.context)).rejects.toThrow("Wallet unlock was cancelled.");
    expect((await provider.getActiveWallet("moderato"))?.locked).toBe(true);
    expect(operationEntries()).toHaveLength(0);expect(s.posts).toBe(0);
  });
  const example=fixture.examples[0],expected=example.expected as TempoExpectedMessage,payload=TempoMessagePayloadSchema.parse(example.payload);
  it("waits through pending verification without uploading the message again",async()=>{
    const s=server();await select("buyer");await s.service.prepare(adapter,order,payload,expected,expiration());
    const fetch=s.fetch.getMockImplementation()!;let reads=0;
    s.fetch.mockImplementation(async(input,init)=>{
      if(String(input).endsWith("/status")) {reads++;s.mode=reads===2 ? "pending" : "normal";}
      return fetch(input,init);
    });
    expect(await s.service.resumeUpload(adapter,order,expected,{waitForReady:true})).toMatchObject({ready:true,state:"active"});
    expect(s.posts).toBe(1);expect(reads).toBe(3);
  });
  it("stops bounded verification with the saved pending message intact",async()=>{
    const s=server();await select("buyer");const prepared=await s.service.prepare(adapter,order,payload,expected,expiration());
    s.mode="pending";
    expect(await s.service.resumeUpload(adapter,order,expected,{waitForReady:true})).toMatchObject({ready:false,state:"pending",commitment:prepared.commitment});
    expect(s.requests.filter(url=>url.endsWith("/status"))).toHaveLength(15);expect(s.posts).toBe(0);
    expect(await s.service.hasPreparedOperation(order,expected)).toBe(true);
  },20000);
  it("cancels automatic verification while preserving the uploaded candidate",async()=>{
    const s=server();await select("buyer");const prepared=await s.service.prepare(adapter,order,payload,expected,expiration());
    const controller=new AbortController(),fetch=s.fetch.getMockImplementation()!;
    s.fetch.mockImplementation(async(input,init)=>{
      if(String(input).endsWith("/status") && s.posts) {s.mode="pending";controller.abort();}
      return fetch(input,init);
    });
    await expect(s.service.resumeUpload(adapter,order,expected,{waitForReady:true,signal:controller.signal})).rejects.toThrow("cancelled");
    expect(s.posts).toBe(1);
    expect((await s.service.resumeUpload(adapter,order,expected)).commitment).toBe(prepared.commitment);
  });
  it("rejects altered signed objects during automatic verification",async()=>{
    const s=server();await select("buyer");await s.service.prepare(adapter,order,payload,expected,expiration());s.mode="bad-object";
    await expect(s.service.resumeUpload(adapter,order,expected,{waitForReady:true})).rejects.toThrow("uncertain");
    expect(s.posts).toBe(1);
    expect(await s.service.hasPreparedOperation(order,expected)).toBe(true);
  });
  it("stops verification when the account locks without another upload",async()=>{
    const s=server(),selected=await select("buyer");await s.service.prepare(adapter,order,payload,expected,expiration());
    const fetch=s.fetch.getMockImplementation()!;s.mode="pending";
    s.fetch.mockImplementation(async(input,init)=>{
      const response=await fetch(input,init);
      if(String(input).endsWith("/status")) await provider.lockWallet(selected.id);
      return response;
    });
    await expect(s.service.resumeUpload(adapter,order,expected,{waitForReady:true})).rejects.toThrow(/changed|locked/);
    expect(s.posts).toBe(0);expect(await s.service.hasPreparedOperation(order,expected)).toBe(true);
  });
  it("retains the candidate after an accepted POST times out and recovers without another upload", async () => {
    const s=server(); await select("buyer");
    const prepared=await s.service.prepare(adapter,order,payload,expected,expiration());
    s.mode="uncertain";
    await expect(s.service.resumeUpload(adapter,order,expected)).rejects.toThrow("uncertain");
    s.mode="normal";
    const recovered=await s.service.resumeUpload(adapter,order,expected);
    expect(recovered).toMatchObject({commitment:prepared.commitment,state:"active",ready:true}); expect(s.posts).toBe(1);
  });
  it("reposts identical bytes only after authoritative not-found", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    await s.service.resumeUpload(adapter,order,expected); s.forget();
    await s.service.resumeUpload(adapter,order,expected);
    expect(s.posts).toBe(2); expect(s.posted[0]).toBe(s.posted[1]);
  });
  it("does not POST while storage reports pending or expired", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    s.mode="pending"; expect(await s.service.resumeUpload(adapter,order,expected)).toMatchObject({state:"pending",ready:false});
    s.mode="expired"; expect(await s.service.resumeUpload(adapter,order,expected)).toMatchObject({state:"expired",ready:false});
    expect(s.posts).toBe(0);
  });
  it("requires signed-object read-back and rejects altered remote objects", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    expect((await s.service.resumeUpload(adapter,order,expected)).ready).toBe(false);
    s.mode="bad-object"; await expect(s.service.resumeUpload(adapter,order,expected)).rejects.toThrow("uncertain");
    expect(s.posts).toBe(1);
  });
  it("serializes concurrent preparation and upload across tabs", async () => {
    const s=server(); await select("buyer"); const expiry=expiration();
    const prepared=await Promise.all([s.service.prepare(adapter,order,payload,expected,expiry),s.service.prepare(adapter,order,payload,expected,expiry)]);
    expect(prepared[0].commitment).toBe(prepared[1].commitment); expect(operationEntries()).toHaveLength(1);
    await Promise.all([s.service.resumeUpload(adapter,order,expected),s.service.resumeUpload(adapter,order,expected)]);
    expect(s.posts).toBe(1);
    const changed=structuredClone(payload); if ("delivery" in changed.data) changed.data.delivery.fullName="Changed private delivery";
    await expect(s.service.prepare(adapter,order,changed,expected,expiry)).rejects.toThrow("different prepared");
  });
  it("fails closed without a deployment or confirmed retention policy", async () => {
    const s=server(); await select("buyer");
    const disabled=createTempoCommerceService({client:s.client,origins:fixture.origins});
    await expect(disabled.prepare(adapter,order,payload,expected,expiration())).rejects.toThrow("deployment");
    const noRetention=createTempoCommerceService({client:s.client,origins:fixture.origins,deployment:() => order.contractAddress});
    await expect(noRetention.prepare(adapter,order,payload,expected,expiration())).rejects.toThrow("retention");
    expect(operationEntries()).toHaveLength(0); expect(s.requests).toHaveLength(0);
  });
  it("rejects replay, wrong role, wrong commitment and untrusted origins before HTTP", async () => {
    const s=server(); await select("buyer"); const p=await s.service.prepare(adapter,order,payload,expected,expiration());
    await expect(s.service.receive(adapter,order,{...expected,sequence:2},"buyer",p.buyerEnvelope,p.sellerEnvelope,p.commitment)).rejects.toThrow("commitment");
    await expect(s.service.receive(adapter,order,expected,"seller",p.buyerEnvelope,p.sellerEnvelope,p.commitment)).rejects.toThrow("matching");
    const wrongOrigins=createTempoCommerceService({client:s.client,origins:{...fixture.origins,apiOrigin:"https://other.example"},deployment:() => order.contractAddress});
    await expect(wrongOrigins.receive(adapter,order,expected,"buyer",p.buyerEnvelope,p.sellerEnvelope,p.commitment)).rejects.toThrow("trusted origins");
    expect(s.requests).toHaveLength(0);
  });
  it("rejects tampered recovery, another author and another sequence", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    const file=await s.service.exportRecovery(order,expected),packet=JSON.parse(file);
    packet.encryptedPayload=packet.encryptedPayload.slice(0,-5)+"AAAA=";
    await expect(s.service.importRecovery(adapter,JSON.stringify(packet),order,expected)).rejects.toThrow("journal signature");
    await expect(s.service.importRecovery(adapter,file,order,{...expected,sequence:2})).rejects.toThrow();
    await select("seller"); await expect(s.service.importRecovery(adapter,file,order,expected)).rejects.toThrow("matching");
    expect(s.requests).toHaveLength(0);
  });
  it("invalidates signing work when the wallet locks and retains saved data if it locks during HTTP", async () => {
    const s=server(),wallet=await select("buyer"),original=adapter.signMessage.bind(adapter);
    vi.spyOn(adapter,"signMessage").mockImplementationOnce(async message => {const sig=await original(message); await provider.lockWallet(wallet.id); return sig;});
    await expect(s.service.prepare(adapter,order,payload,expected,expiration())).rejects.toThrow("locked");
    expect(operationEntries()).toHaveLength(0);
    vi.restoreAllMocks(); await provider.unlockWallet("moderato",wallet.id,password);
    await s.service.prepare(adapter,order,payload,expected,expiration());
    vi.spyOn(s.client,"recoverUpload").mockImplementationOnce(async () => {await provider.lockWallet(wallet.id); return {outcome:"not-found"};});
    await expect(s.service.resumeUpload(adapter,order,expected)).rejects.toThrow("locked");
    expect(operationEntries()).toHaveLength(1); expect(s.posts).toBe(0);
  });
  it("does not hide a persistence failure by starting an upload", async () => {
    const s=server(); await select("buyer");
    const idb=await import("idb-keyval"); vi.spyOn(idb,"set").mockRejectedValueOnce(new Error("disk full"));
    await expect(s.service.prepare(adapter,order,payload,expected,expiration())).rejects.toThrow("disk full");
    expect(s.requests).toHaveLength(0); expect(operationEntries()).toHaveLength(0);
  });
  it("retains deleted objects as terminal evidence without another POST", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    await s.service.resumeUpload(adapter,order,expected); s.mode="deleted";
    expect(await s.service.resumeUpload(adapter,order,expected)).toMatchObject({state:"deleted",ready:false});
    expect(s.posts).toBe(1);
  });
  it("validates encrypted service origins locally before downloading", async () => {
    const s=server(); await select("buyer"); const prepared=await s.service.prepare(adapter,order,payload,expected,expiration());
    const origins={apiOrigin:"https://other-api.example",downloadOrigin:"https://other-download.example"};
    const receiver=createTempoCommerceService({client:new ZkbytesClient({...origins,fetch:s.fetch}),origins,deployment:() => order.contractAddress});
    await expect(receiver.receive(adapter,order,expected,"buyer",prepared.buyerEnvelope,prepared.sellerEnvelope,prepared.commitment)).rejects.toThrow("Unsupported zkbytes service origins");
    expect(s.requests).toHaveLength(0);
  });
  it("invalidates work if the current deployment changes during signing", async () => {
    const s=server(); await select("buyer"); let deployment:string|null=order.contractAddress;
    const service=createTempoCommerceService({client:s.client,origins:fixture.origins,deployment:() => deployment,maxRetentionSeconds:7*86400});
    const original=adapter.signMessage.bind(adapter),signatures:Uint8Array[]=[];
    vi.spyOn(adapter,"signMessage").mockImplementationOnce(async message => {const sig=await original(message); signatures.push(sig); deployment=null; return sig;});
    await expect(service.prepare(adapter,order,payload,expected,expiration())).rejects.toThrow("deployment changed");
    expect(signatures[0].every(byte => byte === 0)).toBe(true); expect(operationEntries()).toHaveLength(0);
  });
  it("requires durable progress before POST and leaves the original candidate intact on disk failure", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    const file=await s.service.exportRecovery(order,expected),idb=await import("idb-keyval");
    vi.spyOn(idb,"set").mockRejectedValue(new Error("disk full"));
    await expect(s.service.resumeUpload(adapter,order,expected)).rejects.toThrow("disk full");
    expect(s.posts).toBe(0); expect(await s.service.exportRecovery(order,expected)).toBe(file);
  });
  it("authenticates the journal writer even though the receiving encryption key is public", async () => {
    const s=server(); await select("buyer"); await s.service.prepare(adapter,order,payload,expected,expiration());
    const packet=JSON.parse(await s.service.exportRecovery(order,expected));
    packet.signature=fixture.examples[0].item.itemSignature.value;
    await expect(s.service.importRecovery(adapter,JSON.stringify(packet),order,expected)).rejects.toThrow("journal signature");
    expect(s.requests).toHaveLength(0);
  });
});
