import { ethers } from "hardhat";

/**
 * Simulates an attestation provider: signs an attestation for a borrower.
 * Usage: npx hardhat run scripts/issue-attestation.ts --network <network>
 * 
 * Set BORROWER_ADDRESS env var, or it defaults to signer[1] (second account).
 */
async function main() {
    const signers = await ethers.getSigners();
    const provider = signers[0]; // Attestation provider = deployer for MVP
    const borrower = process.env.BORROWER_ADDRESS || (signers[1] ? signers[1].address : provider.address);

    console.log("Attestation Provider:", provider.address);
    console.log("Borrower:", borrower);

    // Load deployed addresses
    const fs = require("fs");
    let addresses: any;
    try {
        addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf-8"));
    } catch {
        console.error("❌ deployed-addresses.json not found. Run deploy script first.");
        process.exit(1);
    }

    const attestationRegistry = await ethers.getContractAt(
        "AttestationRegistry",
        addresses.attestationRegistry
    );

    const code = await ethers.provider.getCode(addresses.attestationRegistry);
    if (code === "0x") {
        console.error(`\n❌ AttestationRegistry not found at ${addresses.attestationRegistry}`);
        console.error("   You are likely running on a different network than where you deployed.");
        console.error("   Make sure to pass --network <network> (e.g., --network monad)");
        console.error("   and ensure you have run the deploy script on that network first.\n");
        process.exit(1);
    }

    // Create attestation claim data
    const employerHash = ethers.keccak256(ethers.toUtf8Bytes("Acme Corp"));
    const attestationData = {
        employed: true,
        salaryAboveThreshold: true, // salary >= $3,000/mo
        paySchedule: "biweekly",
        verifiedAt: Math.floor(Date.now() / 1000),
    };

    // Hash the attestation data
    const attestationHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(attestationData))
    );

    // Set expiry to 30 days from now
    const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    console.log("\nAttestation Claims (off-chain — NOT stored on-chain):");
    console.log(JSON.stringify(attestationData, null, 2));
    console.log("\nAttestation Hash:", attestationHash);
    console.log("Employer Hash:", employerHash);
    console.log("Expiry:", new Date(expiry * 1000).toISOString());

    // Sign the attestation
    const messageHash = ethers.keccak256(
        ethers.solidityPacked(
            ["address", "bytes32", "bytes32", "uint256"],
            [borrower, attestationHash, employerHash, expiry]
        )
    );
    const signature = await provider.signMessage(ethers.getBytes(messageHash));
    console.log("\nSignature:", signature);

    // If we have a borrower signer, register the attestation on-chain
    const borrowerSigner = signers.find(s => s.address.toLowerCase() === borrower.toLowerCase());
    if (borrowerSigner) {
        console.log("\n🔗 Registering attestation on-chain...");
        const connectedRegistry = attestationRegistry.connect(borrowerSigner) as any;
        const tx = await connectedRegistry.registerAttestation(
            attestationHash,
            employerHash,
            expiry,
            signature
        );
        await tx.wait();
        console.log("✅ Attestation registered! Tx:", tx.hash);

        // Verify
        const isValid = await attestationRegistry.isValid(borrower);
        console.log("Is valid:", isValid);
    } else {
        console.log("\n📋 To register on-chain, call:");
        console.log(`  attestationRegistry.registerAttestation(`);
        console.log(`    "${attestationHash}",`);
        console.log(`    "${employerHash}",`);
        console.log(`    ${expiry},`);
        console.log(`    "${signature}"`);
        console.log(`  )`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
