import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying EWA Protocol with account:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MON");

    // 1. Deploy AttestationRegistry
    // Use deployer as the trusted attestation provider for MVP
    const attestationProvider = deployer.address;
    const AttestationRegistry = await ethers.getContractFactory("AttestationRegistry");
    const attestationRegistry = await AttestationRegistry.deploy(attestationProvider);
    await attestationRegistry.waitForDeployment();
    const attestationAddr = await attestationRegistry.getAddress();
    console.log("✅ AttestationRegistry deployed:", attestationAddr);

    // 2. Deploy ReputationTracker
    const ReputationTracker = await ethers.getContractFactory("ReputationTracker");
    const reputationTracker = await ReputationTracker.deploy();
    await reputationTracker.waitForDeployment();
    const reputationAddr = await reputationTracker.getAddress();
    console.log("✅ ReputationTracker deployed:", reputationAddr);

    // 3. Deploy EWALending
    const EWALending = await ethers.getContractFactory("EWALending");
    const ewaLending = await EWALending.deploy(attestationAddr, reputationAddr);
    await ewaLending.waitForDeployment();
    const lendingAddr = await ewaLending.getAddress();
    console.log("✅ EWALending deployed:", lendingAddr);

    // 4. Deploy PayrollRouter
    const PayrollRouter = await ethers.getContractFactory("PayrollRouter");
    const payrollRouter = await PayrollRouter.deploy();
    await payrollRouter.waitForDeployment();
    const routerAddr = await payrollRouter.getAddress();
    console.log("✅ PayrollRouter deployed:", routerAddr);

    // 5. Link contracts
    console.log("\n🔗 Linking contracts...");

    // Set PayrollRouter in EWALending
    await ewaLending.setPayrollRouter(routerAddr);
    console.log("  EWALending.payrollRouter →", routerAddr);

    // Set EWALending as authorized caller in ReputationTracker
    await reputationTracker.setLendingContract(lendingAddr);
    console.log("  ReputationTracker.lendingContract →", lendingAddr);

    // 6. Register a demo employer
    const demoEmployerHash = ethers.keccak256(ethers.toUtf8Bytes("Acme Corp"));
    await attestationRegistry.registerEmployer(demoEmployerHash);
    console.log("  Registered employer hash:", demoEmployerHash);

    // 7. Fund lending pool with liquidity
    const liquidityAmount = ethers.parseEther("25");
    await ewaLending.depositLiquidity({ value: liquidityAmount });
    console.log("  Funded lending pool:", ethers.formatEther(liquidityAmount), "MON");

    // Summary
    console.log("\n" + "═".repeat(60));
    console.log("EWA Protocol Deployment Summary");
    console.log("═".repeat(60));
    console.log(`  AttestationRegistry: ${attestationAddr}`);
    console.log(`  ReputationTracker:   ${reputationAddr}`);
    console.log(`  EWALending:          ${lendingAddr}`);
    console.log(`  PayrollRouter:       ${routerAddr}`);
    console.log(`  Attestation Provider: ${attestationProvider}`);
    console.log(`  Demo Employer Hash:  ${demoEmployerHash}`);
    console.log(`  Liquidity Pool:      ${ethers.formatEther(liquidityAmount)} MON`);
    console.log("═".repeat(60));

    // Write addresses to a JSON file for frontend consumption
    const addresses = {
        attestationRegistry: attestationAddr,
        reputationTracker: reputationAddr,
        ewaLending: lendingAddr,
        payrollRouter: routerAddr,
        attestationProvider: attestationProvider,
        demoEmployerHash: demoEmployerHash,
    };

    const fs = require("fs");
    fs.writeFileSync(
        "deployed-addresses.json",
        JSON.stringify(addresses, null, 2)
    );
    console.log("\n📄 Addresses written to deployed-addresses.json");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
