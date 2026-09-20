// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Models successful transfer diversion and transfer fees; not a TIP-20 emulator.
contract PolicyToken is ERC20 {
    mapping(address => bool) public diverted;
    uint256 public fee;
    bool public fail;
    uint8 public returnMode;
    address public callbackTarget;
    bytes public callbackData;
    address public constant GUARD = address(0xB10C);
    constructor() ERC20("Test USD", "TUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function configure(address recipient, bool redirect, uint256 transferFee, bool fails) external {
        diverted[recipient] = redirect; fee = transferFee; fail = fails;
    }
    function configureReturn(uint8 mode) external { returnMode = mode; }
    function configureCallback(address target, bytes calldata data) external { callbackTarget = target; callbackData = data; }
    function transfer(address to, uint256 value) public override returns (bool) {
        bool success = super.transfer(to, value);
        if (returnMode == 2) { assembly ("memory-safe") { return(0, 0) } }
        return returnMode == 1 ? false : success;
    }
    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        bool success = super.transferFrom(from, to, value);
        if (returnMode == 2) { assembly ("memory-safe") { return(0, 0) } }
        return returnMode == 1 ? false : success;
    }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            if (callbackTarget != address(0)) {
                (bool ok, bytes memory reason) = callbackTarget.call(callbackData);
                if (!ok) { assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) } }
            }
            require(!fail, "policy failure");
            if (diverted[to]) to = GUARD;
            if (fee != 0) { super._update(from, GUARD, fee); value -= fee; }
        }
        super._update(from, to, value);
    }
}
