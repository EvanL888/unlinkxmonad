/**
 * Contract configuration — addresses and ABIs for deployed EWA Protocol contracts.
 * Update addresses after running `npx hardhat run scripts/deploy.ts --network monad`
 */

// After deploying, paste the addresses from deployed-addresses.json here
export const CONTRACTS = {
    attestationRegistry: '0xA29bB151B4BFD9C9f45F3Cf121670e1D17a3e9A7',
    reputationTracker: '0xf99F6E0E08cd5A0Ad00DAE385DA0BfC00e802FC1',
    ewaLending: '0x90DA606F934aAa7db7c08feC128f02f8888Df223',
    payrollRouter: '0xf670DBDDB899c633310eD6576f238f8DA8b63F11',
};

export const MONAD_CHAIN_ID = 10143;
export const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

export const EWA_LENDING_ABI = [
    'function borrowConfidential(uint256 _amount, bytes32 _commitmentHash, bytes calldata _encryptedData) external',
    'function repayConfidential(bytes32 _nullifierHash, bytes calldata _proof) external payable',
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
    'function depositPayroll(address _employee, uint256 _deductionAmount, bytes32 _nullifier, bytes calldata _proof) external payable',
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
