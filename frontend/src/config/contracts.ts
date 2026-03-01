/**
 * Contract configuration — addresses and ABIs for deployed EWA Protocol contracts.
 * Update addresses after running `npx hardhat run scripts/deploy.ts --network monad`
 */

// After deploying, paste the addresses from deployed-addresses.json here
export const CONTRACTS = {
    attestationRegistry: '0xAb8c74Fb7c89556329631831b636C580BaCb3C48',
    reputationTracker: '0x8aAb133030E78e364F82f01Cee42e8B742A6747c',
    ewaLending: '0x48B61BD657A09f6A34B12FC95d73C75d006A37e6',
    payrollRouter: '0x75e1Af7D407A5527F732ab703cB3050eC19CB8BD',
};

export const MONAD_CHAIN_ID = 10143;
export const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

// Minimal ABIs — only the functions used by the frontend
export const EWA_LENDING_ABI = [
    'function borrow(uint256 amount, uint8 scheme) external',
    'function borrowWithCollateral(uint256 borrowAmount) external payable',
    'function repay(uint256 loanId) external payable',
    'function getLoan(uint256 loanId) external view returns (tuple(uint256 id, address borrower, uint256 principal, uint256 interest, uint256 totalOwed, uint256 totalRepaid, uint8 scheme, uint256 numInstallments, uint256 installmentsPaid, uint256 createdAt, uint256 dueDate, uint8 status, uint256 collateral))',
    'function getActiveLoans(address borrower) external view returns (tuple(uint256 id, address borrower, uint256 principal, uint256 interest, uint256 totalOwed, uint256 totalRepaid, uint8 scheme, uint256 numInstallments, uint256 installmentsPaid, uint256 createdAt, uint256 dueDate, uint8 status, uint256 collateral)[])',
    'function getOutstandingObligation(address borrower) external view returns (uint256)',
    'function getBorrowerLoanCount(address borrower) external view returns (uint256)',
    'function maxLoanAmount() external view returns (uint256)',
    'function totalLiquidity() external view returns (uint256)',
    'event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 interest, uint8 scheme)',
    'event LoanFullyRepaid(uint256 indexed loanId)',
    'event PayrollRepayment(address indexed borrower, uint256 amountApplied, uint256 loansAffected)',
];

export const ATTESTATION_REGISTRY_ABI = [
    'function registerAttestation(bytes32 attestationHash, bytes32 employerHash, uint256 expiry, bytes signature) external',
    'function isValid(address borrower) external view returns (bool)',
    'function attestations(address) external view returns (bytes32 attestationHash, bytes32 employerHash, uint256 issuedAt, uint256 expiresAt, bool revoked)',
];

export const REPUTATION_TRACKER_ABI = [
    'function getReputation(address borrower) external view returns (uint256)',
];

export const PAYROLL_ROUTER_ABI = [
    'function getNextPayday(address employee) external view returns (uint256)',
    'function isRegistered(address employee) external view returns (bool)',
    'event PayrollProcessed(address indexed employee, uint256 totalDeposit, uint256 deducted, uint256 forwarded)',
];

export const REPAYMENT_SCHEMES = [
    {
        id: 0,
        name: 'Single Paycheck',
        description: 'Full repayment from your next payday',
        rate: '2% flat fee',
        deductionDesc: '100% deducted from next payroll',
    },
    {
        id: 1,
        name: 'Installments',
        description: '2 equal payments over 2 pay periods',
        rate: '5% APR prorated',
        deductionDesc: '50% deducted each payday',
    },
    {
        id: 2,
        name: 'Deposit-Backed',
        description: 'Lock collateral for a lower rate',
        rate: '1% flat fee',
        deductionDesc: 'Normal deduction; collateral on release',
    },
    {
        id: 3,
        name: 'Dynamic Interest',
        description: 'Rate adjusts with your reputation',
        rate: '3%–8% APR',
        deductionDesc: 'Full deduction, reputation-based rate',
    },
];
