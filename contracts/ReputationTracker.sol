// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReputationTracker
 * @notice On-chain reputation scoring for EWA borrowers.
 *         Score is amount-weighted: larger loans affect reputation more.
 *         Scale: 0-100, starting at 50.
 */
contract ReputationTracker {
    // ─── State ───────────────────────────────────────────────────────────
    address public owner;
    address public lendingContract; // Only EWALending can update reputation

    // 1 MON in wei — determines how quickly loan amount increases rep change
    uint256 public constant TIER_SIZE = 1 ether;
    uint256 public constant DEFAULT_REPUTATION = 50;

    mapping(address => uint256) public reputations;
    mapping(address => bool) public hasReputation;

    // ─── Events ──────────────────────────────────────────────────────────
    event ReputationUpdated(address indexed borrower, uint256 oldScore, uint256 newScore, string reason);

    // ─── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyLending() {
        require(msg.sender == lendingContract, "Not lending contract");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ───────────────────────────────────────────────────────────
    function setLendingContract(address _lending) external onlyOwner {
        lendingContract = _lending;
    }

    // ─── Core ────────────────────────────────────────────────────────────

    /**
     * @notice Get the reputation score for a borrower. Returns DEFAULT_REPUTATION for new users.
     */
    function getReputation(address _borrower) external view returns (uint256) {
        if (!hasReputation[_borrower]) return DEFAULT_REPUTATION;
        return reputations[_borrower];
    }

    /**
     * @notice Record a repayment event, amount-weighted.
     * @param _borrower     Address of the borrower
     * @param _loanAmount   The principal amount of the loan (in wei)
     * @param _onTime       True if repayment was on-time (not overdue)
     *
     * On-time:  +min(10, 3 + loanAmount / TIER_SIZE)
     * Late:     +1 (still positive, but minimal reward)
     */
    function recordRepayment(
        address _borrower,
        uint256 _loanAmount,
        bool _onTime
    ) external onlyLending {
        _initIfNeeded(_borrower);
        uint256 oldScore = reputations[_borrower];
        uint256 bonus;

        if (_onTime) {
            // Amount-weighted: larger loans = bigger reputation gain
            bonus = 3 + (_loanAmount / TIER_SIZE);
            if (bonus > 10) bonus = 10;
        } else {
            bonus = 1; // Late but still repaid
        }

        uint256 newScore = oldScore + bonus;
        if (newScore > 100) newScore = 100;
        reputations[_borrower] = newScore;

        emit ReputationUpdated(_borrower, oldScore, newScore, _onTime ? "on-time repay" : "late repay");
    }

    /**
     * @notice Record a default event, amount-weighted.
     * @param _borrower     Address of the borrower
     * @param _loanAmount   The principal amount of the defaulted loan (in wei)
     *
     * Penalty: -min(25, 10 + loanAmount / TIER_SIZE)
     */
    function recordDefault(
        address _borrower,
        uint256 _loanAmount
    ) external onlyLending {
        _initIfNeeded(_borrower);
        uint256 oldScore = reputations[_borrower];

        uint256 penalty = 10 + (_loanAmount / TIER_SIZE);
        if (penalty > 25) penalty = 25;

        uint256 newScore;
        if (oldScore > penalty) {
            newScore = oldScore - penalty;
        } else {
            newScore = 0;
        }
        reputations[_borrower] = newScore;

        emit ReputationUpdated(_borrower, oldScore, newScore, "default");
    }

    // ─── Internal ────────────────────────────────────────────────────────
    function _initIfNeeded(address _borrower) internal {
        if (!hasReputation[_borrower]) {
            hasReputation[_borrower] = true;
            reputations[_borrower] = DEFAULT_REPUTATION;
        }
    }
}
