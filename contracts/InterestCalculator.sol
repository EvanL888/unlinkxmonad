// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title InterestCalculator
 * @notice Pure math library for EWA interest and installment calculations.
 *         Supports 4 repayment schemes: SinglePaycheck, Installments, DepositBacked, DynamicInterest.
 */
library InterestCalculator {
    // ─── Scheme enum (must match EWALending) ─────────────────────────────
    enum RepaymentScheme {
        SinglePaycheck,   // 2% flat fee
        Installments,     // 5% APR prorated
        DepositBacked,    // 1% flat fee
        DynamicInterest   // 8% APR base, -0.05% per reputation point
    }

    uint256 constant BPS = 10000; // Basis points denominator

    /**
     * @notice Calculate total interest for a loan.
     * @param _principal    Loan amount in wei
     * @param _scheme       Repayment scheme
     * @param _reputation   Borrower's reputation score (0-100)
     * @param _termDays     Loan term in days (for prorated APR schemes)
     * @return interest     Total interest amount in wei
     */
    function calculateInterest(
        uint256 _principal,
        RepaymentScheme _scheme,
        uint256 _reputation,
        uint256 _termDays
    ) internal pure returns (uint256) {
        if (_scheme == RepaymentScheme.SinglePaycheck) {
            // 2% flat fee
            return (_principal * 200) / BPS;
        } else if (_scheme == RepaymentScheme.Installments) {
            // 5% APR prorated over term
            // interest = principal * 5% * (termDays / 365)
            return (_principal * 500 * _termDays) / (BPS * 365);
        } else if (_scheme == RepaymentScheme.DepositBacked) {
            // 1% flat fee
            return (_principal * 100) / BPS;
        } else if (_scheme == RepaymentScheme.DynamicInterest) {
            // Base 8% APR, minus 0.05% (5 bps) per reputation point
            // Effective APR = max(0.5%, 8% - 0.05% * reputation)
            // At rep=50: 8% - 2.5% = 5.5%
            // At rep=100: 8% - 5% = 3%
            // At rep=0: 8%
            uint256 reductionBps = _reputation * 5; // 0.05% = 5 bps per point
            uint256 baseBps = 800; // 8% = 800 bps
            uint256 effectiveBps;
            if (reductionBps >= baseBps - 50) {
                effectiveBps = 50; // Floor at 0.5%
            } else {
                effectiveBps = baseBps - reductionBps;
            }
            // Prorated over term
            return (_principal * effectiveBps * _termDays) / (BPS * 365);
        }
        return 0;
    }

    /**
     * @notice Calculate single installment amount.
     * @param _totalOwed        Total amount owed (principal + interest)
     * @param _numInstallments  Number of installments
     * @return installment      Amount per installment (last one gets the remainder)
     */
    function getInstallmentAmount(
        uint256 _totalOwed,
        uint256 _numInstallments
    ) internal pure returns (uint256) {
        require(_numInstallments > 0, "Zero installments");
        return _totalOwed / _numInstallments;
    }
}
