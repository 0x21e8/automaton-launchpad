// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {LocalEscrow} from "../src/LocalEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

interface Vm {
    function prank(address msgSender) external;

    function expectRevert(bytes calldata revertData) external;
}

contract LocalEscrowTest {
    Vm private constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC private usdc;
    LocalEscrow private escrow;

    address private constant RELEASER = address(0xA11CE);
    address private constant PAYER = address(0xB0B);
    address private constant RECIPIENT = address(0xCAFE);
    bytes32 private constant CLAIM_ID =
        0x8843a0dc33a27f3b64237d78d8d8d72df4f56ed9f643cef7f43f77832f0f4d0d;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new LocalEscrow(address(usdc), RELEASER);

        usdc.mint(PAYER, 150_000_000);

        vm.prank(PAYER);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function testDepositAccumulatesAndReleaseTransfersFunds() public {
        vm.prank(PAYER);
        escrow.deposit(CLAIM_ID, 75_000_000);

        vm.prank(PAYER);
        escrow.deposit(CLAIM_ID, 5_000_000);

        assert(escrow.claimBalances(CLAIM_ID) == 80_000_000);
        assert(usdc.balanceOf(address(escrow)) == 80_000_000);
        assert(usdc.balanceOf(RECIPIENT) == 0);

        vm.prank(RELEASER);
        escrow.release(CLAIM_ID, RECIPIENT);

        assert(escrow.claimBalances(CLAIM_ID) == 0);
        assert(escrow.releasedClaims(CLAIM_ID));
        assert(usdc.balanceOf(address(escrow)) == 0);
        assert(usdc.balanceOf(RECIPIENT) == 80_000_000);
    }

    function testReleaseRequiresConfiguredReleaser() public {
        vm.prank(PAYER);
        escrow.deposit(CLAIM_ID, 25_000_000);

        vm.prank(PAYER);
        vm.expectRevert(abi.encodeWithSelector(LocalEscrow.Unauthorized.selector));
        escrow.release(CLAIM_ID, RECIPIENT);
    }

    function testReleaseRejectsMissingDeposit() public {
        vm.prank(RELEASER);
        vm.expectRevert(abi.encodeWithSelector(LocalEscrow.NothingDeposited.selector));
        escrow.release(CLAIM_ID, RECIPIENT);
    }
}
