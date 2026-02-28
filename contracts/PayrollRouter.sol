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
        uint256 nextPayday;           // Expected next payday timestamp
        uint256 lastPayrollReceived;  // Timestamp of last payroll receipt
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
     */
    function registerEmployee(
        address _employee,
        address _lendingContract
    ) external onlyOwner {
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
     */
    function setNextPayday(
        address _employee,
        uint256 _timestamp
    ) external onlyOwner {
        require(employees[_employee].registered, "Employee not registered");
        employees[_employee].nextPayday = _timestamp;
        emit PaydayUpdated(_employee, _timestamp);
    }

    // ─── Core ────────────────────────────────────────────────────────────

    /**
     * @notice Employer deposits payroll for an employee.
     *         Auto-deducts outstanding loan obligation, forwards remainder.
     * @param _employee  The employee's address
     */
    function depositPayroll(address _employee) external payable {
        EmployeeRecord storage record = employees[_employee];
        require(record.registered, "Employee not registered");
        require(msg.value > 0, "Zero deposit");

        record.lastPayrollReceived = block.timestamp;

        EWALending lending = EWALending(payable(record.lendingContract));
        uint256 obligation = lending.getOutstandingObligation(_employee);

        uint256 deduction = 0;
        uint256 forwarded = msg.value;

        if (obligation > 0 && msg.value > 0) {
            // Deduct up to the obligation amount (or full payroll if underfunded)
            deduction = obligation > msg.value ? msg.value : obligation;
            forwarded = msg.value - deduction;

            // Send deduction to lending contract
            lending.repayFromPayroll{value: deduction}(_employee);
        }

        // Forward remainder to employee
        if (forwarded > 0) {
            (bool success,) = payable(_employee).call{value: forwarded}("");
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

    function getLastPayrollReceived(address _employee) external view returns (uint256) {
        return employees[_employee].lastPayrollReceived;
    }
}
