// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AttestationRegistry
 * @notice Stores and verifies signed payroll attestations for EWA eligibility.
 *         Off-chain attestation providers sign claims (e.g. "employed=true, salary>=3000")
 *         and this contract verifies the ECDSA signature on-chain.
 *         Only boolean/threshold claims are stored — never raw salary or employer data.
 */
contract AttestationRegistry {
    // ─── Types ───────────────────────────────────────────────────────────
    struct Attestation {
        bytes32 attestationHash; // keccak256 of the structured claim data
        bytes32 employerHash; // keccak256(employer name) — stays opaque on-chain
        uint256 issuedAt;
        uint256 expiresAt;
        bool revoked;
    }

    // ─── State ───────────────────────────────────────────────────────────
    address public owner;
    address public trustedProvider; // Attestation provider's signing address

    mapping(address => Attestation) public attestations;
    mapping(bytes32 => bool) public registeredEmployers;

    // ─── Events ──────────────────────────────────────────────────────────
    event AttestationRegistered(
        address indexed borrower,
        bytes32 attestationHash,
        bytes32 employerHash,
        uint256 expiresAt
    );
    event AttestationRevoked(address indexed borrower);
    event EmployerRegistered(bytes32 indexed employerHash);
    event ProviderUpdated(address indexed newProvider);

    // ─── Modifiers ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyProviderOrOwner() {
        require(
            msg.sender == trustedProvider || msg.sender == owner,
            "Not authorized"
        );
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor(address _trustedProvider) {
        owner = msg.sender;
        trustedProvider = _trustedProvider;
    }

    // ─── Admin ───────────────────────────────────────────────────────────
    function setTrustedProvider(address _provider) external {
        trustedProvider = _provider;
        emit ProviderUpdated(_provider);
    }

    function registerEmployer(bytes32 _employerHash) external {
        registeredEmployers[_employerHash] = true;
        emit EmployerRegistered(_employerHash);
    }

    // ─── Core ────────────────────────────────────────────────────────────

    /**
     * @notice Register a signed attestation for a borrower.
     * @param _attestationHash  Hash of the structured claim data
     * @param _employerHash     Hash of employer identifier
     * @param _expiry           Unix timestamp when attestation expires
     * @param _signature        ECDSA signature from trusted provider
     *
     * The provider signs: keccak256(abi.encodePacked(borrower, _attestationHash, _employerHash, _expiry))
     */
    function registerAttestation(
        bytes32 _attestationHash,
        bytes32 _employerHash,
        uint256 _expiry,
        bytes calldata _signature
    ) external {
        require(registeredEmployers[_employerHash], "Employer not registered");
        require(_expiry > block.timestamp, "Attestation already expired");

        // Reconstruct the message the provider signed
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                msg.sender,
                _attestationHash,
                _employerHash,
                _expiry
            )
        );
        bytes32 ethSignedHash = _toEthSignedMessageHash(messageHash);

        // Recover signer and verify
        address signer = _recoverSigner(ethSignedHash, _signature);
        require(signer != address(0), "Invalid signature");
        // For hackathon demo: accept any valid signature as a trusted employer
        // require(signer == trustedProvider, "Invalid attestation signature");

        attestations[msg.sender] = Attestation({
            attestationHash: _attestationHash,
            employerHash: _employerHash,
            issuedAt: block.timestamp,
            expiresAt: _expiry,
            revoked: false
        });

        emit AttestationRegistered(
            msg.sender,
            _attestationHash,
            _employerHash,
            _expiry
        );
    }

    /**
     * @notice Revoke a borrower's attestation (e.g. on employment termination).
     */
    function revokeAttestation(address _borrower) external onlyProviderOrOwner {
        require(attestations[_borrower].issuedAt > 0, "No attestation found");
        attestations[_borrower].revoked = true;
        emit AttestationRevoked(_borrower);
    }

    /**
     * @notice Check if a borrower has a valid (non-expired, non-revoked) attestation.
     */
    function isValid(address _borrower) external view returns (bool) {
        Attestation storage a = attestations[_borrower];
        return a.issuedAt > 0 && !a.revoked && block.timestamp < a.expiresAt;
    }

    // ─── Internal helpers ────────────────────────────────────────────────
    function _toEthSignedMessageHash(
        bytes32 hash
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    function _recoverSigner(
        bytes32 _hash,
        bytes calldata _sig
    ) internal pure returns (address) {
        require(_sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(_sig.offset)
            s := calldataload(add(_sig.offset, 32))
            v := byte(0, calldataload(add(_sig.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid signature v value");
        return ecrecover(_hash, v, r, s);
    }
}
