import { ethers } from "hardhat";

async function main() {
    console.log("Starting test-admin-simulate...");
    const [deployer, employee] = await ethers.getSigners();
    const lendingAddr = "0xc594e8A50ecE126EACC4975E95D5771D43b4BBA3";
    const routerAddr = "0x2aB089dbe4bc34ef89CfF748DB44350D3561040B";

    const lending = await ethers.getContractAt("EWALending", lendingAddr);
    const router = await ethers.getContractAt("PayrollRouter", routerAddr);

    let owed = await lending.outstandingObligations(employee.address);
    console.log("Initial owed:", ethers.formatEther(owed));

    console.log("Borrowing 1.0 MON...");
    const commitmentHash = ethers.id("test2" + Date.now());
    await lending.connect(employee).borrowConfidential(
        ethers.parseEther("0.9"), 
        ethers.parseEther("1.0"), 
        commitmentHash,
        "0x"
    );

    owed = await lending.outstandingObligations(employee.address);
    console.log("Owed after borrow:", ethers.formatEther(owed));

    console.log("Deployer deposits 0.5 MON payroll (partial)...");
    const nullifier1 = ethers.id("null3" + Date.now());
    await router.connect(deployer).depositPayroll(employee.address, nullifier1, "0x", { value: ethers.parseEther("0.5") });

    owed = await lending.outstandingObligations(employee.address);
    console.log("Owed after first payroll:", ethers.formatEther(owed));

    console.log("Deployer deposits 0.2 MON payroll (partial)...");
    const nullifier2 = ethers.id("null4" + Date.now());
    await router.connect(deployer).depositPayroll(employee.address, nullifier2, "0x", { value: ethers.parseEther("0.2") });

    owed = await lending.outstandingObligations(employee.address);
    console.log("Owed after second payroll:", ethers.formatEther(owed));
}
main().catch(console.error);
