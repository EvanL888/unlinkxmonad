/**
 * Contract configuration — addresses and ABIs for deployed EWA Protocol contracts.
 * Update addresses after running `npx hardhat run scripts/deploy.ts --network monad`
 */

// After deploying, paste the addresses from deployed-addresses.json here
export const CONTRACTS = {
    attestationRegistry: '0xC4E40134639D5De36E980FB00ADA7762E333a4F1',
    reputationTracker: '0xCB1Bc4ABA062eb10eC6c4Ca0205A6c4d3bc0399F',
    ewaLending: '0x4df67c35290CDFa93538c24d86F34b339607fA92',
    payrollRouter: '0x36B498340389081b8747B93D407F852770932051',
};

export const MONAD_CHAIN_ID = 10143;
export const MONAD_RPC = 'https://testnet-rpc.monad.xyz';

// Unlink Privacy Pool constants
export const UNLINK_POOL_ADDRESS = '0x0813da0a10328e5ed617d37e514ac2f6fa49a254';
export const MON_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const EWA_LENDING_ABI = [
    'function borrowConfidential(uint256 _amount, bytes32 _commitmentHash, bytes calldata _encryptedData, address _borrower, address _recipient) external',
    'function repayConfidential(bytes32 _nullifierHash, bytes calldata _proof) external payable',
    'function maxLoanAmount() external view returns (uint256)',
    'function totalLiquidity() external view returns (uint256)',
    'event ConfidentialLoanCreated(bytes32 indexed commitmentHash, bytes encryptedLoanData)',
    'event ConfidentialLoanRepaid(bytes32 indexed nullifierHash)',
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
