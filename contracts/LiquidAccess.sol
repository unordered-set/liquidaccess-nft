// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;


import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "./interfaces/IERC4906.sol";

contract LiquidAccess is ERC165, ERC721Burnable, ERC721Enumerable, ERC721URIStorage, ERC2981, IERC4906, AccessControl, EIP712 {
    using Strings for uint256;

    /// @notice MAX_LOCKUP_PERIOD is hardcoded in the contract and can not be changed.
    ///         But owner can set _lockupPeriod, the actual value to something between
    ///         0 and MAX_LOCKUP_PERIOD.
    uint256 public immutable MAX_LOCKUP_PERIOD = 30 days;
    uint256 public _lockupPeriod;  // duration of lockup period in seconds
    mapping(uint256 => uint256) private _lockups;  // locked up until timestamp


    string public _merchantName; // Merchant name
    uint256 public immutable _merchantId; // Merchant id
    string private _contractName;
    string private _contractDescription;
    string private _contractImage;


    uint256 public _tranferFromCounter; // TransferFrom counter


    mapping(address => bool) public bannedUsersList;
    mapping(uint256 => bool) public frozenNFTList;


    bytes32 public immutable MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 public _nextTokenId;

    /// @dev For each user and each NFT we are storing what was the latest
    //       nonce. Then we are allowing to call permit() only for the most
    //       recent nonce. All of the previous nonces, even if not used,
    //       are void. On the other hand, adding NFT to this mapping allows
    //       having multiple permits active.
    mapping(address => mapping(uint256 => uint256)) _permitNonces;

    // ============================================
    // Events section
    // ============================================

    event TransferFrom(
        address indexed from,
        address indexed to,
        uint256 tokenId,
        uint256 indexed count
    );

    event LockupPeriod(
        uint256 indexed previous,
        uint256 indexed current
    );

    event NftFrozen(
        uint256 indexed tokenId,
        bool indexed status
    );

    event AddressBanned(
        address indexed user,
        bool indexed status
    );

    event ContractName(
        string indexed previous,
        string indexed current
    );

    event ContractDescription(
        string indexed previous,
        string indexed current
    );

    event ContractImage(
        string indexed previous,
        string indexed current
    );

    // ============================================
    // Errors section
    // ============================================

    error AfterDeadline(
        uint256 providedDeadline,
        uint256 currentTime
    );

    error ApproveToOwner();

    error HolderIsBanned(
        address holder
    );

    error NFTisFrozen(
        uint256 tokenId
    );

    error NotOwner(
        address who,
        address expectedOwner,
        uint256 tokenId
    );

    error PeriodTooLong(
        uint256 providedPeriod,
        uint256 allowedPeriod
    );

    error RecipientIsBanned(
        address recipient
    );

    error TokenIdNotFound(
        uint256 tokenId
    );

    error TransferIsLocked(
        uint256 lockedUntil,
        uint256 currentTime
    );

    error WrongInputs();

    error WrongNonce(
        uint256 providedNonce,
        uint256 currentNonce
    );

    error WrongSigner(
        address expected,
        address actual
    );

    // ============================================
    // Modifiers section
    // ============================================

    modifier tokenExists(uint256 tokenId) {
        if (!_exists(tokenId)) {
            revert TokenIdNotFound(tokenId);
        }
        _;
    }

    /// @dev Important to have all families or our contract to have unique
    ///      names. Otherwise, permit could be re-used.
    constructor(
        string memory name_,
        string memory symbol_,
        string memory merchantName_,
        uint256 merchantId_
    ) ERC721(name_, symbol_)
      EIP712(name_, "1.0")
    {
        _merchantName = merchantName_;
        _merchantId = merchantId_;

        _nextTokenId = 1;

        _setDefaultRoyalty(msg.sender, 250);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============================================
    // Views section
    // ============================================

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC2981, ERC165, AccessControl)
        returns (bool)
    {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        tokenExists(tokenId)
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    /// @dev could be external but used in tests, thus public
    function lockupLeftOf(uint256 tokenId)
        public
        view
        tokenExists(tokenId)
        returns (uint256)
    {
        uint256 lockup = _lockups[tokenId];
        if (lockup == 0 || block.timestamp >= lockup) {
            return 0;
        }
        return lockup - block.timestamp;
    }

    function userTokens(address user)
        external
        view
        returns (uint256[] memory)
    {
        uint256 tokenCount = balanceOf(user);
        uint256[] memory tokens = new uint256[](tokenCount);
        for (uint256 i = 0; i < tokenCount; i++) {
            tokens[i] = tokenOfOwnerByIndex(user, i);
        }
        return tokens;
    }

    function contractURI() external view returns (string memory) {
        (address receiver, uint256 fee) = royaltyInfo(0, _feeDenominator());
        string memory receiverString = Strings.toHexString(receiver);
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(
                        bytes(
                            abi.encodePacked(
                                '{"name":"',_contractName,'",',
                                '"description":"',_contractDescription,'",',
                                '"image":"',_contractImage,'",',
                                '"seller_fee_basis_points":',fee.toString(),',',
                                '"fee_recipient":"',receiverString,'"',
                                '}'
                            )
                        )
                    )
                )
            );
    }

    // ============================================
    // Public section
    // ============================================

    /// @notice Everyone who posesses user's signature which satisfies to this signature,
    ///         can call this method to get a transfer approved.
    /// @dev This is some deviation from EIP-2612 for NFTs.
    function permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint256 nonce, uint8 v, bytes32 r, bytes32 s)
        external
    {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("permit(address owner,address spender,uint256 tokenId,uint256 deadline,uint256 nonce)"),
            owner,
            spender,
            tokenId,
            deadline,
            nonce)));
        address signer = ECDSA.recover(digest, v, r, s);
        address tokenOwner = ERC721.ownerOf(tokenId);
        if (owner != signer) revert WrongSigner(owner, signer);
        if (tokenOwner != signer) revert NotOwner(signer, tokenOwner, tokenId);
        if (block.timestamp > deadline) revert AfterDeadline(deadline, block.timestamp);
        if (nonce != _permitNonces[owner][tokenId]) revert WrongNonce(nonce, _permitNonces[owner][tokenId]);
        if (spender == owner) revert ApproveToOwner();

        _approve(spender, tokenId);
        ++_permitNonces[owner][tokenId];
    }

    // ============================================
    // Admin section
    // ============================================

    /// @notice Sets royalty recipient and fee
    /// @param _recipient Who will receive royalty
    /// @param _royaltyFee Nominator of royalty amount, assuming the default denominator of 10000.
    function setRoyalty(address _recipient, uint96 _royaltyFee)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setDefaultRoyalty(_recipient, _royaltyFee);
    }

    /// @notice Effectively erases all information about royalties, so selling this NFT becomes free.
    function removeRoyalty()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _deleteDefaultRoyalty();
    }

    /// @notice Generates a new NFT and places it to `to` account
    function safeMint(address to, string calldata uri)
        external
        onlyRole(MINTER_ROLE)
        returns(uint256)
    {
        uint256 tokenId = _nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        unchecked {
            ++_nextTokenId;
        }
        return tokenId;
    }

    /// @notice Generates a series of new NFTs and places it to recipient's accounts
    /// @dev Here we are using _mint, and not a _safeMint. Because _safeMint checks onERC721Received,
    ///      so the malitious user can place some contract which does some bad actions,
    ///      i.e. reverts and stops mint, adds theirs blocked addresses etc.
    function batchMint(
        address[] calldata recipients,
        string[] calldata uris
    )
        external
        onlyRole(MINTER_ROLE)
    {
        if (recipients.length != uris.length) revert WrongInputs();

        uint256 tokenId = _nextTokenId;
        for (uint16 i = 0; i < recipients.length; ) {
            if (!bannedUsersList[recipients[i]]) {
                _mint(recipients[i], tokenId);
                _setTokenURI(tokenId, uris[i]);
            }
            // Yes, there will be some gaps in tokenIds, when users are providing
            // blocked addresses. This is needed because uris are representing
            // already generated JSON's and assumes that all previous mints in a batch
            // are successful.
            unchecked {
                ++i;
                ++tokenId;
            }
        }
        _nextTokenId = tokenId;
    }

    function changeTokenUri(uint256 tokenId, string calldata newUri)
        external
        tokenExists(tokenId)
        onlyRole(MINTER_ROLE)
    {
        _setTokenURI(tokenId, newUri);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Set a new lockup petiod. Existing lockups are not affected.
    function setLockupPeriod(uint256 period)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (period > MAX_LOCKUP_PERIOD) revert PeriodTooLong(period, MAX_LOCKUP_PERIOD);
        emit LockupPeriod(_lockupPeriod, period);
        _lockupPeriod = period;
    }

    function freezeNft(uint256 _nft)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        tokenExists(_nft)
    {
        frozenNFTList[_nft] = true;
        emit NftFrozen(_nft, true);
    }

    function unfreezeNft(uint256 _nft)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        tokenExists(_nft)
    {
        delete frozenNFTList[_nft];
        emit NftFrozen(_nft, false);
    }

    function banUser(address _address)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        bannedUsersList[_address] = true;
        emit AddressBanned(_address, true);
    }

    function unbanUser(address _address)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        delete bannedUsersList[_address];
        emit AddressBanned(_address, false);
    }

    /// @dev Emits update showing that metadata for all tokens was updated.
    function updateAllTokensMetadata()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_nextTokenId > 1) {
            emit BatchMetadataUpdate(1, _nextTokenId - 1);
        }
    }

    function setContractName(string calldata contractName_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit ContractName(_contractName, contractName_);
        _contractName = contractName_;
    }

    function setContractDescription(string calldata description)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit ContractDescription(_contractDescription, description);
        _contractDescription = description;
    }

    function setContractImage(string calldata image)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit ContractImage(_contractImage, image);
        _contractImage = image;
    }

    // ============================================
    // Internals
    // ============================================
    
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    )
        internal
        virtual
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);

        // Transfer or burn
        if (from != address(0)) {
            if (bannedUsersList[from]) revert HolderIsBanned(from);
        }

        // Mint or transfer
        if (to != address(0)) {
            if (bannedUsersList[to]) revert RecipientIsBanned(to);
        }

        // A transfer
        if (from != address(0) && to != address(0)) {
            if (frozenNFTList[tokenId]) revert NFTisFrozen(tokenId);
            
            uint256 lockup = _lockups[tokenId];
            if (lockup != 0 && block.timestamp < lockup) {
                revert TransferIsLocked(lockup, block.timestamp);
            }

            _lockup(tokenId);

            unchecked { ++_tranferFromCounter; }
            emit TransferFrom(from, to, tokenId, _tranferFromCounter);
        }
    }

    function _lockup(uint256 tokenId)
        private
    {
        if (_lockupPeriod > 0) {
            _lockups[tokenId] = block.timestamp + _lockupPeriod;
        }
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }
}
