import { ethers } from "hardhat";

/**
 * Simulates an employer depositing payroll through the PayrollRouter.
 * Shows the auto-deduction split (loan repayment vs. remainder to employee).
 * 
 * Usage: npx hardhat run scripts/simulate-payroll.ts --network <network>
 */
async function main() {
    const signers = await ethers.getSigners();
    const employer = signers[0]; // Employer = deployer for MVP
    const borrower = process.env.BORROWER_ADDRESS || (signers[1] ? signers[1].address : employer.address);
    const payrollAmount = ethers.parseEther(process.env.PAYROLL_AMOUNT || "2");

    console.log("Employer:", employer.address);
    console.log("Employee:", borrower);
    console.log("Payroll Amount:", ethers.formatEther(payrollAmount), "MON");

    // Load deployed addresses
    const fs = require("fs");
    let addresses: any;
    try {
        addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf-8"));
    } catch {
        console.error("❌ deployed-addresses.json not found. Run deploy script first.");
        process.exit(1);
    }

    const payrollRouter = await ethers.getContractAt("PayrollRouter", addresses.payrollRouter);
    const ewaLending = await ethers.getContractAt("EWALending", addresses.ewaLending);

    // Check if employee is registered
    const isRegistered = await payrollRouter.isRegistered(borrower);
    if (!isRegistered) {
        console.log("\n🔗 Registering employee in PayrollRouter...");
        await payrollRouter.registerEmployee(borrower, addresses.ewaLending);
        console.log("✅ Employee registered");
    }

    // Show pre-payroll state
    const obligationBefore = await ewaLending.getOutstandingObligation(borrower);
    const balanceBefore = await ethers.provider.getBalance(borrower);
    console.log("\n📊 Pre-Payroll State:");
    console.log("  Outstanding obligation:", ethers.formatEther(obligationBefore), "MON");
    console.log("  Employee balance:", ethers.formatEther(balanceBefore), "MON");

    // Deposit payroll
    console.log("\n💰 Depositing payroll...");
    const tx = await payrollRouter.depositPayroll(borrower, { value: payrollAmount });
    const receipt = await tx.wait();
    console.log("✅ Payroll deposited! Tx:", tx.hash);

    // Parse events
    const payrollProcessedEvent = receipt?.logs
        .map((log: any) => {
            try {
                return payrollRouter.interface.parseLog({ topics: log.topics as string[], data: log.data });
            } catch {
                return null;
            }
        })
        .find((e: any) => e?.name === "PayrollProcessed");

    if (payrollProcessedEvent) {
        console.log("\n📋 PayrollProcessed Event:");
        console.log("  Total Deposit:", ethers.formatEther(payrollProcessedEvent.args.totalDeposit), "MON");
        console.log("  Deducted (loan repayment):", ethers.formatEther(payrollProcessedEvent.args.deducted), "MON");
        console.log("  Forwarded (to employee):", ethers.formatEther(payrollProcessedEvent.args.forwarded), "MON");
    }

    // Show post-payroll state
    const obligationAfter = await ewaLending.getOutstandingObligation(borrower);
    const balanceAfter = await ethers.provider.getBalance(borrower);
    console.log("\n📊 Post-Payroll State:");
    console.log("  Outstanding obligation:", ethers.formatEther(obligationAfter), "MON");
    console.log("  Employee balance:", ethers.formatEther(balanceAfter), "MON");
    console.log("  Obligation reduced by:", ethers.formatEther(obligationBefore - obligationAfter), "MON");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
