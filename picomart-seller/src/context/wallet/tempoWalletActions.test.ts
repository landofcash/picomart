import {describe,expect,it,vi} from "vitest";
import {createTempoTransactionService} from "@/lib/internalWallet/tempoTransactions";
import {wrapWalletAdapterWithWalletAction} from "./wrapWalletAdapterWithWalletAction";
import type {WalletAdapter} from "./types";
const account="0x"+"11".repeat(20);
function adapter():WalletAdapter{return {chain:"tempo",id:"tempo-internal",name:"test",getAddress:async()=>account,connect:async()=>account,disconnect:async()=>{},signMessage:async()=>new Uint8Array(),executeContract:async()=>({hash:"unused"}),executeBatch:async()=>({hash:"unused"}),tempo:createTempoTransactionService({wallet:{capture:async()=>{throw new Error("Not used");},assert:async()=>{},sign:async()=>{throw new Error("Not used");}}})};}
describe("Tempo wallet action wrapper",()=>{
 it("preserves read/recovery methods and forwards reviewed transaction options",async()=>{
  const base=adapter(),end=vi.fn(),onStart=vi.fn(()=>end),record={hash:"0x"+"22".repeat(32),account,nonce:0,method:"approve",state:"confirmed" as const};
  const write=vi.spyOn(base.tempo!,"approve").mockResolvedValue(record),read=vi.spyOn(base.tempo!,"allowance").mockResolvedValue("10000");const wrapped=wrapWalletAdapterWithWalletAction(base,{onStart}),options={operationId:"intent",expectedAccount:account};
  expect(await wrapped.tempo!.allowance(account)).toBe("10000");expect(read).toHaveBeenCalledWith(account);expect(onStart).not.toHaveBeenCalled();
  expect(await wrapped.tempo!.approve(10000n,options)).toBe(record);expect(write).toHaveBeenCalledWith(10000n,options);expect(onStart).toHaveBeenCalledWith("executeContract",expect.any(String));expect(end).toHaveBeenCalledOnce();
 });
 it("ends the wallet action when a Tempo payment fails",async()=>{
  const base=adapter(),end=vi.fn(),onStart=vi.fn(()=>end);vi.spyOn(base.tempo!,"payOrder").mockRejectedValue(new Error("Approval required"));const wrapped=wrapWalletAdapterWithWalletAction(base,{onStart});
  await expect(wrapped.tempo!.payOrder({method:"buyOrder",args:[]},{operationId:"intent",expectedAccount:account})).rejects.toThrow("Approval required");expect(end).toHaveBeenCalledOnce();
 });
});
