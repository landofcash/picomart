// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {TempoEscrow} from "../TempoEscrow.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TempoEscrowHarness is ReentrancyGuard {
    function deposit(address token, uint256 amount) external nonReentrant { TempoEscrow.deposit(IERC20(token), msg.sender, amount); }
    function payout(address token, address recipient, uint256 amount) external nonReentrant { TempoEscrow.payout(IERC20(token), recipient, amount); }
}
