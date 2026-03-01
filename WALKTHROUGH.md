# EWA Protocol — Walkthrough

## What Was Built

Privacy-preserving Earned Wage Access protocol on Monad × Unlink. Borrowers prove payroll eligibility via signed attestations without revealing salary or employer. Loans auto-repay from payroll deposits.

## Deliverables

### Smart Contracts (5 files, all compiling)
| Contract | Key Features |
|---|---|
| AttestationRegistry.sol | ECDSA signature verification, employer registry, revocation, 30-day TTL |
| EWALending.sol | Borrow, repay, payroll auto-deduction, 4 schemes, liquidation |
| PayrollRouter.sol | Auto-deducts loan from employer payroll, forwards remainder |
| ReputationTracker.sol | Amount-weighted scoring (0-100), bigger loans = bigger rep changes |
| InterestCalculator.sol | Math library for 4 interest schemes |

### Scripts (3 files)
| Script | Purpose |
|---|---|
| deploy.ts | Deploys all contracts, links them, funds pool |
| issue-attestation.ts | Simulates Plaid/Argyle attestation signing |
| simulate-payroll.ts | Simulates employer payroll deposit + auto-deduction |

### Tests — 27/27 Passing ✅
```
✔ AttestationRegistry (5 tests) — valid/invalid signer, employer check, expiry, revocation
✔ Borrowing (5 tests) — all schemes, rejection cases, collateral
✔ Payroll Auto-Deduction (4 tests) — full deduction, installment, no-loan, underfunded
✔ Manual Repayment (2 tests) — full and partial
✔ Reputation (4 tests) — initial score, amount-weighted increase/decrease
✔ Interest Calculation (4 tests) — all 4 schemes, dynamic rate
✔ Liquidation (3 tests) — overdue, too-early rejection, collateral seizure
```

### Frontend (React + Vite + TypeScript)
- **Build**: ✅ Successful
- **Components**: OnboardingFlow, BorrowFlow, RepayFlow, Dashboard
- **Unlink SDK**: Implemented `UnlinkProvider`, `useInteract`, and `useUnlink` for local private wallet generation and fully shielded borrowing/repayments.
- Premium dark-mode with glassmorphism, mesh gradients, SVG reputation meter

### Root Files
- IMPLEMENTATION_PLAN.md — Full architecture doc
- README.md — Setup + usage guide
- .env.example — Environment template

## Next Steps
1. Add your private key to `.env`
2. Get MON from [faucet.unlink.xyz](https://faucet.unlink.xyz)
3. Deploy: `npx hardhat run scripts/deploy.ts --network monad`
4. Update frontend contract addresses in `frontend/src/config/contracts.ts`
5. Run `npx hardhat run scripts/issue-attestation.ts --network monad` for attestation demo
6. Run frontend: `cd frontend && npm run dev`
