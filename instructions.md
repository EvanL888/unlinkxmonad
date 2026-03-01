# EWA Protocol — Developer Instructions

> Privacy-preserving Earned Wage Access on **Monad × Unlink**

---

## Prerequisites

- **Node.js** v18+
- **npm** (comes with Node)
- **MetaMask** browser extension
- A wallet with **Monad Testnet MON** — get it from [https://faucet.monad.xyz](https://faucet.monad.xyz)
- Unlink testnet tokens — get them from [https://faucet.unlink.xyz](https://faucet.unlink.xyz)

---

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd unlinkxmonad

# Install Hardhat dependencies (smart contracts)
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

---

## 2. Configure Environment

Create a `.env` file in the project root:

```
PRIVATE_KEY=<your_deployer_wallet_private_key>
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

> ⚠️ **NEVER commit your private key.** The deployer wallet also becomes the attestation provider for the MVP.

---

## 3. Compile Smart Contracts

```bash
npx hardhat compile
```

This compiles 5 contracts in `contracts/`:

| Contract | Purpose |
|----------|---------|
| `AttestationRegistry.sol` | Stores employment attestation proofs |
| `ReputationTracker.sol` | On-chain borrower reputation scores |
| `EWALending.sol` | Core lending pool with confidential borrow/repay |
| `PayrollRouter.sol` | Employer payroll deposits + auto loan deductions |
| `InterestCalculator.sol` | Interest rate computation library |

---

## 4. Deploy to Monad Testnet

```bash
npx hardhat run scripts/deploy.ts --network monad
```

This will:
1. Deploy all 4 core contracts
2. Link `ReputationTracker` → `EWALending`
3. Register a demo employer (`Acme Corp`)
4. Fund the lending pool with **1.0 MON** liquidity
5. Write all addresses to `deployed-addresses.json`

**Save the output!** You'll see something like:
```
✅ AttestationRegistry deployed: 0x8B21...
✅ ReputationTracker deployed:   0x9a1F...
✅ EWALending deployed:          0x9B9A...
✅ PayrollRouter deployed:       0x89Da...
```

---

## 5. Update Frontend Contract Addresses

Open `frontend/src/config/contracts.ts` and paste the 4 addresses from `deployed-addresses.json`:

```typescript
export const CONTRACTS = {
    attestationRegistry: '<address from deployed-addresses.json>',
    reputationTracker: '<address from deployed-addresses.json>',
    ewaLending: '<address from deployed-addresses.json>',
    payrollRouter: '<address from deployed-addresses.json>',
};
```

The Unlink constants are already configured:
```typescript
export const UNLINK_POOL_ADDRESS = '0x0813da0a10328e5ed617d37e514ac2f6fa49a254';
export const MON_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
```

---

## 6. Issue Your Wallet an Attestation

Before you can borrow, your wallet needs a valid employment attestation. Run:

```bash
BORROWER_ADDRESS=<your_metamask_wallet_address> npx hardhat run scripts/issue-attestation.ts --network monad
```

If `BORROWER_ADDRESS` is not set, it defaults to the deployer's own address.

You should see:
```
✅ Attestation registered!
Is valid: true
```

---

## 7. Start the Frontend

```bash
cd frontend
npm run dev
```

The app launches at **http://localhost:5173** (Vite dev server).

---

## 8. Using the App (User Flow)

### Step 1: Onboarding
1. Click **"Connect MetaMask"** — approve the connection
2. Click **"Create Private Wallet"** — generates your Unlink shielded wallet locally
3. **Deposit MON** into the Unlink Privacy Pool (e.g. 0.05 MON) — this shields your balance
4. **Switch to Monad Testnet** if prompted
5. Click **"Submit Attestation Proof"** — verifies your employment attestation on-chain

### Step 2: Borrow
1. Select a loan amount (up to your available credit)
2. Choose a repayment scheme
3. Click **"Borrow X MON"**
4. The Unlink Adapter privately calls `borrowConfidential` and reshields the MON into your private balance

### Step 3: Repay
1. Go to the **Repay** tab
2. Select an active loan
3. Enter a repayment amount (between 0.01 and remaining balance)
4. Click **"Pay"** — spends shielded MON via the Unlink Relayer

### Step 4: Dashboard
- View your **Reputation Score**, **Active Loans**, **Available Credit**, and **🔒 Shielded Balance**
- All loan data is stored locally — the blockchain only has encrypted commitment hashes

---

## Unlink Integration Details

| Resource | Value |
|----------|-------|
| Network | Monad Testnet |
| Chain ID | `10143` |
| Gateway URL | `https://api.unlink.xyz` |
| Pool Address | `0x0813da0a10328e5ed617d37e514ac2f6fa49a254` |
| MON Token | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |

**SDK Packages:**
- `@unlink-xyz/react` — React hooks (`useUnlink`, `useDeposit`, `useInteract`, `useTxStatus`, `useUnlinkBalances`)
- `@unlink-xyz/core` — Utilities (`buildCall`, `approve`, `contract`)

**Privacy Flow:**
```
User → useInteract() → Unlink Adapter (unshield → execute → reshield) → Relayer submits tx
```

The **Relayer** appears as `msg.sender` on the block explorer, **not** the user's wallet.

---

## Project Structure

```
unlinkxmonad/
├── contracts/                  # Solidity smart contracts
│   ├── EWALending.sol          # Core lending (borrowConfidential, repayConfidential)
│   ├── AttestationRegistry.sol # Employment proof verification
│   ├── ReputationTracker.sol   # On-chain reputation scores
│   ├── PayrollRouter.sol       # Employer payroll + auto-deductions
│   └── InterestCalculator.sol  # Interest computation
├── scripts/
│   ├── deploy.ts               # Full deployment script
│   └── issue-attestation.ts    # Attestation issuance for testing
├── frontend/
│   └── src/
│       ├── App.tsx             # Main app state + tab routing
│       ├── main.tsx            # Entry point (wraps with UnlinkProvider)
│       ├── config/
│       │   └── contracts.ts    # Addresses, ABIs, Unlink constants
│       └── components/
│           ├── OnboardingFlow.tsx   # Wallet + Unlink setup + attestation
│           ├── BorrowFlow.tsx       # Private borrowing via useInteract
│           ├── RepayFlow.tsx        # Private repayment via useInteract
│           └── Dashboard.tsx        # Stats + shielded balance display
├── hardhat.config.ts           # Hardhat config (Monad network)
├── deployed-addresses.json     # Auto-generated after deploy
├── .env                        # PRIVATE_KEY + MONAD_RPC_URL
└── package.json                # Root package (Hardhat scripts)
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No valid attestation` when borrowing | Run the attestation script for your wallet address (Step 6) |
| `Insufficient liquidity` | The pool needs more MON — call `depositLiquidity()` or redeploy |
| Unlink wallet not found | Clear localStorage and re-create from onboarding |
| `rate limit` errors from RPC | Wait a few seconds and retry — Monad testnet has rate limits |
| Contract ABI mismatch | Re-compile and check `contracts.ts` matches the deployed contract |

---

## Useful Commands

```bash
# Compile contracts
npx hardhat compile

# Deploy to Monad Testnet
npx hardhat run scripts/deploy.ts --network monad

# Issue attestation for a specific wallet
BORROWER_ADDRESS=0x... npx hardhat run scripts/issue-attestation.ts --network monad

# Start frontend dev server
cd frontend && npm run dev

# Open Hardhat console (for manual contract interaction)
npx hardhat console --network monad

# Run tests (local Hardhat network)
npx hardhat test
```
