// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract LocalEscrow {
    IERC20Like public immutable usdc;
    address public immutable releaser;

    mapping(bytes32 => uint256) public claimBalances;
    mapping(bytes32 => bool) public releasedClaims;

    event Deposited(bytes32 indexed claimId, address indexed payer, uint256 amount);
    event Released(bytes32 indexed claimId, address indexed recipient, uint256 amount);

    error Unauthorized();
    error InvalidReleaser();
    error InvalidRecipient();
    error InvalidAmount();
    error TransferFailed();
    error NothingDeposited();
    error AlreadyReleased();

    constructor(address usdcAddress, address releaserAddress) {
        if (releaserAddress == address(0)) {
            revert InvalidReleaser();
        }

        usdc = IERC20Like(usdcAddress);
        releaser = releaserAddress;
    }

    function deposit(bytes32 claimId, uint256 amount) external {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (!usdc.transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        claimBalances[claimId] += amount;
        emit Deposited(claimId, msg.sender, amount);
    }

    function release(bytes32 claimId, address recipient) external {
        if (msg.sender != releaser) {
            revert Unauthorized();
        }
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (releasedClaims[claimId]) {
            revert AlreadyReleased();
        }

        uint256 amount = claimBalances[claimId];
        if (amount == 0) {
            revert NothingDeposited();
        }

        releasedClaims[claimId] = true;
        delete claimBalances[claimId];

        if (!usdc.transfer(recipient, amount)) {
            revert TransferFailed();
        }

        emit Released(claimId, recipient, amount);
    }
}
