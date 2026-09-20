// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev A successful TIP-20 call can redirect funds. Verify both balance deltas.
library TempoEscrow {
    using SafeERC20 for IERC20;
    error InexactTransfer();

    function deposit(IERC20 token, address payer, uint256 amount) internal {
        if (amount == 0 || payer == address(0) || payer == address(this)) revert InexactTransfer();
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 payerBefore = token.balanceOf(payer);
        token.safeTransferFrom(payer, address(this), amount);
        uint256 escrowAfter = token.balanceOf(address(this));
        uint256 payerAfter = token.balanceOf(payer);
        if (escrowAfter < escrowBefore || escrowAfter - escrowBefore != amount ||
            payerAfter > payerBefore || payerBefore - payerAfter != amount) revert InexactTransfer();
    }

    function payout(IERC20 token, address recipient, uint256 amount) internal {
        if (amount == 0 || recipient == address(0) || recipient == address(this)) revert InexactTransfer();
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 escrowAfter = token.balanceOf(address(this));
        uint256 recipientAfter = token.balanceOf(recipient);
        if (escrowAfter > escrowBefore || escrowBefore - escrowAfter != amount ||
            recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount) revert InexactTransfer();
    }
}
