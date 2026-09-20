// Read-only live verification. Does not load .env, sign or send transactions.
const fs=require('node:fs/promises');
const path=require('node:path');
const {Contract,JsonRpcProvider,keccak256,hexlify,toUtf8String,ZeroAddress}=require('ethers');
const protocol=require('@picomart/order-protocol/tempo-protocol');
const {PICOMART_TEMPO_ABI,PICOMART_TEMPO_BUILD}=require('@picomart/order-protocol/tempo-contract');
const ADDRESS='0x3c91183f0454eab6eff6f570ac402be278dbd6f4';
const TOKEN='0x20c0000000000000000000000000000000000000';
const ADMIN='0xa7965ff717af7a9689930bf8b438080e1d7ffaca';
const DEPLOYER='0xc295fd4dcef05cd7ea3923c7ff47e58ed64f9ace';
const START=37694566;
const TX='0x28422e389427929b397b27f74c20ab7fc3c177b1d1b5645361c8dc16d1f0491d';
const equal=(a,b,label)=>{if(String(a).toLowerCase()!==String(b).toLowerCase())throw new Error(`Verification mismatch: ${label}`);};
const base64=key=>Buffer.from(key.slice(2),'hex').toString('base64');
function identity(role,account,id,key){return protocol.createTempoReceivingIdentity(protocol.createTempoReceivingContext({version:1,profile:'picomart-receiving-v1',chainId:42431,contractAddress:ADDRESS,account:account.toLowerCase(),role,...(role==='buyer'?{orderSeed:protocol.tempoIdToSeed(id)}:{catalogSeed:protocol.tempoIdToSeed(id)})}),base64(key));}
async function main(){
 const rpc=new JsonRpcProvider('https://rpc.moderato.tempo.xyz');
 try {
 equal((await rpc.getNetwork()).chainId,42431,'chain');
 const head=await rpc.getBlockNumber(),at={blockTag:head};
 const c=new Contract(ADDRESS,PICOMART_TEMPO_ABI,rpc);
 const token=new Contract(TOKEN,['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)'],rpc);
 equal(keccak256(await rpc.getCode(ADDRESS,head)),PICOMART_TEMPO_BUILD.runtimeBytecodeHash,'runtime');
 const artifact=JSON.parse(await fs.readFile(path.join(__dirname,'../artifacts/contracts/Picomart.sol/Picomart.json'),'utf8'));
 const deployment=await rpc.getTransaction(TX),receipt=await rpc.getTransactionReceipt(TX);
 if(!deployment||!receipt)throw new Error('Deployment evidence missing');
 equal(receipt.status,1,'deployment receipt status');equal(receipt.blockNumber,START,'deployment block');equal(receipt.contractAddress,ADDRESS,'deployment address');equal(deployment.from,DEPLOYER,'deployer');
 const creation=c.interface.encodeDeploy([ADMIN,TOKEN]);equal(deployment.data,artifact.bytecode+creation.slice(2),'creation bytecode and constructor arguments');
 equal(keccak256(artifact.bytecode),PICOMART_TEMPO_BUILD.creationBytecodeHash,'creation build hash');
 equal(await c.owner(at),ADMIN,'owner');equal(await c.pendingOwner(at),ZeroAddress,'pending owner');
 equal(await c.STAGE_WINDOW(at),432000,'five-day stage');equal(await c.MAX_LIFECYCLE(at),1728000,'twenty-day horizon');equal(await c.TARGET_RETENTION(at),2592000,'thirty-day target');equal(await c.allowedPaymentTokens(TOKEN,at),true,'PathUSD allowlist');
 equal(await token.name(at),'PathUSD','token name');equal(await token.symbol(at),'PathUSD','token symbol');equal(await token.decimals(at),6,'token decimals');
 const logs=[];for(let start=START;start<=head;start+=2000){logs.push(...await rpc.getLogs({address:ADDRESS,fromBlock:start,toBlock:Math.min(start+1999,head)}));}
 logs.sort((a,b)=>a.blockNumber-b.blockNumber||a.transactionIndex-b.transactionIndex||a.index-b.index);
 const counts={},orders=new Map(),catalogs=new Map(),transactions=new Set(),blockTimes=new Map();
 const timestamp=async number=>{if(!blockTimes.has(number)){const b=await rpc.getBlock(number);if(!b)throw new Error('Event block missing');blockTimes.set(number,b.timestamp);}return blockTimes.get(number);};
 let messageCount=0;
 for(const log of logs){const event=c.interface.parseLog(log);if(!event)throw new Error('Unknown contract event');const a=event.args;counts[event.name]=(counts[event.name]??0)+1;transactions.add(log.transactionHash);
 if(event.name==='CatalogCreated'||event.name==='CatalogUpdated'){
   const prev=catalogs.get(a.catalogId),seller=event.name==='CatalogCreated'?a.seller:prev?.seller;if(!seller)throw new Error('Catalog update without creation');
   const snapshot=identity('seller',seller,a.catalogId,a.publicKey);equal(snapshot.identityId,a.identityId,'catalog receiving identity');catalogs.set(a.catalogId,{seller,sellerPublicKey:a.publicKey,sellerIdentityId:a.identityId,catalogUrl:a.url});
 }else if(event.name==='CatalogDeleted'){catalogs.delete(a.catalogId);
 }else if(event.name==='OrderCreated'){
   const catalog=catalogs.get(a.catalogId);if(!catalog)throw new Error('Order catalog missing at creation');equal(catalog.seller,a.seller,'order seller');equal(catalog.sellerPublicKey,a.sellerPublicKey,'order seller key');equal(catalog.sellerIdentityId,a.sellerIdentityId,'order seller identity');
   const buyerIdentity=identity('buyer',a.buyer,a.orderId,a.buyerPublicKey),sellerIdentity=identity('seller',a.seller,a.catalogId,a.sellerPublicKey);
   equal(buyerIdentity.identityId,a.buyerIdentityId,'buyer identity');equal(sellerIdentity.identityId,a.sellerIdentityId,'seller identity');
   const time=await timestamp(log.blockNumber);equal(a.deadline,BigInt(time+432000),'creation deadline');
   orders.set(a.orderId,{catalogId:a.catalogId,priceAmount:a.amount,priceToken:a.token,seller:a.seller,buyer:a.buyer,payer:ZeroAddress,buyerPublicKey:a.buyerPublicKey,sellerPublicKey:a.sellerPublicKey,buyerIdentityId:a.buyerIdentityId,sellerIdentityId:a.sellerIdentityId,buyerCommitment:'0x'+'00'.repeat(32),sellerCommitment:'0x'+'00'.repeat(32),status:1,createdTs:time,updatedTs:time,deadline:time+432000,deleted:false,context:protocol.TempoOrderContextSchema.parse({version:1,chainId:42431,contractAddress:ADDRESS,catalogSeed:protocol.tempoIdToSeed(a.catalogId),orderSeed:protocol.tempoIdToSeed(a.orderId),buyerIdentity,sellerIdentity})});
 }else if(event.name==='OrderMessage'){
   const o=orders.get(a.orderId);if(!o)throw new Error('Message without order');
   const type={1:'buyer-order',2:'seller-delivery',3:'seller-refusal'}[Number(a.messageType)];if(!type)throw new Error('Invalid message type');
   const expected={messageType:type,sequence:Number(a.sequence)},binding=protocol.createTempoMessageBinding(o.context,expected);
   equal(binding.author,a.author,'message author');equal(expected.sequence,1,'message sequence');
   const commitment=protocol.tempoReferenceCommitment(binding,toUtf8String(a.buyerEnvelope),toUtf8String(a.sellerEnvelope),o.context,expected);equal(commitment,a.commitment,'encrypted reference commitment');
   if(type==='buyer-order')o.buyerCommitment=commitment;else o.sellerCommitment=commitment;messageCount++;
 }else if(event.name.startsWith('Order')){
   const o=orders.get(a.orderId);if(!o)throw new Error('Lifecycle event without order');
   if(event.name==='OrderDeleted'){equal(o.status,a.finalState,'deletion final state');o.deleted=true;continue;}
   const states={OrderPaid:2,OrderDelivering:3,OrderCompleted:4,OrderRefundRequested:5,OrderRefundedToBuyer:6,OrderRefundedToSeller:7,OrderCanceled:8};
   if(states[event.name]===undefined)throw new Error('Unknown lifecycle event');o.status=states[event.name];o.updatedTs=await timestamp(log.blockNumber);
   o.deadline=[2,3,5].includes(o.status)?o.updatedTs+432000:0;
   if(event.name==='OrderPaid'){o.payer=a.payer;equal(a.deadline,BigInt(o.deadline),'payment deadline');}
 }
 }
 const methods={},receiptSummary=[];
 for(const hash of transactions){const [tx,r]=await Promise.all([rpc.getTransaction(hash),rpc.getTransactionReceipt(hash)]);if(!tx||!r)throw new Error('Observed transaction receipt missing');equal(r.status,1,'observed transaction status');if(tx.to?.toLowerCase()===ADDRESS){const method=c.interface.parseTransaction({data:tx.data,value:tx.value})?.name??'unknown';methods[method]=(methods[method]??0)+1;receiptSummary.push({transactionHash:hash,method,from:tx.from,block:r.blockNumber,status:r.status});}}
 const orderSummary=[];let expectedEscrow=0n;
 for(const [id,o] of orders){equal(await c.consumedOrderIds(id,at),true,'consumed order ID');const actual=await c.getOrder(id,at);
 if(o.deleted){equal(actual.version,0,'deleted order version');equal(actual.status,0,'deleted order state');}
 else {equal(actual.version,1,'order version');for(const field of ['catalogId','priceAmount','priceToken','seller','buyer','payer','buyerPublicKey','sellerPublicKey','buyerIdentityId','sellerIdentityId','buyerCommitment','sellerCommitment','status','createdTs','updatedTs','deadline'])equal(actual[field],o[field],`order ${field}`);}
 if(!o.deleted&&[2,3,5].includes(o.status)){equal(o.priceToken,TOKEN,'funded token');expectedEscrow+=o.priceAmount;}
 orderSummary.push({orderId:id,status:o.status,deleted:o.deleted,priceAmount:o.priceAmount.toString(),buyer:o.buyer,seller:o.seller,payer:o.payer});
 }
 for(const [id,expected] of catalogs){const actual=await c.catalogs(id,at);for(const field of ['seller','sellerPublicKey','sellerIdentityId','catalogUrl'])equal(actual[field],expected[field],`catalog ${field}`);}
 const escrow=await c.escrowedAmounts(TOKEN,at),balance=await token.balanceOf(ADDRESS,at);equal(escrow,expectedEscrow,'escrow equals live funded orders');if(balance<escrow)throw new Error('Token balance does not cover escrow');
 const simulations=[];
 for(const [label,from,name,args,error] of [['deployer cannot administer tokens',DEPLOYER,'setPaymentTokenAllowed',[TOKEN,true],'OwnableUnauthorizedAccount'],['owner cannot renounce administration',ADMIN,'renounceOwnership',[],'InvalidInput']]){
  try{await rpc.call({to:ADDRESS,from,data:c.interface.encodeFunctionData(name,args),blockTag:head});throw new Error(`Expected revert missing: ${label}`);}catch(e){let decoded;try{decoded=c.interface.parseError(e.data??'0x')?.name;}catch{}equal(decoded,error,label);simulations.push({check:label,revert:decoded});}
 }
 const report={verifiedAt:new Date().toISOString(),chainId:42431,contract:ADDRESS,throughBlock:head,readOnly:true,checksPassed:true,runtimeBytecodeHash:PICOMART_TEMPO_BUILD.runtimeBytecodeHash,owner:ADMIN,pendingOwner:ZeroAddress,stageWindowSeconds:432000,maximumDecisionHorizonSeconds:1728000,targetRetentionSeconds:2592000,token:TOKEN,tokenName:'PathUSD',tokenDecimals:6,deploymentTransaction:TX,deploymentBlock:START,eventCounts:counts,successfulMethods:methods,checkedMessageCommitments:messageCount,orders:orderSummary,activeCatalogCount:catalogs.size,escrowBaseUnits:escrow.toString(),contractTokenBalanceBaseUnits:balance.toString(),simulations,transactions:receiptSummary,explorerSourceVerification:false,limitations:['Read-only calls and event/state reconciliation; no new transactions were sent.','Only recorded successful methods are live evidence; unobserved flows remain pending.','Message commitment/envelope checks apply only to observed OrderMessage events; consult checkedMessageCommitments. Private decryption was not performed.','Transfer-policy diversion/rejection and five-day timeout execution are not established by this report.']};
 const file=path.join(__dirname,'../deployments/moderato-readonly-verification.json');await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{rpc.destroy();}
}
main().catch(e=>{console.error(e.shortMessage??e.message);process.exitCode=1;});
