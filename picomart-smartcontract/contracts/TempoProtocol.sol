// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @dev Exact public codecs shared with @picomart/order-protocol/tempo-protocol.
library TempoProtocol {
    uint256 internal constant CHAIN_ID = 42431;
    uint256 internal constant MAX_ENVELOPE_BYTES = 8192;
    bytes32 internal constant COMMITMENT_DOMAIN = keccak256("picomart-reference-commitment-v1");
    bytes32 internal constant REFERENCE_PROFILE = keccak256("picomart-sealed-reference-v1");

    struct Binding {
        uint8 version;
        uint256 chainId;
        address contractAddress;
        bytes16 orderId;
        uint8 messageType;
        uint32 sequence;
        address author;
        bytes32 buyerIdentityId;
        bytes32 sellerIdentityId;
    }

    error InvalidReference();

    function encodeCommitment(Binding memory binding, bytes memory buyerEnvelope, bytes memory sellerEnvelope) internal pure returns (bytes memory) {
        if (binding.version != 1 || binding.chainId != CHAIN_ID || binding.contractAddress == address(0) ||
            binding.orderId == bytes16(0) || binding.author == address(0) || binding.sequence == 0 ||
            binding.messageType < 1 || binding.messageType > 3 || binding.buyerIdentityId == bytes32(0) ||
            binding.sellerIdentityId == bytes32(0) || buyerEnvelope.length == 0 || sellerEnvelope.length == 0 ||
            buyerEnvelope.length > MAX_ENVELOPE_BYTES || sellerEnvelope.length > MAX_ENVELOPE_BYTES ||
            keccak256(buyerEnvelope) == keccak256(sellerEnvelope)) revert InvalidReference();
        return abi.encode(COMMITMENT_DOMAIN, binding.version, REFERENCE_PROFILE, binding.chainId,
            binding.contractAddress, binding.orderId, binding.messageType, binding.sequence, binding.author,
            binding.buyerIdentityId, binding.sellerIdentityId, keccak256(buyerEnvelope), keccak256(sellerEnvelope));
    }

    function commitment(Binding memory binding, bytes memory buyerEnvelope, bytes memory sellerEnvelope) internal pure returns (bytes32) {
        return keccak256(encodeCommitment(binding, buyerEnvelope, sellerEnvelope));
    }

    function receivingIdentity(address deployment, address account, bytes16 seed, bytes32 publicKey, bool seller) internal pure returns (bytes32) {
        if (deployment == address(0) || account == address(0) || seed == bytes16(0) || publicKey == bytes32(0)) revert InvalidReference();
        // RFC 8785 key ordering is fixed; all inputs are fixed-width binary or constants.
        bytes memory context;
        if (seller) {
            context = abi.encodePacked('{"account":"', Strings.toHexString(account), '","catalogSeed":"', publicSeed(seed),
                '","chainId":42431,"contractAddress":"', Strings.toHexString(deployment),
                '","profile":"picomart-receiving-v1","role":"seller","version":1}');
        } else {
            context = abi.encodePacked('{"account":"', Strings.toHexString(account), '","chainId":42431,"contractAddress":"',
                Strings.toHexString(deployment), '","orderSeed":"', publicSeed(seed),
                '","profile":"picomart-receiving-v1","role":"buyer","version":1}');
        }
        return keccak256(abi.encodePacked('{"context":', context, ',"publicKey":"', base64(abi.encodePacked(publicKey)), '"}'));
    }

    function publicSeed(bytes16 seed) internal pure returns (string memory) {
        bytes memory result = bytes(base64(abi.encodePacked(seed)));
        bytes memory trimmed = new bytes(22);
        for (uint256 i; i < 22; ++i) {
            trimmed[i] = result[i] == "+" ? bytes1("-") : result[i] == "/" ? bytes1("_") : result[i];
        }
        return string(trimmed);
    }

    function base64(bytes memory data) private pure returns (string memory) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory output = new bytes(4 * ((data.length + 2) / 3));
        for (uint256 i; i < data.length; i += 3) {
            uint256 value = uint256(uint8(data[i])) << 16;
            if (i + 1 < data.length) value |= uint256(uint8(data[i + 1])) << 8;
            if (i + 2 < data.length) value |= uint256(uint8(data[i + 2]));
            uint256 o = (i / 3) * 4;
            output[o] = table[(value >> 18) & 63]; output[o + 1] = table[(value >> 12) & 63];
            output[o + 2] = i + 1 < data.length ? table[(value >> 6) & 63] : bytes1("=");
            output[o + 3] = i + 2 < data.length ? table[value & 63] : bytes1("=");
        }
        return string(output);
    }
}
