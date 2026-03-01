import { ethers } from "hardhat";

async function main() {
    const [deployer, employee] = await ethers.getSigners();
    // In case there's only one signer on testnet
    const signer = deployer; 
    const employeeAddr = "0xb2A646e4bCa4dF55A9c6Ee77534D7D0cfF285549"; // The user's address!

    const lendingAddr = "0xc594e8A50ecE126EACC4975E95D5771D43b4BBA3";
    const routerAddr = "0x2aB089dbe4bc34ef89CfF748DB44350D3561040B";

    const lending = await ethers.getContractAt("EWALending", lendingAddr, signer);
    const router = await ethers.getContractAt("PayrollRouter", routerAddr, signer);

    let owed = await lending.outstandingObligations(employeeAddr);
    console.log("Initial owed:", ethers.formatEther(owed));

    if (owed === 0n) {
        // Can't borrow because the user is the only one who can borrow. 
        console.log("Please borrow a loan manually from the frontend.");
        return;
    }

    const nullifier2 = ethers.id("null4" + Date.now());
    await router.depositPayroll(employeeAddr, nullifier2, "0x", { value: ethers.parseEther("0.1") });

    owed = await lending.outstandingObligations(employeeAddr);
    console.log("Owed after 0.1 payroll:", ethers.formatEther(owed));
}
main().catch(console.error);
