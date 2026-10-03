import {beforeEach, describe, expect, it, vi} from "vitest";
import {bytesToHex, verifyMessage} from "viem";
import {ZkbytesClient, type StorageItem} from "@zkbytes/sdk";
import {tempoInternalWalletProvider as provider, createTempoWalletTransactions} from "./providers/tempoInternalWalletProvider";
import {setInternalWalletUnlockHandler} from "./unlockGate";
import {loadWalletRecords, lockWalletSession} from "./store";
import {decryptPrivateData} from "./crypto";
import {decryptTempoProof, downloadTempoProof, exportTempoProof, importTempoProof, prepareTempoProof, TEMPO_PROOF_TEXT, uploadTempoProof} from "./tempoRecoveryProof";

const db = vi.hoisted(() => new Map<string, unknown>());
// Disabled-commerce tests must not depend on the developer's local Vite settings.
vi.mock('@/lib/tempoDeployment',()=>({TEMPO_UI_DEPLOYMENT:{address:'0x3c91183f0454eab6eff6f570ac402be278dbd6f4',block:37694566},TEMPO_UI_ENABLED:false}));
vi.mock("idb-keyval", () => ({get: async (key: string) => structuredClone(db.get(key)), set: async (key: string, value: unknown) => { db.set(key, structuredClone(value)); }}));
vi.mock("@picomart/order-protocol/tempo-contract",async(importOriginal)=>{const actual=await importOriginal<typeof import("@picomart/order-protocol/tempo-contract")>();const {keccak256}=await import("ethers");return {...actual,PICOMART_TEMPO_BUILD:{...actual.PICOMART_TEMPO_BUILD,runtimeBytecodeHash:keccak256("0x6000")}};});
const password = "test-only passphrase";
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const network = "moderato";
const adapter = provider.getWalletAdapter(network);
const restore = () => provider.importWallet(network, {passphrase: password, mnemonic});
beforeEach(async () => { for (const record of await loadWalletRecords()) lockWalletSession(record.id); db.clear(); setInternalWalletUnlockHandler(null); vi.unstubAllEnvs(); });

describe("Tempo local wallet and recovery", () => {
  it("restores the standard Ethereum address, signs EIP-191, and persists no plaintext secrets", async () => {
    const wallet = await restore();
    expect(wallet.identity.evmAddress.toLowerCase()).toBe("0x9858effd232b4033e47d90003d41ec34ecaeda94");
    const signature = bytesToHex(await adapter.signMessage("Picomart test"));
    expect(await verifyMessage({address: wallet.identity.evmAddress as `0x${string}`, message: "Picomart test", signature})).toBe(true);
    expect(JSON.stringify([...db.values()])).not.toContain(mnemonic);
    expect(JSON.stringify([...db.values()])).not.toContain(password);
    expect(wallet.canTransact).toBe(false);
  });
  it("creates a 24-word phrase and reproduces its address after removing the local record", async () => {
    const wallet = await provider.createWallet(network, {passphrase: password});
    const backup = (await provider.revealBackup(wallet.id))[0];
    expect(backup.value.split(" ")).toHaveLength(24);
    await provider.removeWallet(network, wallet.id);
    const restored = await provider.importWallet(network, {passphrase: password, mnemonic: backup.value});
    expect(restored.identity.evmAddress).toBe(wallet.identity.evmAddress);
  });
  it("rejects wrong passwords and restores a private-key backup without a phrase", async () => {
    const input = "0x" + "01".padStart(64, "0");
    const wallet = await provider.importWallet(network, {passphrase: password, privateKey: input});
    await provider.lockWallet(wallet.id);
    await expect(provider.unlockWallet(network, wallet.id, "wrong password")).rejects.toThrow("Incorrect passphrase");
    await provider.unlockWallet(network, wallet.id, password);
    expect((await provider.revealBackup(wallet.id))[0]).toMatchObject({kind: "privateKey", value: input});
  });
  it("rejects invalid recovery material, duplicate addresses, and unsupported networks", async () => {
    await expect(provider.createWallet("mainnet", {passphrase: password})).rejects.toThrow("Moderato");
    await expect(provider.importWallet(network, {passphrase: password, mnemonic: "invalid phrase"})).rejects.toThrow("BIP-39");
    await expect(provider.importWallet(network, {passphrase: password, privateKey: "0".repeat(64)})).rejects.toThrow();
    await restore();
    await expect(restore()).rejects.toThrow("already exists");
    await expect(adapter.executeBatch([])).rejects.toThrow("not enabled");
  });
  it("keeps Hedera records out of the Tempo wallet list", async () => {
    await restore();
    const records = await loadWalletRecords();
    const key = [...db.keys()].find(k => k.endsWith("records_v2"))!;
    db.set(key, [...records, {...records[0], id: "hedera-only", providerId: "hedera-internal", chain: "hedera"}]);
    expect(await provider.listWallets(network)).toHaveLength(1);
    await expect(provider.activateWallet(network, "hedera-only")).rejects.toThrow("not found");
  });
  it("invalidates a queued unlock when the wallet locks again", async () => {
    const wallet = await restore();
    await provider.lockWallet(wallet.id);
    let release!: (value: string) => void;
    let started!: () => void;
    const requested = new Promise<void>(resolve => { started = resolve; });
    setInternalWalletUnlockHandler(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const pending = adapter.signMessage("Queued action");
    const rejected = expect(pending).rejects.toThrow("changed or locked");
    await requested;
    await provider.lockWallet(wallet.id);
    release(password);
    await rejected;
    expect((await provider.getActiveWallet(network))?.locked).toBe(true);
  });
  it("locks a previous account on activation and disconnect", async () => {
    const first = await restore();
    const second = await provider.createWallet(network, {passphrase: password});
    expect((await provider.listWallets(network)).find(w => w.id === first.id)?.locked).toBe(true);
    await provider.disconnect(network);
    expect(await provider.getActiveWallet(network)).toBeNull();
    expect((await provider.listWallets(network)).find(w => w.id === second.id)?.locked).toBe(true);
  });
  it("reproduces the receiving identity and decrypts the retained object after wallet and file restoration", async () => {
    const original = await restore();
    const proof = await prepareTempoProof(adapter, null);
    const file = await exportTempoProof(proof, password);
    expect(JSON.stringify(file)).not.toContain(proof.item.seed);
    expect(JSON.stringify(file)).not.toContain(proof.receivingPublicKey);
    await provider.removeWallet(network, original.id);
    const restored = await restore();
    expect(restored.identity.evmAddress).toBe(original.identity.evmAddress);
    const recovered = await importTempoProof(file, password);
    expect(recovered.item).toEqual(proof.item);
    expect(await decryptTempoProof(adapter, recovered)).toBe(TEMPO_PROOF_TEXT);
    await expect(importTempoProof(file, "wrong password")).rejects.toThrow("Incorrect passphrase");
    const different = await provider.createWallet(network, {passphrase: password});
    await expect(decryptTempoProof(adapter, recovered)).rejects.toThrow("same Tempo");
    await provider.removeWallet(network, different.id);
  });
  it("rejects altered ciphertext, an unknown format and hostile KDF parameters", async () => {
    await restore();
    const proof = await prepareTempoProof(adapter, null);
    const altered = structuredClone(proof.item);
    altered.encryptedPayload = altered.encryptedPayload.slice(0, -4) + "AAAA";
    await expect(decryptTempoProof(adapter, proof, altered)).rejects.toThrow();
    const file = await exportTempoProof(proof, password);
    await expect(importTempoProof({...file, format: "v99"}, password)).rejects.toThrow("Invalid");
    await expect(decryptPrivateData({...file.encrypted, kdf: {...file.encrypted.kdf, memorySize: 1_000_000_000}}, password)).rejects.toThrow("Unsupported");
  });
  it("changes the wallet password while retaining its signing address", async () => {
    const wallet = await restore();
    await provider.changePassphrase(network, wallet.id, {currentPassphrase: password, nextPassphrase: "new test password"});
    await provider.lockWallet(wallet.id);
    await expect(provider.unlockWallet(network, wallet.id, password)).rejects.toThrow("Incorrect");
    expect((await provider.unlockWallet(network, wallet.id, "new test password")).identity.evmAddress).toBe(wallet.identity.evmAddress);
  });
  it("recovers a hosted object after a lost upload response without preparing or uploading again", async () => {
    await restore();
    let stored: StorageItem | null = null;
    let uploads = 0;
    const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") { uploads++; stored = JSON.parse(String(init.body)); throw new Error("Response lost after acceptance"); }
      if (url.endsWith("/status")) return stored
        ? Response.json({seed: stored.seed, state: "active", createdAt: new Date().toISOString(), expiresAt: stored.expiresAt})
        : Response.json({error: {code: "OBJECT_NOT_FOUND", message: "Not found"}}, {status: 404});
      return Response.json(stored);
    });
    const client = new ZkbytesClient({apiOrigin: "https://proof.test", downloadOrigin: "https://download.proof.test", fetch: transport});
    const proof = await prepareTempoProof(adapter, client);
    await expect(uploadTempoProof(adapter, proof, client)).rejects.toThrow("request failed");
    const originalItem = structuredClone(proof.item);
    expect(await uploadTempoProof(adapter, proof, client)).toContain("recovered and decrypted");
    expect(await downloadTempoProof(adapter, proof, client)).toBe(TEMPO_PROOF_TEXT);
    expect(uploads).toBe(1);
    expect(proof.item).toEqual(originalItem);
    expect(stored).toEqual(proof.item);
  });
  it("retains a pending upload and prevents a second POST", async () => {
    await restore();
    const transport = vi.fn(async (input: string | URL | Request) => Response.json({seed: String(input).split("/").at(-2), state: "pending"}, {status: 202}));
    const client = new ZkbytesClient({apiOrigin: "https://proof.test", downloadOrigin: "https://download.proof.test", fetch: transport});
    const proof = await prepareTempoProof(adapter, client);
    expect(await uploadTempoProof(adapter, proof, client)).toContain("pending");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

 describe("Tempo provider transaction boundary",()=>{
  it("keeps the default commerce facade disabled and inherited payloads rejected",async()=>{
    const current=await restore();const isolated=provider.getWalletAdapter(network);expect(isolated.tempo).toBeDefined();
    await expect(isolated.tempo!.approve(1n,{operationId:"gated",expectedAccount:current.identity.evmAddress})).rejects.toThrow("not enabled");
    await expect(isolated.executeContract({contractId:"0.0.1",function:"confirmOrder",arguments:[]})).rejects.toThrow("not enabled");
  });
  it("signs through the unlocked vault without exposing keys to transaction persistence",async()=>{
    const current=await restore();const {JsonRpcProvider,Network,FeeData,Interface,Transaction}=await import("ethers");const rpc=new JsonRpcProvider("https://readonly.test");
    const deployment={address:"0x3c91183f0454eab6eff6f570ac402be278dbd6f4",block:37694566};
    const abi=new Interface(["function userTokens(address) view returns(address)","function balanceOf(address) view returns(uint256)"]);
    vi.stubGlobal("navigator",{locks:{request:async(_name:string,work:()=>Promise<unknown>)=>work()}});
    vi.spyOn(rpc,"getNetwork").mockResolvedValue(Network.from(42431));vi.spyOn(rpc,"getCode").mockResolvedValue("0x6000");vi.spyOn(rpc,"estimateGas").mockResolvedValue(100000n);vi.spyOn(rpc,"getFeeData").mockResolvedValue(new FeeData(null,1000000000n,0n));vi.spyOn(rpc,"getTransactionCount").mockResolvedValue(7);
    vi.spyOn(rpc,"call").mockImplementation(async request=>String(request.data).startsWith(abi.getFunction("userTokens")!.selector)?abi.encodeFunctionResult("userTokens",["0x0000000000000000000000000000000000000000"]):abi.encodeFunctionResult("balanceOf",[1000000n]));
    let hash:string|undefined;vi.spyOn(rpc,"broadcastTransaction").mockImplementation(async raw=>{const signed=Transaction.from(raw as string);expect(signed.from?.toLowerCase()).toBe(current.identity.evmAddress.toLowerCase());hash=signed.hash!;return {hash} as Awaited<ReturnType<typeof rpc.broadcastTransaction>>;});
    vi.spyOn(rpc,"getTransactionReceipt").mockImplementation(async()=>hash?{status:1,blockNumber:123,fee:100n,from:current.identity.evmAddress,to:"0x20c0000000000000000000000000000000000000"} as Awaited<ReturnType<typeof rpc.getTransactionReceipt>>:null);vi.spyOn(rpc,"waitForTransaction").mockResolvedValue(null);
    const transactions=createTempoWalletTransactions({rpc,deployment:()=>deployment});const receipt=await transactions.approve(10000n,{operationId:"provider-signature",expectedAccount:current.identity.evmAddress});expect(receipt.state).toBe("confirmed");
    const saved=[...db.entries()].filter(([key])=>key.includes("tempo_transaction")||key.includes("contract_test_tx"));expect(JSON.stringify(saved)).not.toContain(mnemonic);expect(JSON.stringify(saved)).not.toContain("privateKey");
    await provider.lockWallet(current.id);await expect(transactions.approve(10000n,{operationId:"locked",expectedAccount:current.identity.evmAddress})).rejects.toThrow("unlock");rpc.destroy();vi.unstubAllGlobals();
  });
});
