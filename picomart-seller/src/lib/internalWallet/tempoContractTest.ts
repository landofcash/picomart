import {get,set} from "idb-keyval";
import {Contract, Interface, JsonRpcProvider, getBytes, hexlify, keccak256, toUtf8Bytes, type FunctionFragment, type Log} from "ethers";
import {PICOMART_TEMPO_CONFIG} from "@picomart/order-protocol/tempo";
import {PICOMART_TEMPO_ABI, PICOMART_TEMPO_BUILD} from "@picomart/order-protocol/tempo-contract";
import {createTempoWalletTransactions} from "./providers/tempoInternalWalletProvider";
import {tempoTransactionError, type TempoTransactionRecord} from "./tempoTransactions";

// Dedicated test deployment. Shared commerce configuration remains inactive.
export const TEST_CONTRACT = "0x3c91183f0454eAB6eFf6F570AC402bE278Dbd6f4";
export const TEST_BLOCK = 37694566;
export const TEST_TOKEN = "0x20C0000000000000000000000000000000000000";
export const testRpc = new JsonRpcProvider(PICOMART_TEMPO_CONFIG.rpcUrl);
export const contractInterface = new Interface(PICOMART_TEMPO_ABI);
export const tokenInterface = new Interface([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address account,address spender) view returns (uint256)",
]);
export const testContract = new Contract(TEST_CONTRACT, contractInterface, testRpc);
export const testToken = new Contract(TEST_TOKEN, tokenInterface, testRpc);
export const json = (value:unknown) => JSON.stringify(value, (_key,v) => typeof v === "bigint" ? v.toString() : v, 2);
export const messageBytes = (text:string) => hexlify(toUtf8Bytes(text));
export const publicKeyBytes = (key:string) => hexlify(Uint8Array.from(atob(key), c => c.charCodeAt(0)));
export const publicKeyBase64 = (key:string) => btoa(String.fromCharCode(...getBytes(key)));
export const functions = (abi:Interface) => abi.fragments.filter((f):f is FunctionFragment => f.type === "function");
export const namedResult = (outputs:readonly {name:string}[], result:readonly unknown[]) => Object.fromEntries(outputs.map((o,i) => [o.name || String(i),result[i]]));
export type TestTransaction=TempoTransactionRecord;
export const testTransactions=createTempoWalletTransactions({rpc:testRpc,deployment:()=>({address:TEST_CONTRACT,block:TEST_BLOCK})});
export const pendingTransaction=testTransactions.pending;
export const refreshTransaction=testTransactions.recover;
export async function testOrderLogs(eventName:"OrderCreated"|"OrderMessage",orderId:string):Promise<Log[]> {
  if(!/^0x[0-9a-fA-F]{32}$/.test(orderId)) throw new Error("Enter a raw bytes16 order ID.");
  const latest=await testRpc.getBlockNumber(), logs:Log[]=[];
  const topics=[contractInterface.getEvent(eventName)!.topicHash,`0x${orderId.slice(2).padEnd(64,"0")}`];
  for(let start=TEST_BLOCK;start<=latest;start+=2000) logs.push(...await testRpc.getLogs({address:TEST_CONTRACT,fromBlock:start,toBlock:Math.min(start+1999,latest),topics}));
  return logs;
}
export async function assertTestDeployment() {
  if (Number((await testRpc.getNetwork()).chainId) !== 42431) throw new Error("Test RPC must be Moderato chain 42431.");
  if (keccak256(await testRpc.getCode(TEST_CONTRACT)) !== PICOMART_TEMPO_BUILD.runtimeBytecodeHash) throw new Error("Test deployment runtime does not match the prepared ABI/build.");
}
export const testError=tempoTransactionError;
export async function submitTestTransaction(target:"contract"|"token", method:string, args:unknown[], signal:AbortSignal, onSaved:(tx:TestTransaction)=>void, operationId:string, expectedAccount:string, beforeSign?:()=>Promise<void>) {
  const options={operationId,expectedAccount,signal,onSaved,beforeSign};
  if(target==="contract")return testTransactions.sendContract({method,args},options);
  if(method==="approve"){if(String(args[0]).toLowerCase()!==TEST_CONTRACT.toLowerCase())throw new Error("PathUSD approvals must target the verified Picomart contract.");return testTransactions.approve(BigInt(String(args[1])),options);}
  if(method==="transfer")return testTransactions.transfer(String(args[0]),BigInt(String(args[1])),options);
  throw new Error("Select a supported nonpayable write method.");
}

export async function testOperationId(account:string,target:"contract"|"token",method:string,args:unknown[],fresh=false){
  const abi=target==="contract"?contractInterface:tokenInterface;
  const key=`picomart_tempo_test_intent_v1_${account.toLowerCase()}_${target}_${keccak256(abi.encodeFunctionData(method,args))}`;
  if(!navigator.locks)throw new Error("Web Locks are required for stable test operations.");
  return navigator.locks.request(key,async()=>{const existing=await get<string>(key);if(existing&&!fresh)return existing;const id=crypto.randomUUID();await set(key,id);return id;});
}
