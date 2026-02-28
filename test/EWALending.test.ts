import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("EWA Protocol", function () {
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let employer: SignerWithAddress;
    let randomUser: SignerWithAddress;

    let attestationRegistry: any;
    let reputationTracker: any;
    let ewaLending: any;
    let payrollRouter: any;

    const employerHash = ethers.keccak256(ethers.toUtf8Bytes("Acme Corp"));

    // Helper: create and sign an attestation for a borrower
    // Uses block timestamp + 365 days to survive evm_increaseTime calls in tests
    async function createAttestation(borrowerAddr: string, signer: SignerWithAddress, expiry?: number) {
        const attestationHash = ethers.keccak256(
            ethers.toUtf8Bytes(JSON.stringify({ employed: true, salaryAbove: 3000 }))
        );
        const latestBlock = await ethers.provider.getBlock("latest");
        const blockTimestamp = latestBlock!.timestamp;
        const exp = expiry || blockTimestamp + 365 * 24 * 60 * 60; // 1 year from now

        const messageHash = ethers.keccak256(
            ethers.solidityPacked(
                ["address", "bytes32", "bytes32", "uint256"],
                [borrowerAddr, attestationHash, employerHash, exp]
            )
        );
        const signature = await signer.signMessage(ethers.getBytes(messageHash));

        return { attestationHash, employerHash, expiry: exp, signature };
    }

    beforeEach(async function () {
        [owner, borrower, employer, randomUser] = await ethers.getSigners();

        // Deploy all contracts
        const AttestationRegistry = await ethers.getContractFactory("AttestationRegistry");
        attestationRegistry = await AttestationRegistry.deploy(owner.address);
        await attestationRegistry.waitForDeployment();

        const ReputationTracker = await ethers.getContractFactory("ReputationTracker");
        reputationTracker = await ReputationTracker.deploy();
        await reputationTracker.waitForDeployment();

        const EWALending = await ethers.getContractFactory("EWALending");
        ewaLending = await EWALending.deploy(
            await attestationRegistry.getAddress(),
            await reputationTracker.getAddress()
        );
        await ewaLending.waitForDeployment();

        const PayrollRouter = await ethers.getContractFactory("PayrollRouter");
        payrollRouter = await PayrollRouter.deploy();
        await payrollRouter.waitForDeployment();

        // Link contracts
        await ewaLending.setPayrollRouter(await payrollRouter.getAddress());
        await reputationTracker.setLendingContract(await ewaLending.getAddress());

        // Register employer
        await attestationRegistry.registerEmployer(employerHash);

        // Fund lending pool
        await ewaLending.depositLiquidity({ value: ethers.parseEther("10") });

        // Register employee in PayrollRouter
        await payrollRouter.registerEmployee(borrower.address, await ewaLending.getAddress());
    });

    // ──────────────────────────────────────────────────────────────────────
    // ATTESTATION TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("AttestationRegistry", function () {
        it("should accept a valid attestation from trusted provider", async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
            expect(await attestationRegistry.isValid(borrower.address)).to.be.true;
        });

        it("should reject attestation from untrusted signer", async function () {
            const att = await createAttestation(borrower.address, randomUser); // wrong signer
            await expect(
                attestationRegistry.connect(borrower).registerAttestation(
                    att.attestationHash, att.employerHash, att.expiry, att.signature
                )
            ).to.be.revertedWith("Invalid attestation signature");
        });

        it("should reject attestation with unregistered employer", async function () {
            const fakeEmployerHash = ethers.keccak256(ethers.toUtf8Bytes("Fake Corp"));

            const attestationHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            const latestBlock = await ethers.provider.getBlock("latest");
            const exp = latestBlock!.timestamp + 86400;
            const messageHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "bytes32", "bytes32", "uint256"],
                    [borrower.address, attestationHash, fakeEmployerHash, exp]
                )
            );
            const signature = await owner.signMessage(ethers.getBytes(messageHash));

            await expect(
                attestationRegistry.connect(borrower).registerAttestation(
                    attestationHash, fakeEmployerHash, exp, signature
                )
            ).to.be.revertedWith("Employer not registered");
        });

        it("should reject expired attestation", async function () {
            const latestBlock = await ethers.provider.getBlock("latest");
            const pastExpiry = latestBlock!.timestamp - 1000; // Already expired
            const attestationHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            const messageHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "bytes32", "bytes32", "uint256"],
                    [borrower.address, attestationHash, employerHash, pastExpiry]
                )
            );
            const signature = await owner.signMessage(ethers.getBytes(messageHash));

            await expect(
                attestationRegistry.connect(borrower).registerAttestation(
                    attestationHash, employerHash, pastExpiry, signature
                )
            ).to.be.revertedWith("Attestation already expired");
        });

        it("should revoke attestation", async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
            expect(await attestationRegistry.isValid(borrower.address)).to.be.true;

            await attestationRegistry.revokeAttestation(borrower.address);
            expect(await attestationRegistry.isValid(borrower.address)).to.be.false;
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // BORROW TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("Borrowing", function () {
        beforeEach(async function () {
            // Register attestation for borrower
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
        });

        it("should allow borrow with valid attestation (SinglePaycheck)", async function () {
            const amount = ethers.parseEther("0.5");
            const balBefore = await ethers.provider.getBalance(borrower.address);

            const tx = await ewaLending.connect(borrower).borrow(amount, 0); // SinglePaycheck
            await tx.wait();

            const loan = await ewaLending.getLoan(1);
            expect(loan.principal).to.equal(amount);
            expect(loan.status).to.equal(0); // Active
            // 2% fee on 0.5 MON = 0.01 MON
            expect(loan.interest).to.equal(ethers.parseEther("0.01"));
            expect(loan.totalOwed).to.equal(ethers.parseEther("0.51"));
        });

        it("should allow borrow with Installments scheme", async function () {
            const amount = ethers.parseEther("1");
            await ewaLending.connect(borrower).borrow(amount, 1); // Installments

            const loan = await ewaLending.getLoan(1);
            expect(loan.principal).to.equal(amount);
            expect(loan.numInstallments).to.equal(2);
            // 5% APR prorated over 60 days: 1 * 500 * 60 / (10000 * 365) ≈ 0.00821 MON
            expect(loan.interest).to.be.gt(0);
        });

        it("should reject borrow without attestation", async function () {
            await expect(
                ewaLending.connect(randomUser).borrow(ethers.parseEther("0.5"), 0)
            ).to.be.revertedWith("No valid attestation");
        });

        it("should reject borrow over max amount", async function () {
            await expect(
                ewaLending.connect(borrower).borrow(ethers.parseEther("100"), 0)
            ).to.be.revertedWith("Invalid loan amount");
        });

        it("should allow deposit-backed borrow with collateral", async function () {
            const borrowAmount = ethers.parseEther("1");
            const collateral = ethers.parseEther("0.5");

            await ewaLending.connect(borrower).borrowWithCollateral(
                borrowAmount,
                { value: collateral }
            );

            const loan = await ewaLending.getLoan(1);
            expect(loan.collateral).to.equal(collateral);
            expect(loan.scheme).to.equal(2); // DepositBacked
            // 1% flat fee
            expect(loan.interest).to.equal(ethers.parseEther("0.01"));
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // PAYROLL AUTO-DEDUCTION TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("Payroll Auto-Deduction", function () {
        beforeEach(async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
        });

        it("should auto-deduct full single-paycheck loan from payroll", async function () {
            // Borrow 0.5 MON (SinglePaycheck: 2% fee = 0.01, total = 0.51)
            await ewaLending.connect(borrower).borrow(ethers.parseEther("0.5"), 0);

            const obligationBefore = await ewaLending.getOutstandingObligation(borrower.address);
            expect(obligationBefore).to.equal(ethers.parseEther("0.51"));

            // Employer deposits 2.0 MON payroll
            const payrollAmount = ethers.parseEther("2");
            const borrowerBalBefore = await ethers.provider.getBalance(borrower.address);

            const tx = await payrollRouter.connect(employer).depositPayroll(
                borrower.address,
                { value: payrollAmount }
            );
            const receipt = await tx.wait();

            // Obligation should be zero
            const obligationAfter = await ewaLending.getOutstandingObligation(borrower.address);
            expect(obligationAfter).to.equal(0);

            // Loan should be fully repaid
            const loan = await ewaLending.getLoan(1);
            expect(loan.status).to.equal(1); // Repaid

            // Borrower should receive remainder (2.0 - 0.51 = 1.49)
            const borrowerBalAfter = await ethers.provider.getBalance(borrower.address);
            expect(borrowerBalAfter - borrowerBalBefore).to.equal(ethers.parseEther("1.49"));
        });

        it("should deduct installment from payroll (not full amount)", async function () {
            // Borrow 1.0 MON with 2 installments
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 1);

            const loan = await ewaLending.getLoan(1);
            const totalOwed = loan.totalOwed;
            const installmentAmount = totalOwed / 2n; // Each installment

            // First payroll: should deduct one installment
            await payrollRouter.connect(employer).depositPayroll(
                borrower.address,
                { value: ethers.parseEther("2") }
            );

            const loanAfter = await ewaLending.getLoan(1);
            expect(loanAfter.status).to.equal(0); // Still active
            expect(loanAfter.totalRepaid).to.be.gte(installmentAmount);
        });

        it("should forward full payroll when no outstanding loan", async function () {
            // No loan — payroll should go entirely to borrower
            const payrollAmount = ethers.parseEther("2");
            const borrowerBalBefore = await ethers.provider.getBalance(borrower.address);

            await payrollRouter.connect(employer).depositPayroll(
                borrower.address,
                { value: payrollAmount }
            );

            const borrowerBalAfter = await ethers.provider.getBalance(borrower.address);
            expect(borrowerBalAfter - borrowerBalBefore).to.equal(payrollAmount);
        });

        it("should handle partial payroll (underfunded)", async function () {
            // Borrow 2.0 MON — total owed > payroll amount
            await ewaLending.connect(borrower).borrow(ethers.parseEther("2"), 0);

            // Employer deposits only 1.0 MON (less than obligation)
            await payrollRouter.connect(employer).depositPayroll(
                borrower.address,
                { value: ethers.parseEther("1") }
            );

            // Should apply full payroll to loan, nothing forwarded
            const loan = await ewaLending.getLoan(1);
            expect(loan.totalRepaid).to.equal(ethers.parseEther("1"));
            expect(loan.status).to.equal(0); // Still active (not fully repaid)
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // MANUAL REPAYMENT TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("Manual Repayment", function () {
        beforeEach(async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
        });

        it("should allow early manual repayment", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("0.5"), 0);

            // Manually repay full amount
            await ewaLending.connect(borrower).repay(1, { value: ethers.parseEther("0.51") });

            const loan = await ewaLending.getLoan(1);
            expect(loan.status).to.equal(1); // Repaid
        });

        it("should allow partial manual repayment", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 0);

            // Partially repay
            await ewaLending.connect(borrower).repay(1, { value: ethers.parseEther("0.5") });

            const loan = await ewaLending.getLoan(1);
            expect(loan.status).to.equal(0); // Still active
            expect(loan.totalRepaid).to.equal(ethers.parseEther("0.5"));
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // REPUTATION TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("Reputation", function () {
        beforeEach(async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
        });

        it("should start at 50 for new users", async function () {
            const rep = await reputationTracker.getReputation(borrower.address);
            expect(rep).to.equal(50);
        });

        it("should increase on on-time repayment (amount-weighted)", async function () {
            // Borrow 0.5 MON and repay via payroll
            await ewaLending.connect(borrower).borrow(ethers.parseEther("0.5"), 0);
            await payrollRouter.connect(employer).depositPayroll(
                borrower.address,
                { value: ethers.parseEther("2") }
            );

            const repAfterSmall = await reputationTracker.getReputation(borrower.address);
            // 0.5 MON: bonus = min(10, 3 + 0) = 3 (since 0.5e18 / 1e18 = 0)
            // Actually in Solidity integer division: 0.5 ether / 1 ether = 0
            // So bonus = min(10, 3 + 0) = 3, new rep = 50 + 3 = 53
            expect(repAfterSmall).to.be.gte(53);
        });

        it("should give larger bonus for bigger loans", async function () {
            // Borrow 3.0 MON and repay
            await ewaLending.connect(borrower).borrow(ethers.parseEther("3"), 0);
            await payrollRouter.connect(employer).depositPayroll(
                borrower.address,
                { value: ethers.parseEther("5") }
            );

            const repAfterLarge = await reputationTracker.getReputation(borrower.address);
            // 3.0 MON: bonus = min(10, 3 + 3) = 6, new rep = 50 + 6 = 56
            expect(repAfterLarge).to.be.gte(56);
        });

        it("should decrease on default (amount-weighted)", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 0);

            // Fast-forward past due date
            await ethers.provider.send("evm_increaseTime", [31 * 86400]);
            await ethers.provider.send("evm_mine", []);

            await ewaLending.liquidate(1);

            const rep = await reputationTracker.getReputation(borrower.address);
            // Default penalty for 1 MON: min(25, 10 + 1) = 11, new rep = 50 - 11 = 39
            expect(rep).to.equal(39);
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // INTEREST CALCULATION TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("Interest Calculation", function () {
        beforeEach(async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
        });

        it("SinglePaycheck: 2% flat fee", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 0);
            const loan = await ewaLending.getLoan(1);
            expect(loan.interest).to.equal(ethers.parseEther("0.02")); // 2% of 1 MON
        });

        it("DepositBacked: 1% flat fee", async function () {
            await ewaLending.connect(borrower).borrowWithCollateral(
                ethers.parseEther("1"),
                { value: ethers.parseEther("0.5") }
            );
            const loan = await ewaLending.getLoan(1);
            expect(loan.interest).to.equal(ethers.parseEther("0.01")); // 1% of 1 MON
        });

        it("Installments: 5% APR prorated over term", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 1);
            const loan = await ewaLending.getLoan(1);
            // 5% APR over 60 days: 1 * 0.05 * 60/365 ≈ 0.00821917808
            // In wei: ~8219178082191780
            expect(loan.interest).to.be.gt(0);
            expect(loan.interest).to.be.lt(ethers.parseEther("0.01"));
        });

        it("DynamicInterest: rate decreases with higher reputation", async function () {
            // Borrow at rep=50 (DynamicInterest)
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 3);
            const loan1 = await ewaLending.getLoan(1);

            // Repay to increase reputation
            await ewaLending.connect(borrower).repay(1, { value: loan1.totalOwed });

            // Borrow again at higher rep
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 3);
            const loan2 = await ewaLending.getLoan(2);

            // Second loan should have less or equal interest (higher rep = lower rate)
            expect(loan2.interest).to.be.lte(loan1.interest);
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // LIQUIDATION TESTS
    // ──────────────────────────────────────────────────────────────────────
    describe("Liquidation", function () {
        beforeEach(async function () {
            const att = await createAttestation(borrower.address, owner);
            await attestationRegistry.connect(borrower).registerAttestation(
                att.attestationHash, att.employerHash, att.expiry, att.signature
            );
        });

        it("should allow owner to liquidate overdue loans", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 0);

            // Fast-forward past due date
            await ethers.provider.send("evm_increaseTime", [31 * 86400]);
            await ethers.provider.send("evm_mine", []);

            await ewaLending.liquidate(1);
            const loan = await ewaLending.getLoan(1);
            expect(loan.status).to.equal(2); // Defaulted
        });

        it("should not allow liquidation before due date", async function () {
            await ewaLending.connect(borrower).borrow(ethers.parseEther("1"), 0);
            await expect(ewaLending.liquidate(1)).to.be.revertedWith("Loan not overdue");
        });

        it("should seize collateral on liquidation of deposit-backed loan", async function () {
            const collateral = ethers.parseEther("0.5");
            await ewaLending.connect(borrower).borrowWithCollateral(
                ethers.parseEther("1"),
                { value: collateral }
            );

            const liquidityBefore = await ewaLending.totalLiquidity();

            await ethers.provider.send("evm_increaseTime", [31 * 86400]);
            await ethers.provider.send("evm_mine", []);

            await ewaLending.liquidate(1);

            const liquidityAfter = await ewaLending.totalLiquidity();
            expect(liquidityAfter - liquidityBefore).to.equal(collateral);
        });
    });
});
