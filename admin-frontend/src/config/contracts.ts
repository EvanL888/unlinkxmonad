/**
 * Contract configuration — addresses and ABIs for deployed EWA Protocol contracts.
 * Update addresses after running `npx hardhat run scripts/deploy.ts --network monad`
 */

// After deploying, paste the addresses from deployed-addresses.json here
export const CONTRACTS = {
    attestationRegistry: "0xdab7aa8F75F6Df707eA7E2f9176D389a0E76cF3a",
    reputationTracker: "0x61Aa97a972F3c36D99BdCC3458f4AfF97FfAdC47",
    ewaLending: "0xc594e8A50ecE126EACC4975E95D5771D43b4BBA3",
    payrollRouter: "0x2aB089dbe4bc34ef89CfF748DB44350D3561040B",
};

export const MONAD_CHAIN_ID = 10143;
export const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

export const EWA_LENDING_ABI = [
    'function borrowConfidential(uint256 _amount, uint256 _totalOwed, bytes32 _commitmentHash, bytes calldata _encryptedData) external',
    'function repayConfidential(address _borrower, bytes32 _nullifierHash, bytes calldata _proof) external payable',
    'function maxLoanAmount() external view returns (uint256)',
    'function totalLiquidity() external view returns (uint256)',
    'event ConfidentialLoanCreated(bytes32 indexed commitmentHash, bytes encryptedLoanData)',
    'event ConfidentialLoanRepaid(bytes32 indexed nullifierHash)',
];

export const ATTESTATION_REGISTRY_ABI = [
    'function registerAttestation(bytes32 attestationHash, bytes32 employerHash, uint256 expiry, bytes signature) external',
    'function registerEmployer(bytes32 _employerHash) external',
    'function isValid(address borrower) external view returns (bool)',
    'function attestations(address) external view returns (bytes32 attestationHash, bytes32 employerHash, uint256 issuedAt, uint256 expiresAt, bool revoked)',
];

export const REPUTATION_TRACKER_ABI = [
    'function getReputation(address borrower) external view returns (uint256)',
];

export const PAYROLL_ROUTER_ABI = [
    'function registerEmployee(address _employee, address _lendingContract) external',
    'function depositPayroll(address _employee, bytes32 _nullifier, bytes calldata _proof) external payable',
    'function setNextPayday(address _employee, uint256 _timestamp) external',
    'function getNextPayday(address employee) external view returns (uint256)',
    'function isRegistered(address employee) external view returns (bool)',
    'function getLastPayrollReceived(address employee) external view returns (uint256)',
    'function owner() external view returns (address)',
    'event EmployeeRegistered(address indexed employee, address lendingContract)',
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
