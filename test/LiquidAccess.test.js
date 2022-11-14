const { ethers } = require("hardhat");
const { expect } = require("chai");
const { AddressZero } = ethers.constants;
const { time, BN } = require("@openzeppelin/test-helpers");

const expectRevert = async (statement, reason) => {
    await expect(statement).to.be.revertedWith(reason);
}

const expectRevertCustom = async (contract, statement, reason) => {
    await expect(statement).to.be.revertedWithCustomError(contract, reason);
}

describe("Contract: LiquidAccess", () => {
    let owner, wallet1, wallet2, wallet3;
    let liquidAccess;
    let mint;

    before(async () => {
        [owner, wallet1, wallet2, wallet3] = await ethers.getSigners();
    });

    beforeEach(async () => {
        const LiquidAccess = await ethers.getContractFactory("LiquidAccess");
        liquidAccess = await LiquidAccess.deploy("LiquidAccess", "LQD", "Merchant", 42);
        mint = async (subcriptionType = '', expirationDate = '') =>
            liquidAccess.safeMint(owner.address, subcriptionType, expirationDate);
    });

    describe("Contract info", () => {
        it("should have the correct name", async () => {
            expect(await liquidAccess.name()).to.equal("LiquidAccess");
        });

        it("should have the correct symbol", async () => {
            expect(await liquidAccess.symbol()).to.equal("LQD");
        });
    });

    describe("Merchant info", () => {
        it("should return merchant name", async () => {
            expect(await liquidAccess.merchantName()).to.equal("Merchant");
        });

        it("should return merchant id", async () => {
            expect(await liquidAccess.merchantId()).to.equal(42);
        });
    });

    describe("Token minting", async () => {
        it("should safeMint", async () => {
            await mint();
            expect(await liquidAccess.balanceOf(owner.address)).to.equal(1);
        });

        it("shoud return correct tokenId", async () => {
            for (let i = 1; i < 10; i++) {
                const tx = await mint();
                const receipt = await tx.wait();
                expect(receipt.events[0].args.tokenId).to.be.eq(i);
            }
        });

        it("should emit Transfer event", async () => {
            await expect(mint())
                .to.emit(liquidAccess, "Transfer")
                .withArgs(AddressZero, owner.address, 1);
        });

        it("should revert if not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).safeMint(owner.address, '', ''),
                "Ownable: caller is not the owner"
            );
            await expectRevert(
                liquidAccess.connect(wallet1).safeMint(wallet1.address, '', ''),
                "Ownable: caller is not the owner"
            );
        });
    });

    describe("Token info", async () => {
        const subcriptionType = "SuperPuper";
        const expirationDate = "Tomorrow";

        it("should have the correct subscription type", async () => {
            await mint(subcriptionType, '');
            expect(await liquidAccess.subscriptionTypeOf(1)).to.equal(subcriptionType);
        });

        it("should be able to change subscription type", async () => {
            await mint(subcriptionType, '');
            const newSubcriptionType = "SuperPuperDuper";
            await liquidAccess.setSubscriptionType(1, newSubcriptionType);
            expect(await liquidAccess.subscriptionTypeOf(1)).to.equal(newSubcriptionType);
        });

        it("should have the correct expiration date", async () => {
            await mint('', expirationDate);
            expect(await liquidAccess.expirationDateOf(1)).to.equal(expirationDate);
        });

        it("should be able to change expiration date", async () => {
            await mint('', expirationDate);
            const newExpirationDate = "AfterTomorrow";
            await liquidAccess.setExpirationDate(1, newExpirationDate);
            expect(await liquidAccess.expirationDateOf(1)).to.equal(newExpirationDate);
        });

        it("should revert if token does not exist", async () => {
            await expectRevertCustom(
                liquidAccess,
                liquidAccess.subscriptionTypeOf(1),
                "TokenIdNotFound"
            );
            await expectRevertCustom(
                liquidAccess,
                liquidAccess.expirationDateOf(1),
                "TokenIdNotFound"
            );
        });
    });

    describe("Transfer", async () => {
        it("should emit TransferFrom event with transfer counter", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await expect(liquidAccess.transferFrom(owner.address, wallet1.address, 1))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 1, 1);

            await liquidAccess.safeMint(owner.address, '', '');
            await expect(liquidAccess.transferFrom(owner.address, wallet1.address, 2))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 2, 2);
        });

        it("should revert if not token owner", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await expectRevert(
                liquidAccess.connect(wallet1).transferFrom(owner.address, wallet1.address, 1),
                "ERC721: caller is not token owner nor approved"
            );
        });
    });

    describe("SafeTransfer", async () => {
        it("should emit TransferFrom event with transfer counter", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await expect(liquidAccess["safeTransferFrom(address,address,uint256)"](owner.address, wallet1.address, 1))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 1, 1);

            await liquidAccess.safeMint(owner.address, '', '');
            await expect(liquidAccess["safeTransferFrom(address,address,uint256)"](owner.address, wallet1.address, 2))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 2, 2);
        });

        it("should revert if not token owner", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await expectRevert(
                liquidAccess.connect(wallet1)["safeTransferFrom(address,address,uint256)"](owner.address, wallet1.address, 1),
                "ERC721: caller is not token owner nor approved"
            );
        });
    });

    describe("Approved transfer", async () => {
        it("should be able to approve an address for a transfer", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.setApprovalForAll(wallet1.address, true);
            expect(await liquidAccess.isApprovedForAll(owner.address, wallet1.address)).to.be.true;
        });

        it("should be able to transfer by approved address", async () => {
            await mint();
            await mint();
            await liquidAccess.setApprovalForAll(wallet1.address, true);
            await liquidAccess.connect(wallet1).transferFrom(owner.address, wallet2.address, 1);
            await liquidAccess.connect(wallet1).transferFrom(owner.address, wallet2.address, 2);
            expect(await liquidAccess.ownerOf(1)).to.equal(wallet2.address);
            expect(await liquidAccess.ownerOf(2)).to.equal(wallet2.address);
        });
    });

    describe("Transfer Lockup", async () => {
        it("should be able to set lockup period", async () => {
            await liquidAccess.setLockupPeriod(100);
            expect(await liquidAccess.lockupPeriod()).to.equal(100);
        });

        it("should revert if not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).setLockupPeriod(100),
                "Ownable: caller is not the owner"
            );
        });

        it("should lock transfers after each transfer", async () => {
            await liquidAccess.setLockupPeriod(60);
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await expectRevert(
                liquidAccess.connect(wallet1).transferFrom(wallet1.address, wallet2.address, 1),
                "LA: Transfer is locked"
            );
        });

        it("should be able to retrieve lockup period of a token", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            expect(await liquidAccess.lockupLeftOf(1)).to.equal(0);
            await liquidAccess.setLockupPeriod(60);
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            expect(await liquidAccess.lockupLeftOf(1)).to.equal(60);
            await ethers.provider.send("evm_increaseTime", [30]);
            await ethers.provider.send("evm_mine");
            expect(await liquidAccess.lockupLeftOf(1)).to.equal(30);
            await ethers.provider.send("evm_increaseTime", [30]);
            await ethers.provider.send("evm_mine");
            expect(await liquidAccess.lockupLeftOf(1)).to.equal(0);
            await ethers.provider.send("evm_increaseTime", [30]);
            await ethers.provider.send("evm_mine");
            expect(await liquidAccess.lockupLeftOf(1)).to.equal(0);
        });

        it("should unlock transfers after lockup period", async () => {
            await liquidAccess.setLockupPeriod(60);
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");
            await liquidAccess.connect(wallet1).transferFrom(wallet1.address, wallet2.address, 1);
        });

        it("should not revert if lockup period is 0", async () => {
            await liquidAccess.setLockupPeriod(0);
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await liquidAccess.connect(wallet1).transferFrom(wallet1.address, wallet2.address, 1);
        });
    });
            

    describe("Royalty", async () => {
        it("should return 5% royalty by default", async () => {
            const [recipient, fee] = await liquidAccess.royaltyInfo(1, 1000);
            expect(recipient).to.equal(owner.address);
            expect(fee).to.equal(50);
        });

        it("should be able to change royalty recipient", async () => {
            await liquidAccess.setRoyalty(wallet1.address, 0);
            const [recipient,] = await liquidAccess.royaltyInfo(1, 1000);
            expect(recipient).to.equal(wallet1.address);
        });

        it("should be able to change royalty fee", async () => {
            await liquidAccess.setRoyalty(owner.address, 100);
            const [, fee] = await liquidAccess.royaltyInfo(1, 1000);
            expect(fee).to.equal(10);
        });

        it("should be able to remove royalty", async () => {
            await liquidAccess.setRoyalty(wallet1.address, 100);
            await liquidAccess.removeRoyalty();
            const [recipient, fee] = await liquidAccess.royaltyInfo(1, 1000);
            expect(recipient).to.equal(ethers.constants.AddressZero);
            expect(fee).to.equal(0);
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).setRoyalty(wallet1.address, 0),
                "Ownable: caller is not the owner"
            );

            await expectRevert(
                liquidAccess.connect(wallet1).removeRoyalty(),
                "Ownable: caller is not the owner"
            );
        });
    });

    describe("NFT blacklisting", async () => {
        it("should be able to blacklist NFT", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');

            await liquidAccess.addNFTToBlacklist(1);
            await liquidAccess.addNFTToBlacklist(3);

            expect(await liquidAccess.isNFTBlacklisted(1)).to.equal(true);
            expect(await liquidAccess.isNFTBlacklisted(2)).to.equal(false);
            expect(await liquidAccess.isNFTBlacklisted(3)).to.equal(true);
            expect(await liquidAccess.isNFTBlacklisted(4)).to.equal(false);
        });

        it("should be able to remove NFT from blacklist", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            
            await liquidAccess.addNFTToBlacklist(1);
            await liquidAccess.addNFTToBlacklist(3);

            await liquidAccess.removeNFTFromBlacklist(1);
            await liquidAccess.removeNFTFromBlacklist(3);

            expect(await liquidAccess.isNFTBlacklisted(1)).to.equal(false);
            expect(await liquidAccess.isNFTBlacklisted(2)).to.equal(false);
            expect(await liquidAccess.isNFTBlacklisted(3)).to.equal(false);
            expect(await liquidAccess.isNFTBlacklisted(4)).to.equal(false);
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).addNFTToBlacklist(1),
                "Ownable: caller is not the owner"
            );
            await expectRevert(
                liquidAccess.connect(wallet1).removeNFTFromBlacklist(1),
                "Ownable: caller is not the owner"
            );
        });

        it("should not be able to transfer blacklisted NFT", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.addNFTToBlacklist(1);

            await expectRevert(
                liquidAccess.transferFrom(owner.address, wallet1.address, 1),
                "LA: NFT is blacklisted"
            );
        });
    });

    describe("Address blacklisting", async () => {
        it("should be able to blacklist address", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');

            await liquidAccess.addAddressToBlacklist(wallet1.address);
            await liquidAccess.addAddressToBlacklist(wallet2.address);

            expect(await liquidAccess.isAddressBlacklisted(wallet1.address)).to.equal(true);
            expect(await liquidAccess.isAddressBlacklisted(wallet2.address)).to.equal(true);
            expect(await liquidAccess.isAddressBlacklisted(wallet3.address)).to.equal(false);
        });

        it("should be able to remove address from blacklist", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');

            await liquidAccess.addAddressToBlacklist(wallet1.address);
            await liquidAccess.addAddressToBlacklist(wallet2.address);

            await liquidAccess.removeAddressFromBlacklist(wallet1.address);
            await liquidAccess.removeAddressFromBlacklist(wallet2.address);

            expect(await liquidAccess.isAddressBlacklisted(wallet1.address)).to.equal(false);
            expect(await liquidAccess.isAddressBlacklisted(wallet2.address)).to.equal(false);
            expect(await liquidAccess.isAddressBlacklisted(wallet3.address)).to.equal(false);
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).addAddressToBlacklist(wallet1.address),
                "Ownable: caller is not the owner"
            );
            await expectRevert(
                liquidAccess.connect(wallet1).removeAddressFromBlacklist(wallet1.address),
                "Ownable: caller is not the owner"
            );
        });

        it("should not be able to transfer NFT to blacklisted address", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.addAddressToBlacklist(wallet1.address);

            await expectRevert(
                liquidAccess.transferFrom(owner.address, wallet1.address, 1),
                "LA: Recipient is blacklisted"
            );
        });

        it("should not be able to transfer NFT from blacklisted address", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.addAddressToBlacklist(owner.address);

            await expectRevert(
                liquidAccess.transferFrom(owner.address, wallet1.address, 1),
                "LA: NFT Holder is blacklisted"
            );
        });
    });

    describe("User tokens", async () => {
        it("should be able to retrieve user tokens", async () => {
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');
            await liquidAccess.safeMint(owner.address, '', '');

            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await liquidAccess.transferFrom(owner.address, wallet1.address, 3);

            expect(await liquidAccess.userTokens(owner.address)).to.deep.eq([4, 2]);
            expect(await liquidAccess.userTokens(wallet1.address)).to.deep.eq([1, 3]);
        });
    });

    describe("Metadata", async () => {
        async function getMetadata(id) {
            const tokenURI = await liquidAccess.tokenURI(1);
            // strip off the first 29 characters
            const base64 = tokenURI.slice(29);
            const metadata = Buffer.from(base64, 'base64').toString('utf-8');
            return JSON.parse(metadata.toString());
        }
        it("should be able to change NFT meta name", async () => {
            await mint();
            const name = "Liquid Access Pass";
            await liquidAccess.setNFTName(name);
            
            const metadata = await getMetadata(1);
            expect(metadata.name).to.equal(name + " #1");
        });

        it("should be able to change NFT meta description", async () => {
            await mint();
            const description = "Liquid Access Pass";
            await liquidAccess.setNFTDescription(description);

            const metadata = await getMetadata(1);
            expect(metadata.description).to.equal(description);
        });

        it("should be able to change NFT meta image", async () => {
            await mint();
            const image = "https://la-sc-test.io/logo.png";
            await liquidAccess.setNFTImage(image);

            const metadata = await getMetadata(1);
            expect(metadata.image).to.equal(image);
        });

        it("should have correct NFT meta attributes", async () => {
            const subcriptionType = 'abc';
            const expirationDate = 'xyz';
            await mint(subcriptionType, expirationDate);

            const metadata = await getMetadata(1);
            expect(metadata.attributes).to.deep.equal([
                {
                    "trait_type": "Subscription Type",
                    "display_type": "string",
                    "value": subcriptionType
                },
                {
                    "trait_type": "Expiration Date",
                    "display_type": "date",
                    "value": expirationDate
                }
            ]);
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).setNFTName(""),
                "Ownable: caller is not the owner"
            );
            await expectRevert(
                liquidAccess.connect(wallet1).setNFTDescription(""),
                "Ownable: caller is not the owner"
            );
            await expectRevert(
                liquidAccess.connect(wallet1).setNFTImage(""),
                "Ownable: caller is not the owner"
            );
        });
    });

    describe("Contract metadata", async () => {
        async function getContractMetadata() {
            const uri = await liquidAccess.contractURI();
            // strip off the first 29 characters
            const base64 = uri.slice(29);
            const metadata = Buffer.from(base64, 'base64').toString('utf-8');
            return JSON.parse(metadata.toString());
        }
        it("should be able to change contract meta name", async () => {
            const name = "Contract Name Test";
            await liquidAccess.setContractName(name);

            const metadata = await getContractMetadata();
            expect(metadata.name).to.equal(name);
        });

        it("should be able to change contract meta description", async () => {
            const description = "Contract Description Test";
            await liquidAccess.setContractDescription(description);

            const metadata = await getContractMetadata();
            expect(metadata.description).to.equal(description);
        });

        it("should use nft image as contract image", async () => {
            const image = "https://la-sc-test.io/logo.png";
            await liquidAccess.setNFTImage(image);

            const metadata = await getContractMetadata();
            expect(metadata.image).to.equal(image);
        });

        it("should contain royalty info", async () => {
            await liquidAccess.setRoyalty(wallet1.address, 100);
            const metadata = await getContractMetadata();
            expect(metadata.seller_fee_basis_points).to.equal(100);
            expect(metadata.fee_recipient).to.be.eq(wallet1.address.toLowerCase());
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).setContractName(""),
                "Ownable: caller is not the owner"
            );

            await expectRevert(
                liquidAccess.connect(wallet1).setContractDescription(""),
                "Ownable: caller is not the owner"
            );
        });
    });
            


    describe("Interface support", () => {
        it("should support ERC165", async () => {
            expect(await liquidAccess.supportsInterface("0x01ffc9a7")).to.be.true;
        });

        it("should support ERC721", async () => {
            expect(await liquidAccess.supportsInterface("0x80ac58cd")).to.be.true;
        });

        it("should support ERC721Metadata", async () => {
            expect(await liquidAccess.supportsInterface("0x5b5e139f")).to.be.true;
        });

        it("should support ERC721Enumerable", async () => {
            expect(await liquidAccess.supportsInterface("0x780e9d63")).to.be.true;
        });

        it("should support ERC2981", async () => {
            expect(await liquidAccess.supportsInterface("0x2a55205a")).to.be.true;
        });
    })
});