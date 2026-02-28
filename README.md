# EWA Protocol — Private Earned Wage Access on Monad × Unlink

> Privacy-preserving earned wage access. Borrow against verified payroll without revealing salary, employer, or history.

## Quick Start

### Prerequisites
- Node.js 18+
- MetaMask wallet
- MON from [faucet.unlink.xyz](https://faucet.unlink.xyz)

### 1. Install & Compile
```bash
npm install
npx hardhat compile
```

### 2. Run Tests (27 tests, all passing)
```bash
npx hardhat test
```

### 3. Deploy to Monad Testnet
```bash
cp .env.example .env
# Edit .env with your PRIVATE_KEY
npx hardhat run scripts/deploy.ts --network monad
```

### 4. Issue Attestation & Simulate Payroll
```bash
npx hardhat run scripts/issue-attestation.ts --network monad
npx hardhat run scripts/simulate-payroll.ts --network monad
```

### 5. Run Frontend
```bash
cd frontend
npm install
npm run dev
```

## Architecture

| Contract | Purpose |
|---|---|
| `AttestationRegistry` | Stores ECDSA-signed payroll attestations, employer registry |
| `EWALending` | Core lending pool — borrow, repay, interest, liquidation |
| `PayrollRouter` | Auto-deducts loan repayment from employer payroll deposits |
| `ReputationTracker` | Amount-weighted reputation scoring (0-100) |
| `InterestCalculator` | Interest math for 4 repayment schemes |

## How It Works

1. **Onboard**: Verify employment via Plaid/Argyle (simulated in MVP) → signed attestation registered on-chain
2. **Borrow**: Request advance → protocol sends MON directly to borrower
3. **Payday**: Employer deposits payroll → PayrollRouter auto-deducts loan → forwards remainder
4. **Reputation**: On-time repayments build score → lower future rates

## Repayment Schemes

| Scheme | Rate | Deduction |
|---|---|---|
| Single Paycheck | 2% flat | Full amount from next payroll |
| Installments | 5% APR | Split over 2 paydays |
| Deposit-Backed | 1% flat | Collateral-secured |
| Dynamic Interest | 3-8% APR | Reputation-based rate |

## Privacy

- **Salary**: Never on-chain. Only boolean claims (e.g. "salary ≥ $3k")
- **Employer**: Hashed on-chain. Name stays off-chain
- **Borrowing history**: Private via Unlink shielded pool
- **Payroll amounts**: Only totals visible through router

## Tech Stack

- **Chain**: Monad L1 (testnet, chain ID 10143)
- **Contracts**: Solidity 0.8.24, Hardhat
- **Privacy**: Unlink SDK for shielded transactions
- **Frontend**: React 18 + Vite + TypeScript
- **Attestation**: ECDSA signed claims (Plaid/Argyle in production)

---

*Built for the Monad × Unlink hackathon*
