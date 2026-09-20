// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {TempoProtocol} from "./TempoProtocol.sol";
import {TempoEscrow} from "./TempoEscrow.sol";

/// @notice Moderato escrow with bounded stages and dual-recipient references.
/// @dev Clients verify ciphertext validity, private expiration and commercial prices.
contract Picomart is Ownable2Step, ReentrancyGuard {
    enum OrderState { None, Initial, Paid, Delivering, Completed, RefundReq, RefundedToBuyer, RefundedToSeller, Canceled }
    uint64 public constant STAGE_WINDOW = 5 days;
    uint64 public constant MAX_LIFECYCLE = 20 days;
    uint64 public constant TARGET_RETENTION = 30 days;
    uint256 public constant MAX_CATALOG_URL_BYTES = 2048;
    struct Catalog { address seller; bytes32 sellerPublicKey; bytes32 sellerIdentityId; string catalogUrl; }
    struct Order {
        uint8 version; bytes16 catalogId; OrderState status; uint256 priceAmount; address priceToken;
        address seller; address buyer; address payer; bytes32 buyerPublicKey; bytes32 sellerPublicKey;
        bytes32 buyerIdentityId; bytes32 sellerIdentityId; bytes32 buyerCommitment; bytes32 sellerCommitment;
        uint64 createdTs; uint64 updatedTs; uint64 deadline;
    }
    struct CreateOrder {
        bytes16 orderId; bytes16 catalogId; uint256 priceAmount; address priceToken;
        address expectedSeller; bytes32 expectedSellerPublicKey; bytes32 expectedSellerIdentityId;
        bytes32 buyerPublicKey; bytes32 buyerIdentityId;
    }
    struct MessageReference { uint32 sequence; bytes buyerEnvelope; bytes sellerEnvelope; }
    mapping(bytes16 => Catalog) public catalogs;
    mapping(bytes16 => Order) private _orders;
    mapping(bytes16 => bool) public consumedOrderIds;
    mapping(address => bool) public allowedPaymentTokens;
    mapping(address => uint256) public escrowedAmounts;
    error InvalidInput(); error Unauthorized(); error InvalidState(); error DeadlinePassed();
    error DeadlineNotReached(); error StaleCatalog(); error OrderIdConsumed(); error UnsupportedToken(); error UnsupportedChain();

    event PaymentTokenAllowed(address indexed token, bool allowed);
    event CatalogCreated(bytes16 indexed catalogId, address indexed seller, bytes32 publicKey, bytes32 identityId, string url);
    event CatalogUpdated(bytes16 indexed catalogId, bytes32 publicKey, bytes32 identityId, string url);
    event CatalogDeleted(bytes16 indexed catalogId);
    event OrderCreated(bytes16 indexed orderId, address indexed buyer, address indexed seller, bytes16 catalogId,
        address token, uint256 amount, bytes32 buyerPublicKey, bytes32 sellerPublicKey,
        bytes32 buyerIdentityId, bytes32 sellerIdentityId, uint64 deadline);
    event OrderPaid(bytes16 indexed orderId, address indexed payer, uint64 deadline);
    event OrderMessage(bytes16 indexed orderId, uint8 indexed messageType, address indexed author, uint32 sequence,
        bytes32 commitment, bytes buyerEnvelope, bytes sellerEnvelope);
    event OrderDelivering(bytes16 indexed orderId, uint64 deadline);
    event OrderCompleted(bytes16 indexed orderId);
    event OrderRefundRequested(bytes16 indexed orderId, uint64 deadline);
    event OrderRefundedToBuyer(bytes16 indexed orderId);
    event OrderRefundedToSeller(bytes16 indexed orderId);
    event OrderCanceled(bytes16 indexed orderId);
    event OrderDeleted(bytes16 indexed orderId, OrderState finalState);

    constructor(address admin, address paymentToken) Ownable(admin) {
        if (block.chainid != TempoProtocol.CHAIN_ID) revert UnsupportedChain();
        if (admin == msg.sender || admin == address(this)) revert InvalidInput();
        _allowToken(paymentToken, true);
    }
    // Removing a token blocks deposits, never payouts of existing escrow.
    function setPaymentTokenAllowed(address token, bool allowed) external onlyOwner { _allowToken(token, allowed); }
    function _allowToken(address token, bool allowed) private {
        if (token == address(0) || token == address(this)) revert UnsupportedToken();
        if (allowed && IERC20Metadata(token).decimals() != 6) revert UnsupportedToken();
        allowedPaymentTokens[token] = allowed; emit PaymentTokenAllowed(token, allowed);
    }
    function renounceOwnership() public view override onlyOwner { revert InvalidInput(); }

    function createCatalog(bytes16 catalogId, bytes32 publicKey, string calldata url) external {
        if (catalogId == bytes16(0) || catalogs[catalogId].seller != address(0)) revert InvalidInput();
        bytes32 identityId = TempoProtocol.receivingIdentity(address(this), msg.sender, catalogId, publicKey, true);
        _catalogUrl(url); catalogs[catalogId] = Catalog(msg.sender, publicKey, identityId, url);
        emit CatalogCreated(catalogId, msg.sender, publicKey, identityId, url);
    }
    function updateCatalog(bytes16 catalogId, bytes32 publicKey, string calldata url) external {
        Catalog storage catalog = catalogs[catalogId];
        if (catalog.seller != msg.sender) revert Unauthorized();
        bytes32 identityId = TempoProtocol.receivingIdentity(address(this), msg.sender, catalogId, publicKey, true);
        _catalogUrl(url); catalog.sellerPublicKey = publicKey; catalog.sellerIdentityId = identityId; catalog.catalogUrl = url;
        emit CatalogUpdated(catalogId, publicKey, identityId, url);
    }
    function deleteCatalog(bytes16 catalogId) external {
        if (catalogs[catalogId].seller != msg.sender) revert Unauthorized();
        delete catalogs[catalogId]; emit CatalogDeleted(catalogId);
    }
    function _catalogUrl(string calldata url) private pure {
        if (bytes(url).length == 0 || bytes(url).length > MAX_CATALOG_URL_BYTES) revert InvalidInput();
    }
    function getOrder(bytes16 orderId) external view returns (Order memory) { return _orders[orderId]; }

    function createOrderInitial(CreateOrder calldata input, MessageReference calldata messageReference) external nonReentrant { _create(input, messageReference); }
    function createOrderPaid(CreateOrder calldata input, MessageReference calldata messageReference) external nonReentrant { _create(input, messageReference); _pay(input.orderId); }
    function _create(CreateOrder calldata input, MessageReference calldata messageReference) private {
        if (input.orderId == bytes16(0) || input.catalogId == bytes16(0) || input.priceAmount == 0) revert InvalidInput();
        if (consumedOrderIds[input.orderId]) revert OrderIdConsumed();
        if (!allowedPaymentTokens[input.priceToken]) revert UnsupportedToken();
        Catalog storage catalog = catalogs[input.catalogId];
        if (catalog.seller == address(0) || catalog.seller != input.expectedSeller || catalog.sellerPublicKey != input.expectedSellerPublicKey ||
            catalog.sellerIdentityId != input.expectedSellerIdentityId) revert StaleCatalog();
        bytes32 buyerId = TempoProtocol.receivingIdentity(address(this), msg.sender, input.orderId, input.buyerPublicKey, false);
        if (buyerId != input.buyerIdentityId) revert InvalidInput();
        consumedOrderIds[input.orderId] = true;
        Order storage order = _orders[input.orderId];
        order.version = 1; order.catalogId = input.catalogId; order.priceAmount = input.priceAmount; order.priceToken = input.priceToken;
        order.seller = catalog.seller; order.buyer = msg.sender; order.buyerPublicKey = input.buyerPublicKey; order.sellerPublicKey = catalog.sellerPublicKey;
        order.buyerIdentityId = buyerId; order.sellerIdentityId = catalog.sellerIdentityId;
        order.createdTs = uint64(block.timestamp); _stage(order, OrderState.Initial);
        emit OrderCreated(input.orderId, msg.sender, order.seller, input.catalogId, input.priceToken, input.priceAmount,
            order.buyerPublicKey, order.sellerPublicKey, buyerId, order.sellerIdentityId, order.deadline);
        order.buyerCommitment = _message(input.orderId, order, 1, messageReference);
    }
    function buyOrder(bytes16 orderId) external nonReentrant {
        Order storage order = _state(orderId, OrderState.Initial); _beforeDeadline(order);
        Catalog storage catalog = catalogs[order.catalogId];
        if (catalog.seller != order.seller || catalog.sellerPublicKey != order.sellerPublicKey || catalog.sellerIdentityId != order.sellerIdentityId) revert StaleCatalog();
        _pay(orderId);
    }
    function _pay(bytes16 orderId) private {
        Order storage order = _orders[orderId];
        if (!allowedPaymentTokens[order.priceToken]) revert UnsupportedToken();
        order.payer = msg.sender; _stage(order, OrderState.Paid); escrowedAmounts[order.priceToken] += order.priceAmount;
        TempoEscrow.deposit(IERC20(order.priceToken), msg.sender, order.priceAmount);
        emit OrderPaid(orderId, msg.sender, order.deadline);
    }
    function cancelOrder(bytes16 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (order.status == OrderState.Initial) {
            if (msg.sender != order.buyer && msg.sender != owner()) revert Unauthorized();
            _terminal(order, OrderState.Canceled);
        } else if (order.status == OrderState.Paid) {
            if (msg.sender != order.buyer && msg.sender != order.payer && msg.sender != owner()) revert Unauthorized();
            _terminal(order, OrderState.Canceled); _payout(order, order.payer);
        } else revert InvalidState();
        emit OrderCanceled(orderId);
    }
    function startDelivering(bytes16 orderId, MessageReference calldata messageReference) external nonReentrant {
        Order storage order = _state(orderId, OrderState.Paid); _beforeDeadline(order);
        if (msg.sender != order.seller) revert Unauthorized();
        order.sellerCommitment = _message(orderId, order, 2, messageReference);
        _stage(order, OrderState.Delivering); emit OrderDelivering(orderId, order.deadline);
    }
    function refuseOrder(bytes16 orderId, MessageReference calldata messageReference) external nonReentrant {
        Order storage order = _state(orderId, OrderState.Paid); _beforeDeadline(order);
        if (msg.sender != order.seller) revert Unauthorized();
        order.sellerCommitment = _message(orderId, order, 3, messageReference);
        _terminal(order, OrderState.Canceled); _payout(order, order.payer); emit OrderCanceled(orderId);
    }
    function confirmOrder(bytes16 orderId) external nonReentrant {
        Order storage order = _state(orderId, OrderState.Delivering); _beforeDeadline(order);
        if (msg.sender != order.buyer) revert Unauthorized();
        _terminal(order, OrderState.Completed); _payout(order, order.seller); emit OrderCompleted(orderId);
    }
    function requireRefund(bytes16 orderId) external nonReentrant {
        Order storage order = _state(orderId, OrderState.Delivering); _beforeDeadline(order);
        if (msg.sender != order.buyer) revert Unauthorized();
        _stage(order, OrderState.RefundReq); emit OrderRefundRequested(orderId, order.deadline);
    }
    function processRefundToBuyer(bytes16 orderId) external onlyOwner nonReentrant {
        Order storage order = _state(orderId, OrderState.RefundReq); _beforeDeadline(order);
        _terminal(order, OrderState.RefundedToBuyer); _payout(order, order.payer); emit OrderRefundedToBuyer(orderId);
    }
    function processRefundToSeller(bytes16 orderId) external onlyOwner nonReentrant {
        Order storage order = _state(orderId, OrderState.RefundReq); _beforeDeadline(order);
        _terminal(order, OrderState.RefundedToSeller); _payout(order, order.seller); emit OrderRefundedToSeller(orderId);
    }
    /// @notice Permissionless deadline settlement; each settlement needs a transaction.
    function checkTimeouts(bytes16 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (order.deadline == 0 || block.timestamp < order.deadline) revert DeadlineNotReached();
        if (order.status == OrderState.Initial) {
            _terminal(order, OrderState.Canceled); emit OrderCanceled(orderId);
        } else if (order.status == OrderState.Paid) {
            _terminal(order, OrderState.Canceled); _payout(order, order.payer); emit OrderCanceled(orderId);
        } else if (order.status == OrderState.Delivering) {
            _terminal(order, OrderState.Completed); _payout(order, order.seller); emit OrderCompleted(orderId);
        } else if (order.status == OrderState.RefundReq) {
            _terminal(order, OrderState.RefundedToBuyer); _payout(order, order.payer); emit OrderRefundedToBuyer(orderId);
        } else revert InvalidState();
    }
    function deleteOrder(bytes16 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (msg.sender != order.buyer && msg.sender != order.seller && msg.sender != owner()) revert Unauthorized();
        if (order.status == OrderState.Initial) { _terminal(order, OrderState.Canceled); emit OrderCanceled(orderId); }
        OrderState finalState = order.status;
        if (finalState != OrderState.Completed && finalState != OrderState.RefundedToBuyer && finalState != OrderState.RefundedToSeller && finalState != OrderState.Canceled) revert InvalidState();
        delete _orders[orderId]; emit OrderDeleted(orderId, finalState);
    }
    function _state(bytes16 orderId, OrderState status) private view returns (Order storage order) {
        order = _orders[orderId]; if (order.status != status) revert InvalidState();
    }
    function _beforeDeadline(Order storage order) private view { if (block.timestamp >= order.deadline) revert DeadlinePassed(); }
    function _stage(Order storage order, OrderState status) private {
        order.status = status; order.updatedTs = uint64(block.timestamp); order.deadline = uint64(block.timestamp + STAGE_WINDOW);
    }
    function _terminal(Order storage order, OrderState status) private {
        order.status = status; order.updatedTs = uint64(block.timestamp); order.deadline = 0;
    }
    function _payout(Order storage order, address recipient) private {
        escrowedAmounts[order.priceToken] -= order.priceAmount;
        TempoEscrow.payout(IERC20(order.priceToken), recipient, order.priceAmount);
    }
    function _message(bytes16 orderId, Order storage order, uint8 messageType, MessageReference calldata messageReference) private returns (bytes32 result) {
        // Each type starts at 1; the lifecycle permits one buyer and one seller message.
        if (messageReference.sequence != 1) revert InvalidInput();
        address author = messageType == 1 ? order.buyer : order.seller;
        if (author != msg.sender) revert Unauthorized();
        result = TempoProtocol.commitment(TempoProtocol.Binding(1, block.chainid, address(this), orderId,
            messageType, messageReference.sequence, author, order.buyerIdentityId, order.sellerIdentityId), messageReference.buyerEnvelope, messageReference.sellerEnvelope);
        emit OrderMessage(orderId, messageType, author, messageReference.sequence, result, messageReference.buyerEnvelope, messageReference.sellerEnvelope);
    }
}
