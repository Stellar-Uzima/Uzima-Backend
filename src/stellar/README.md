# Stellar Module

Utilities for Stellar/Soroban network interactions used by the Uzima backend.

## Services

| Service | Description |
|---|---|
| `StellarService` | Account existence checks and balance queries via Horizon |
| `PriceFeedService` | XLM/USD price feed with caching |
| `XlmPriceService` | XLM price helper |
| `SorobanAuthService` | Soroban authorization type detection (Ed25519 vs Smart Wallet) |

---

## SorobanAuthService

Decodes a base64-encoded `SorobanAuthorizationEntry` XDR and determines whether it
carries an **Ed25519** or **Smart Wallet** authorization.

### Supported Authorization Types

| Type | Credential | Description |
|---|---|---|
| `Ed25519` | `sorobanCredentialsSourceAccount` | Classic Stellar source-account signature |
| `Ed25519` | `sorobanCredentialsAddress` → `scAddressTypeAccount` | Ed25519 key wrapped in an address credential |
| `SmartWallet` | `sorobanCredentialsAddress` → `scAddressTypeContract` | Contract acts as the signer |

### Detection Logic

1. Decode the XDR using `xdr.SorobanAuthorizationEntry.fromXDR(payload, 'base64')`.
2. Inspect `credentials().switch().name`:
   - `'sorobanCredentialsSourceAccount'` → **Ed25519** (no address info).
   - `'sorobanCredentialsAddress'` → examine the nested `ScAddress`:
     - `scAddressTypeAccount` → **Ed25519**, public key extracted via `StrKey.encodeEd25519PublicKey`.
     - `scAddressTypeContract` → **SmartWallet**, contract ID extracted via `StrKey.encodeContract`.
3. Any other credential type or malformed XDR throws an `Error`.

### API

```typescript
interface SorobanAuthResult {
  authorizationType: 'Ed25519' | 'SmartWallet';
  publicKey?: string;              // G… Stellar address (Ed25519 only)
  contractId?: string;             // C… contract address (SmartWallet only)
  signatureExpirationLedger?: number;
}

service.decodeAuthorizationEntry(authEntryXdrBase64: string): SorobanAuthResult
```

### Output Examples

**Ed25519 (source-account)**
```json
{
  "authorizationType": "Ed25519"
}
```

**Ed25519 (address credential)**
```json
{
  "authorizationType": "Ed25519",
  "publicKey": "GCFYRR57USYMII3FM4LIBNGIWPRA55LF7SOT52IQ5XCZMHBZQTDD7FHW",
  "signatureExpirationLedger": 1000
}
```

**Smart Wallet**
```json
{
  "authorizationType": "SmartWallet",
  "contractId": "CDPN5XW633PN5XW633PN5XW633PN5XW633PN5XW633PN5XW633PN4I4N",
  "signatureExpirationLedger": 2000
}
```

### Error Handling

| Condition | Thrown message |
|---|---|
| Empty or non-string input | `Invalid authorization payload: must be a non-empty string` |
| XDR decode failure | `Malformed authorization payload: failed to decode XDR` |
| Unknown credential type | `Unknown authorization credential type: <name>` |
