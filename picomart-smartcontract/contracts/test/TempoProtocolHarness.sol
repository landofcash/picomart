// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {TempoProtocol} from "../TempoProtocol.sol";

contract TempoProtocolHarness {
    function encodeCommitment(TempoProtocol.Binding calldata binding, bytes calldata buyer, bytes calldata seller) external pure returns (bytes memory) {
        return TempoProtocol.encodeCommitment(binding, buyer, seller);
    }
    function commitment(TempoProtocol.Binding calldata binding, bytes calldata buyer, bytes calldata seller) external pure returns (bytes32) {
        return TempoProtocol.commitment(binding, buyer, seller);
    }
    function receivingIdentity(address deployment, address account, bytes16 seed, bytes32 key, bool seller) external pure returns (bytes32) {
        return TempoProtocol.receivingIdentity(deployment, account, seed, key, seller);
    }
    function publicSeed(bytes16 seed) external pure returns (string memory) { return TempoProtocol.publicSeed(seed); }
}
