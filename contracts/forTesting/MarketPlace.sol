// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";


/// @dev Just a valid NFT receiver.
contract MarketPlace {
    function submit(IERC721 collection, uint256 tokenId) external {
        collection.safeTransferFrom(collection.ownerOf(tokenId), address(this), tokenId);
    }

    function unmint(ERC721Burnable collection, uint256 tokenId) external {
        collection.burn(tokenId);
    }

    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256, /* tokenId */
        bytes calldata /* data */
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
