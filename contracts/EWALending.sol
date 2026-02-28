// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AttestationRegistry.sol";
import "./ReputationTracker.sol";
import "./InterestCalculator.sol";

/**
 * @title EWALending
 * @notice Core lending pool for Earned Wage Access.
 *         Protocol-funded (we are the bank). Borrowers draw against verified payroll.
 *         Repayment happens automatically via PayrollRouter deductions.
 */
contract EWALending {
    using InterestCalculator for uint256;

    // ─── Types ───────────────────────────────────────────────────────────
    enum RepaymentScheme {
        SinglePaycheck,
        Installments,
        DepositBacked,
        DynamicInterest
    }

    enum LoanStatus {
        Active,
        Repaid,
        Defaulted
    }

    struct Loan {
        uint256 id;
        address borrower;
        uint256 principal;
        uint256 interest;
        uint256 totalOwed;
        uint256 totalRepaid;
        RepaymentScheme scheme;
        uint256 numInstallments;      // Total installments (for Installment scheme)
        uint256 installmentsPaid;     // Installments paid so far
        uint256 createdAt;
        uint256 dueDate;              // Final due date
        LoanStatus status;
        uint256 collateral;           // For DepositBacked scheme
    }

    // ─── State ───────────────────────────────────────────────────────────
    address public owner;
    AttestationRegistry public attestationRegistry;
    ReputationTracker public reputationTracker;
    address public payrollRouter; // Only PayrollRouter can call repayFromPayroll

    uint256 public maxLoanAmount = 5 ether;  // Max per loan (5 MON)
    uint256 public defaultTermDays = 30;     // Default loan term
    uint256 public totalLiquidity;

    uint256 private _nextLoanId = 1;

    // borrower => array of loan IDs
    mapping(address => uint256[]) public borrowerLoanIds;
    // loanId => Loan
    mapping(uint256 => Loan) public loans;

    // ─── Events ──────────────────────────────────────────────────────────
    event LiquidityDeposited(address indexed provider, uint256 amount);
    event LoanCreated(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint256 interest,
        RepaymentScheme scheme
    );
    event LoanRepaid(uint256 indexed loanId, uint256 amountPaid, uint256 remaining);
    event LoanFullyRepaid(uint256 indexed loanId);
    event LoanDefaulted(uint256 indexed loanId);
    event PayrollRepayment(address indexed borrower, uint256 amountApplied, uint256 loansAffected);

    // ─── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyPayrollRouter() {
        require(msg.sender == payrollRouter, "Not payroll router");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor(
        address _attestationRegistry,
        address _reputationTracker
    ) {
        owner = msg.sender;
        attestationRegistry = AttestationRegistry(_attestationRegistry);
        reputationTracker = ReputationTracker(_reputationTracker);
    }

    // ─── Admin ───────────────────────────────────────────────────────────
    function setPayrollRouter(address _router) external onlyOwner {
        payrollRouter = _router;
    }

    function setMaxLoanAmount(uint256 _max) external onlyOwner {
        maxLoanAmount = _max;
    }

    function depositLiquidity() external payable onlyOwner {
        require(msg.value > 0, "Zero deposit");
        totalLiquidity += msg.value;
        emit LiquidityDeposited(msg.sender, msg.value);
    }

    // ─── Borrowing ───────────────────────────────────────────────────────

    /**
     * @notice Borrow MON against verified payroll attestation.
     * @param _amount   Amount to borrow (in wei)
     * @param _scheme   Repayment scheme
     */
    function borrow(uint256 _amount, RepaymentScheme _scheme) external {
        require(attestationRegistry.isValid(msg.sender), "No valid attestation");
        require(_amount > 0 && _amount <= maxLoanAmount, "Invalid loan amount");
        require(totalLiquidity >= _amount, "Insufficient liquidity");
        require(!_hasDelinquentLoan(msg.sender), "Has delinquent loan");

        // Calculate interest
        uint256 reputation = reputationTracker.getReputation(msg.sender);
        uint256 termDays = defaultTermDays;
        uint256 numInstallments = 1;

        if (_scheme == RepaymentScheme.Installments) {
            numInstallments = 2; // Default 2 installments for MVP
            termDays = defaultTermDays * numInstallments;
        }

        uint256 interest = InterestCalculator.calculateInterest(
            _amount,
            InterestCalculator.RepaymentScheme(uint8(_scheme)),
            reputation,
            termDays
        );

        uint256 totalOwed = _amount + interest;

        // Create loan
        uint256 loanId = _nextLoanId++;
        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            principal: _amount,
            interest: interest,
            totalOwed: totalOwed,
            totalRepaid: 0,
            scheme: _scheme,
            numInstallments: numInstallments,
            installmentsPaid: 0,
            createdAt: block.timestamp,
            dueDate: block.timestamp + (termDays * 1 days),
            status: LoanStatus.Active,
            collateral: 0
        });

        borrowerLoanIds[msg.sender].push(loanId);
        totalLiquidity -= _amount;

        // Transfer MON to borrower
        (bool success,) = payable(msg.sender).call{value: _amount}("");
        require(success, "Transfer failed");

        emit LoanCreated(loanId, msg.sender, _amount, interest, _scheme);
    }

    /**
     * @notice Borrow with collateral deposit (DepositBacked scheme).
     */
    function borrowWithCollateral(uint256 _borrowAmount) external payable {
        require(msg.value > 0, "No collateral");
        require(msg.value >= _borrowAmount / 2, "Collateral must be >= 50% of loan");

        // Use the borrow logic but with collateral
        require(attestationRegistry.isValid(msg.sender), "No valid attestation");
        require(_borrowAmount > 0 && _borrowAmount <= maxLoanAmount, "Invalid loan amount");
        require(totalLiquidity >= _borrowAmount, "Insufficient liquidity");
        require(!_hasDelinquentLoan(msg.sender), "Has delinquent loan");

        uint256 reputation = reputationTracker.getReputation(msg.sender);
        uint256 interest = InterestCalculator.calculateInterest(
            _borrowAmount,
            InterestCalculator.RepaymentScheme.DepositBacked,
            reputation,
            defaultTermDays
        );

        uint256 totalOwed = _borrowAmount + interest;
        uint256 loanId = _nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            principal: _borrowAmount,
            interest: interest,
            totalOwed: totalOwed,
            totalRepaid: 0,
            scheme: RepaymentScheme.DepositBacked,
            numInstallments: 1,
            installmentsPaid: 0,
            createdAt: block.timestamp,
            dueDate: block.timestamp + (defaultTermDays * 1 days),
            status: LoanStatus.Active,
            collateral: msg.value
        });

        borrowerLoanIds[msg.sender].push(loanId);
        totalLiquidity -= _borrowAmount;

        (bool success,) = payable(msg.sender).call{value: _borrowAmount}("");
        require(success, "Transfer failed");

        emit LoanCreated(loanId, msg.sender, _borrowAmount, interest, RepaymentScheme.DepositBacked);
    }

    // ─── Repayment ───────────────────────────────────────────────────────

    /**
     * @notice Manual/early repayment for a specific loan.
     */
    function repay(uint256 _loanId) external payable {
        Loan storage loan = loans[_loanId];
        require(loan.borrower == msg.sender, "Not loan owner");
        require(loan.status == LoanStatus.Active, "Loan not active");
        require(msg.value > 0, "Zero payment");

        _applyRepayment(loan, msg.value);
    }

    /**
     * @notice Called by PayrollRouter to auto-deduct from payroll.
     *         Applies payment across all active loans for the borrower.
     */
    function repayFromPayroll(address _borrower) external payable onlyPayrollRouter {
        require(msg.value > 0, "Zero payment");

        uint256 remaining = msg.value;
        uint256 loansAffected = 0;

        uint256[] storage loanIds = borrowerLoanIds[_borrower];
        for (uint256 i = 0; i < loanIds.length && remaining > 0; i++) {
            Loan storage loan = loans[loanIds[i]];
            if (loan.status != LoanStatus.Active) continue;

            uint256 owed = loan.totalOwed - loan.totalRepaid;
            uint256 payment = remaining >= owed ? owed : remaining;

            _applyRepayment(loan, payment);
            remaining -= payment;
            loansAffected++;
        }

        // Return any excess to borrower
        if (remaining > 0) {
            (bool success,) = payable(_borrower).call{value: remaining}("");
            require(success, "Excess return failed");
        }

        emit PayrollRepayment(_borrower, msg.value - remaining, loansAffected);
    }

    /**
     * @notice Get total outstanding obligation for a borrower (used by PayrollRouter).
     */
    function getOutstandingObligation(address _borrower) external view returns (uint256) {
        uint256 total = 0;
        uint256[] storage loanIds = borrowerLoanIds[_borrower];

        for (uint256 i = 0; i < loanIds.length; i++) {
            Loan storage loan = loans[loanIds[i]];
            if (loan.status != LoanStatus.Active) continue;

            if (loan.scheme == RepaymentScheme.SinglePaycheck ||
                loan.scheme == RepaymentScheme.DepositBacked) {
                // Full amount due this period
                total += loan.totalOwed - loan.totalRepaid;
            } else if (loan.scheme == RepaymentScheme.Installments) {
                // One installment due this period
                uint256 installmentAmount = InterestCalculator.getInstallmentAmount(
                    loan.totalOwed,
                    loan.numInstallments
                );
                uint256 alreadyPaidThisInstallment = loan.totalRepaid - (loan.installmentsPaid * installmentAmount);
                if (installmentAmount > alreadyPaidThisInstallment) {
                    total += installmentAmount - alreadyPaidThisInstallment;
                }
            } else {
                // DynamicInterest — full amount due
                total += loan.totalOwed - loan.totalRepaid;
            }
        }
        return total;
    }

    // ─── Liquidation ─────────────────────────────────────────────────────

    /**
     * @notice Owner liquidates overdue loans.
     */
    function liquidate(uint256 _loanId) external onlyOwner {
        Loan storage loan = loans[_loanId];
        require(loan.status == LoanStatus.Active, "Loan not active");
        require(block.timestamp > loan.dueDate, "Loan not overdue");

        loan.status = LoanStatus.Defaulted;

        // Slash reputation
        reputationTracker.recordDefault(loan.borrower, loan.principal);

        // If collateral exists, seize it
        if (loan.collateral > 0) {
            uint256 collateralAmount = loan.collateral;
            loan.collateral = 0;
            totalLiquidity += collateralAmount;
        }

        emit LoanDefaulted(_loanId);
    }

    // ─── View helpers ────────────────────────────────────────────────────

    function getLoan(uint256 _loanId) external view returns (Loan memory) {
        return loans[_loanId];
    }

    function getActiveLoans(address _borrower) external view returns (Loan[] memory) {
        uint256[] storage ids = borrowerLoanIds[_borrower];
        uint256 count = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (loans[ids[i]].status == LoanStatus.Active) count++;
        }

        Loan[] memory result = new Loan[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            if (loans[ids[i]].status == LoanStatus.Active) {
                result[idx++] = loans[ids[i]];
            }
        }
        return result;
    }

    function getBorrowerLoanCount(address _borrower) external view returns (uint256) {
        return borrowerLoanIds[_borrower].length;
    }

    // ─── Internal ────────────────────────────────────────────────────────

    function _applyRepayment(Loan storage _loan, uint256 _amount) internal {
        uint256 owed = _loan.totalOwed - _loan.totalRepaid;
        uint256 applied = _amount > owed ? owed : _amount;

        _loan.totalRepaid += applied;
        totalLiquidity += applied;

        // Track installments
        if (_loan.scheme == RepaymentScheme.Installments) {
            uint256 installmentAmount = InterestCalculator.getInstallmentAmount(
                _loan.totalOwed,
                _loan.numInstallments
            );
            _loan.installmentsPaid = _loan.totalRepaid / installmentAmount;
        }

        if (_loan.totalRepaid >= _loan.totalOwed) {
            _loan.status = LoanStatus.Repaid;

            // Return collateral if deposit-backed
            if (_loan.collateral > 0) {
                uint256 collateralReturn = _loan.collateral;
                _loan.collateral = 0;
                (bool success,) = payable(_loan.borrower).call{value: collateralReturn}("");
                require(success, "Collateral return failed");
            }

            // Update reputation
            bool onTime = block.timestamp <= _loan.dueDate;
            reputationTracker.recordRepayment(_loan.borrower, _loan.principal, onTime);

            emit LoanFullyRepaid(_loan.id);
        } else {
            emit LoanRepaid(_loan.id, applied, _loan.totalOwed - _loan.totalRepaid);
        }

        // Return excess
        if (_amount > applied && msg.sender != payrollRouter) {
            (bool success,) = payable(_loan.borrower).call{value: _amount - applied}("");
            require(success, "Excess return failed");
        }
    }

    function _hasDelinquentLoan(address _borrower) internal view returns (bool) {
        uint256[] storage ids = borrowerLoanIds[_borrower];
        for (uint256 i = 0; i < ids.length; i++) {
            Loan storage loan = loans[ids[i]];
            if (loan.status == LoanStatus.Active && block.timestamp > loan.dueDate) {
                return true;
            }
        }
        return false;
    }

    // Allow contract to receive MON
    receive() external payable {
        totalLiquidity += msg.value;
    }
}
