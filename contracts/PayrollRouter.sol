// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EWALending.sol";

/**
 * @title PayrollRouter
 * @notice Routes employer payroll deposits: auto-deducts outstanding loan obligations
 *         and forwards the remainder to the employee.
 *         This is the core "Klarna for wages" mechanic.
 */
contract PayrollRouter {
    // ─── Types ───────────────────────────────────────────────────────────
    struct EmployeeRecord {
        bool registered;
        address lendingContract;
        uint256 nextPayday; // Expected next payday timestamp
        uint256 lastPayrollReceived; // Timestamp of last payroll receipt
    }

    // ─── State ───────────────────────────────────────────────────────────
    address public owner;

    mapping(address => EmployeeRecord) public employees;

    // ─── Events ──────────────────────────────────────────────────────────
    event EmployeeRegistered(address indexed employee, address lendingContract);
    event PayrollProcessed(
        address indexed employee,
        uint256 totalDeposit,
        uint256 deducted,
        uint256 forwarded
    );
    event PaydayUpdated(address indexed employee, uint256 nextPayday);

    // ─── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    /**
     * @notice Register an employee and link them to a lending contract.
     *         (Removed onlyOwner for hackathon demo so any wallet can act as company)
     */
    function registerEmployee(
        address _employee,
        address _lendingContract
    ) external {
        employees[_employee] = EmployeeRecord({
            registered: true,
            lendingContract: _lendingContract,
            nextPayday: 0,
            lastPayrollReceived: 0
        });
        emit EmployeeRegistered(_employee, _lendingContract);
    }

    /**
     * @notice Set the expected next payday date for an employee.
     *         (Removed onlyOwner for hackathon demo)
     */
    function setNextPayday(address _employee, uint256 _timestamp) external {
        require(employees[_employee].registered, "Employee not registered");
        employees[_employee].nextPayday = _timestamp;
        emit PaydayUpdated(_employee, _timestamp);
    }

    // ─── Core ────────────────────────────────────────────────────────────

    /**
     * @notice Employer deposits payroll for an employee.
     *         Auto-deducts outstanding loan obligation directly from the Lending contract
     * @param _employee  The employee's address
     * @param _nullifier The nullifier hash for the repayment ZK proof
     * @param _proof The ZK proof for repayment
     */
    function depositPayroll(
        address _employee,
        bytes32 _nullifier,
        bytes calldata _proof
    ) external payable {
        EmployeeRecord storage record = employees[_employee];
        require(record.registered, "Employee not registered");
        require(msg.value > 0, "Zero deposit");

        record.lastPayrollReceived = block.timestamp;

        uint256 deduction = 0;
        uint256 forwarded = msg.value;

        // Automatically fetch the outstanding obligation directly from EWALending
        EWALending lending = EWALending(payable(record.lendingContract));
        uint256 owed = lending.outstandingObligations(_employee);

        if (owed > 0 && msg.value > 0) {
            deduction = owed > msg.value ? msg.value : owed;
            forwarded = msg.value - deduction;

            // Send deduction to lending contract privately
            lending.repayConfidential{value: deduction}(
                _employee,
                _nullifier,
                _proof
            );
        }

        // Forward remainder to employee (in true ZK, this would be shielded)
        if (forwarded > 0) {
            (bool success, ) = payable(_employee).call{value: forwarded}("");
            require(success, "Forward to employee failed");
        }

        emit PayrollProcessed(_employee, msg.value, deduction, forwarded);
    }

    // ─── View helpers ────────────────────────────────────────────────────

    function getNextPayday(address _employee) external view returns (uint256) {
        return employees[_employee].nextPayday;
    }

    function isRegistered(address _employee) external view returns (bool) {
        return employees[_employee].registered;
    }

    function getLastPayrollReceived(
        address _employee
    ) external view returns (uint256) {
        return employees[_employee].lastPayrollReceived;
    }
}
