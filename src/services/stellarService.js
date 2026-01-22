/* eslint-disable no-undef */
/* eslint-disable prettier/prettier */
import { Server } from 'stellar-sdk/rpc'

const server = new Server('https://horizon-testnet.stellar.org')

/**
 * Checks the status of the Stellar network
 * @returns {Promise<Object>} Object containing network status information
 * @throws {Error} If the Stellar network is unreachable
 */
export async function getNetworkStatus() {
  const startTime = Date.now()

  try {
    // Get the latest ledger to check connectivity
    const latestLedger = await server.ledgers().order("desc").limit(1).call()

    const responseTime = Date.now() - startTime

    if (!latestLedger.records || latestLedger.records.length === 0) {
      throw new Error("No ledger records returned from Stellar network")
    }

    const ledgerNum = latestLedger.records[0].sequence
    const networkPassphrase = StellarSdk.Networks.TESTNET
    const networkName = networkPassphrase === StellarSdk.Networks.TESTNET ? "Testnet" : "Public"

    return {
      isConnected: true,
      networkName,
      currentLedger: ledgerNum,
      responseTime,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    throw new Error(`Failed to connect to Stellar network: ${error.message} (${responseTime}ms)`)
  }
}

export async function submitTransaction(memoText) {
  const secret = process.env.STELLAR_SECRET_KEY
  if (!secret) throw new Error('STELLAR_SECRET_KEY is not set')
  const keypair = StellarSdk.Keypair.fromSecret(secret)
  const account = await server.loadAccount(keypair.publicKey())
  const fee = await server.fetchBaseFee()

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee,
    networkPassphrase: StellarSdk.Networks.TESTNET,
    memo: StellarSdk.Memo.text(memoText),
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: keypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "0",
      }),
    )
    .setTimeout(30)
    .build()

  transaction.sign(keypair)
  const txResult = await server.submitTransaction(transaction)
  return txResult.hash
}

export async function fetchMemoFromTransaction(txHash) {
  const tx = await server.transactions().transaction(txHash).call()
  return tx.memo
}

export default {
  submitTransaction,
  fetchMemoFromTransaction,
  getNetworkStatus,
}
