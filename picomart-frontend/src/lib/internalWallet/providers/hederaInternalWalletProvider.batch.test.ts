import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  AccountAllowanceApproveTransaction, BatchTransaction, Client, ContractExecuteTransaction,
  PrivateKey, TopicMessageSubmitTransaction, Transaction,
} from '@hiero-ledger/sdk'
import {hederaInternalWalletProvider} from './hederaInternalWalletProvider'
import {getHederaClient} from '@/lib/hedera/hederaClient'
import * as store from '@/lib/internalWallet/store'
import type {InternalWalletRecord} from '@/lib/internalWallet/types'
import type {TransactionPayload} from '@/context/wallet/types'

vi.mock('@/lib/hedera/hederaClient', () => ({getHederaClient: vi.fn()}))
vi.mock('@/lib/internalWallet/store')
vi.mock('@/config', async importOriginal => {
  const actual = await importOriginal<typeof import('@/config')>();
  const {getLegacyHederaConfig} = await import('@/testFixtures/legacyHederaConfig');
  return {...actual, getConfig: getLegacyHederaConfig};
})

const key = PrivateKey.generateECDSA()
const payer = '0.0.1234'
let client: Client

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', {getItem: () => 'testnet'})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({account: payer, balance: {balance: 100_000_000}}),
  }))
  client = Client.forNetwork({'127.0.0.1:50211': '0.0.3'})
  vi.mocked(getHederaClient).mockReturnValue({sdkClient: client} as ReturnType<typeof getHederaClient>)
  vi.mocked(store.getActiveWalletId).mockResolvedValue('test-wallet')
  vi.mocked(store.getWalletRecord).mockResolvedValue({
    id: 'test-wallet', providerId: 'hedera-internal', chain: 'hedera',
    baseIdentity: {evmAddress: `0x${key.publicKey.toEvmAddress()}`}, networkStates: {},
  } as InternalWalletRecord)
  vi.mocked(store.getCachedUnlockedSecret).mockReturnValue({
    privateKeyHex: key.toStringRaw(), importedAs: 'privateKey',
  })
})

afterEach(() => {
  client.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('signed token payment batch', () => {
  it.each(['0.0.7565091', '0x01b6d4a28bf0300ce1dbe039a762bf28278f199b'])(
    'serializes a native allowance for contract %s before the sole contract call', async spender => {
      // Exceeds Number.MAX_SAFE_INTEGER to catch accidental numeric rounding.
      const amount = 9_007_199_254_740_993n
      const payloads: TransactionPayload[] = [
        {type: 'hcs', data: {topicId: '0.0.456', message: new Uint8Array([1, 2, 3])}},
        {type: 'tokenAllowance', data: {tokenId: '0.0.429274', spender, amount}},
        {type: 'contract', data: {contractId: spender, function: 'createOrderPaid', arguments: [], amount: 0n}},
      ]
      const stopBeforeNetwork = new Error('Captured signed batch before network submission')
      let signedBatch: BatchTransaction | undefined
      vi.spyOn(BatchTransaction.prototype, 'execute').mockImplementation(async function (this: BatchTransaction) {
        signedBatch = Transaction.fromBytes(this.toBytes()) as BatchTransaction
        throw stopBeforeNetwork
      })

      await expect(hederaInternalWalletProvider.getWalletAdapter('testnet').executeBatch(payloads))
        .rejects.toThrow(stopBeforeNetwork)

      expect(signedBatch).toBeInstanceOf(BatchTransaction)
      const batch = signedBatch!
      expect(key.publicKey.verifyTransaction(batch)).toBe(true)
      const inner = batch.innerTransactions
      expect(inner).toHaveLength(3)
      expect(inner[0]).toBeInstanceOf(TopicMessageSubmitTransaction)
      expect(inner[1]).toBeInstanceOf(AccountAllowanceApproveTransaction)
      expect(inner[2]).toBeInstanceOf(ContractExecuteTransaction)
      for (const transaction of inner) {
        expect(transaction.batchKey?.toString()).toBe(key.publicKey.toString())
        expect(key.publicKey.verifyTransaction(transaction)).toBe(true)
      }
      const approvals = (inner[1] as AccountAllowanceApproveTransaction).tokenApprovals
      expect(approvals).toHaveLength(1)
      expect(approvals[0].tokenId.toString()).toBe('0.0.429274')
      expect(approvals[0].ownerAccountId?.toString()).toBe(payer)
      if (spender.startsWith('0x')) {
        expect(approvals[0].spenderAccountId?.toEvmAddress()).toBe(spender.slice(2))
      } else {
        expect(approvals[0].spenderAccountId?.toString()).toBe(spender)
      }
      expect(approvals[0].amount?.toString()).toBe(amount.toString())
      expect((inner[2] as ContractExecuteTransaction).payableAmount?.toTinybars().toString()).toBe('0')
    },
  )
})
