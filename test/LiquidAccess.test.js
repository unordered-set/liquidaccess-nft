const { ethers } = require("hardhat");
const { expect, assert } = require("chai");
const { AddressZero } = ethers.constants;
const { time, BN } = require("@openzeppelin/test-helpers");
const util = require('util')

const expectRevert = async (statement, reason) => {
    await expect(statement).to.be.revertedWith(reason);
}

const expectRevertCustom = async (contract, statement, reason) => {
    await expect(statement).to.be.revertedWithCustomError(contract, reason);
}

describe("Contract: LiquidAccess", () => {
    let owner, wallet1, wallet2, wallet3, minter;
    let liquidAccess;
    let mint, batchMint;
    let LiquidAccess;

    before(async () => {
        [owner, wallet1, wallet2, wallet3, minter] = await ethers.getSigners();
    });

    beforeEach(async () => {
        LiquidAccess = await ethers.getContractFactory("LiquidAccess");
        liquidAccess = await LiquidAccess.deploy("LiquidAccess", "LQD", "Merchant", 42);
        mint = (uri = 'ipfs://S9332fa/some') => liquidAccess.connect(minter).safeMint(owner.address, uri);
        batchMint = (recipients = [owner, wallet1, wallet2, owner, wallet3].map(s => s.address),
                     uris = [1, 2, 3, 4, 5].map(i => `ipfs://S9332fa/${i}`)) => 
            liquidAccess.connect(minter).batchMint(recipients, uris);
        const assignMinterRoleTx = await liquidAccess.grantRole(await liquidAccess.MINTER_ROLE(), minter.address)
        await assignMinterRoleTx.wait()
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
            expect(await liquidAccess._merchantName()).to.equal("Merchant");
        });

        it("should return merchant id", async () => {
            expect(await liquidAccess._merchantId()).to.equal(42);
        });
    });

    describe("Token minting", async () => {
        it("should safeMint", async () => {
            await mint();
            expect(await liquidAccess.balanceOf(owner.address)).to.equal(1);
        });

        it("should return correct tokenId", async () => {
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
                liquidAccess.connect(wallet1).safeMint(owner.address, ''),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
            );
            await expectRevert(
                liquidAccess.connect(wallet1).safeMint(wallet1.address, ''),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
            );
        });

        it("should not mint to emptry contract", async () => {
            const EmptyContract = await ethers.getContractFactory("EmptyContract");
            const emptyContract = await EmptyContract.deploy();
            await expectRevert(
                liquidAccess.connect(minter).safeMint(emptyContract.address, ''),
                "ERC721: transfer to non ERC721Receiver implementer"
            );
        })
    });

    describe("Token Burn", async () => {
        it("should be able to burn existing token", async () => {
            const minttx = await mint();
            const minteffects = await minttx.wait()
            expect(await liquidAccess.balanceOf(owner.address)).to.equal(1);
            const tx = await liquidAccess.burn(1);
            await tx.wait()
            expect(await liquidAccess.balanceOf(owner.address)).to.equal(0);
            await expectRevert(
                liquidAccess.ownerOf(1),
                "ERC721: invalid token ID"
            )
        });

        it("fails burning non existing token", async () => {
            await expectRevert(
                liquidAccess.burn(100),
                "ERC721: invalid token ID"
            )
        });

        it("Allows for the side contract to burn a token", async () => {
            const MarketPlace = await ethers.getContractFactory("MarketPlace")
            const marketPlace = await MarketPlace.deploy()
            const burntx = await mint()
            expect (await liquidAccess.totalSupply()).to.be.eq(1)

            const approveTx = await liquidAccess.approve(marketPlace.address, 1)
            await marketPlace.unmint(liquidAccess.address, 1)
            expect (await liquidAccess.totalSupply()).to.be.eq(0)
        })
    })

    describe("Batch minting", async () => {
        const checkAmounts = async (amounts) => {
            for (const address of Object.keys(amounts)) {
                const amount = await liquidAccess.balanceOf(address);
                expect(amount).to.be.eq(amounts[address]);
            }
        }

        const extractIdsFromReciept = async (recieptFut) => {
            const tokenIds = (await recieptFut).events.filter(e => e.event === 'Transfer').map(e => e.args[2]);
            tokenIds.sort((a, b) => a - b);
            return tokenIds;
        }

        it("should deliver NFTs to recipients", async () => {
            await batchMint();
            await checkAmounts({
                [owner.address]: 2,
                [wallet1.address]: 1,
                [wallet2.address]: 1,
                [wallet3.address]: 1,
            })
        })

        it("should continue enumeration", async () => {
            const tx1 = await batchMint();
            expect(await extractIdsFromReciept(tx1.wait())).to.be.deep.eq([1,2,3,4,5]);

            const tx2 = await batchMint();
            expect(await extractIdsFromReciept(tx2.wait())).to.be.deep.eq([6,7,8,9,10]);

            expect(await liquidAccess.totalSupply()).to.be.eq(10)
        })

        it("should not allow owner to mint", async () => {
            await expectRevert(
                liquidAccess.connect(owner).batchMint([owner.address], ['ipfs://something']),
                `AccessControl: account ${owner.address.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
            );
            await expectRevert(
                liquidAccess.connect(wallet2).batchMint([wallet2.address], ['ipfs://something']),
                `AccessControl: account ${wallet2.address.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
            );
        })

        it("should not mint to banned users", async () => {
            await liquidAccess.banUser(wallet2.address);
            const tx = await batchMint();
            expect(await extractIdsFromReciept(tx.wait())).to.be.deep.eq([1,2,4,5]);
            await checkAmounts({
                [owner.address]: 2,
                [wallet1.address]: 1,
                [wallet2.address]: 0,
                [wallet3.address]: 1,
            })

            expect(await liquidAccess.totalSupply()).to.be.eq(4);
        })

        it("no error when minting to non ERC721Receiver contracts (unfortunately)", async () => {
            const EmptyContract = await ethers.getContractFactory("EmptyContract");
            const emptyContract = await EmptyContract.deploy();

            const tx = await batchMint([owner.address, emptyContract.address], ["ipfs://1", "ipfs://2"]);
            expect(await extractIdsFromReciept(tx.wait())).to.be.deep.eq([1,2]);
            await checkAmounts({
                [owner.address]: 1,
                [emptyContract.address]: 1,
            })
        })
    })

    describe("ERC2612: Permit", async () => {
        let marketPlace;
        let signAndPrepareTx;
        let domainData;

        const permitType = [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "tokenId", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "nonce", type: "uint256" },
        ];

        before(async() => {
            const MarketPlace = await ethers.getContractFactory("MarketPlace");
            marketPlace = await MarketPlace.deploy();
        })

        beforeEach(async() => {
            await batchMint();

            domainData = {
                name: await liquidAccess.name(),
                version: "1.0",
                chainId: "31337",
                verifyingContract: liquidAccess.address,
            };

            signAndPrepareTx = async (signer, permitData) => {
                const signature = (await signer._signTypedData(
                    domainData, {permit: permitType}, permitData
                )).substring(2);
                const r = "0x" + signature.substring(0, 64);
                const s = "0x" + signature.substring(64, 128);
                const v = parseInt(signature.substring(128, 130), 16);
    
                return liquidAccess.connect(wallet3).permit(
                    permitData.owner, permitData.spender, permitData.tokenId, permitData.deadline, permitData.nonce,
                    v, r, s);
            }
        })

        it("should not allow to transfer to marketplace without permission", async () => {
            // This test mostly to check that permissions system hasn't changed to whitelist MarketPlace,
            // because if is it whitelisted by approveForAll or something of that sort, tests below are not
            // testing anything.
            await expectRevert(
                marketPlace.submit(liquidAccess.address, 1),
                "ERC721: caller is not token owner nor approved"
            );
        })

        it("should check the permission", async () => {
            const permitFrom = wallet1;
            const timeStamp = (await ethers.provider.getBlock("latest")).timestamp
            const permitData = {
                owner: permitFrom.address,
                spender: marketPlace.address,
                tokenId: 1,  // Belongs to owner, not to wallet1.
                deadline: timeStamp + 60,
                nonce: 0,
            };
            const op = signAndPrepareTx(permitFrom, permitData);
            await expectRevertCustom(LiquidAccess, op, "NotOwner");
        })

        it("should check the nonce, not allowing to re-use same signature", async () => {
            const permitFrom = wallet1;
            const usersToken = (await liquidAccess.userTokens(permitFrom.address))[0];
            const timeStamp = (await ethers.provider.getBlock("latest")).timestamp
            const permitData = {
                owner: permitFrom.address,
                spender: marketPlace.address,
                tokenId: usersToken,
                deadline: timeStamp + 60,
                nonce: 0,
            };
            const signature = (await permitFrom._signTypedData(
                domainData, {permit: permitType}, permitData
            )).substring(2);
            const r = "0x" + signature.substring(0, 64);
            const s = "0x" + signature.substring(64, 128);
            const v = parseInt(signature.substring(128, 130), 16);

            // First attempt should be OK.
            await liquidAccess.connect(wallet3).permit(
                permitData.owner, permitData.spender, permitData.tokenId, permitData.deadline, permitData.nonce,
                v, r, s);

            // Second attempt not OK.
            await expectRevertCustom(
                LiquidAccess,
                liquidAccess.connect(wallet3).permit(
                    permitData.owner, permitData.spender, permitData.tokenId, permitData.deadline, permitData.nonce,
                    v, r, s),
                "WrongNonce");

            // But after updating nonce should be OK.
            permitData.nonce = 1;

            const signature2 = (await permitFrom._signTypedData(
                domainData, {permit: permitType}, permitData
            )).substring(2);
            const r2 = "0x" + signature2.substring(0, 64);
            const s2 = "0x" + signature2.substring(64, 128);
            const v2 = parseInt(signature2.substring(128, 130), 16);

            await liquidAccess.connect(wallet3).permit(
                permitData.owner, permitData.spender, permitData.tokenId, permitData.deadline, permitData.nonce,
                v2, r2, s2);            
        })

        it("should check the deadline", async () => {
            const permitFrom = wallet1;
            const usersToken = (await liquidAccess.userTokens(permitFrom.address))[0];
            const timeStamp = (await ethers.provider.getBlock("latest")).timestamp
            const permitData = {
                owner: permitFrom.address,
                spender: marketPlace.address,
                tokenId: usersToken,
                deadline: timeStamp - 60,
                nonce: 0,
            };
            const op = signAndPrepareTx(permitFrom, permitData);
            await expectRevertCustom(LiquidAccess, op, "AfterDeadline");
        })

        it("when signature is OK, permission works", async () => {
            const permitFrom = wallet1;
            const usersToken = (await liquidAccess.userTokens(permitFrom.address))[0];
            const timeStamp = (await ethers.provider.getBlock("latest")).timestamp
            const permitData = {
                owner: permitFrom.address,
                spender: marketPlace.address,
                tokenId: usersToken,
                deadline: timeStamp + 60,
                nonce: 0,
            };
            const op = signAndPrepareTx(permitFrom, permitData);
            await op;
            await marketPlace.submit(liquidAccess.address, permitData.tokenId);
        })
    })

    describe("Transfer", async () => {
        it("should emit TransferFrom event with transfer counter", async () => {
            await mint();
            await expect(liquidAccess.transferFrom(owner.address, wallet1.address, 1))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 1, 1);

            await mint();
            await expect(liquidAccess.transferFrom(owner.address, wallet1.address, 2))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 2, 2);
        });

        it("should revert if not token owner", async () => {
            await mint();
            await expectRevert(
                liquidAccess.connect(wallet1).transferFrom(owner.address, wallet1.address, 1),
                "ERC721: caller is not token owner nor approved"
            );
        });
    });

    describe("SafeTransfer", async () => {
        it("should emit TransferFrom event with transfer counter", async () => {
            await mint();
            await expect(liquidAccess["safeTransferFrom(address,address,uint256)"](owner.address, wallet1.address, 1))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 1, 1);

            await mint();
            await expect(liquidAccess["safeTransferFrom(address,address,uint256)"](owner.address, wallet1.address, 2))
                .to.emit(liquidAccess, "TransferFrom")
                .withArgs(owner.address, wallet1.address, 2, 2);
        });

        it("should revert if not token owner", async () => {
            await mint();
            await expectRevert(
                liquidAccess.connect(wallet1)["safeTransferFrom(address,address,uint256)"](owner.address, wallet1.address, 1),
                "ERC721: caller is not token owner nor approved"
            );
        });
    });

    describe("Approved transfer", async () => {
        it("should be able to approve an address for a transfer", async () => {
            await mint();
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
            expect(await liquidAccess._lockupPeriod()).to.equal(100);
        });

        it("should revert if lockup is greater than 30 days", async () => {
            await expectRevertCustom(
                LiquidAccess,
                liquidAccess.setLockupPeriod(31 * 24 * 60 * 60),
                "PeriodTooLong"
            );
        });

        it("should revert if not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).setLockupPeriod(100),
                "AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
            );
        });

        it("should lock transfers after each transfer", async () => {
            await liquidAccess.setLockupPeriod(60);
            await mint();
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await expectRevertCustom(
                LiquidAccess,
                liquidAccess.connect(wallet1).transferFrom(wallet1.address, wallet2.address, 1),
                "TransferIsLocked"
            );
        });

        it("should be able to retrieve lockup period of a token", async () => {
            await mint();
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
            await mint();
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await ethers.provider.send("evm_increaseTime", [60]);
            await ethers.provider.send("evm_mine");
            await liquidAccess.connect(wallet1).transferFrom(wallet1.address, wallet2.address, 1);
        });

        it("should not revert if lockup period is 0", async () => {
            await liquidAccess.setLockupPeriod(0);
            await mint();
            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await liquidAccess.connect(wallet1).transferFrom(wallet1.address, wallet2.address, 1);
        });

        it("should not be locked just after mint", async () => {
            await liquidAccess.setLockupPeriod(30);
            await mint();
            await liquidAccess.transferFrom(owner.address, wallet2.address, 1);
        })
    });
            

    describe("Royalty", async () => {
        it("should return 2.5% royalty by default", async () => {
            const [recipient, fee] = await liquidAccess.royaltyInfo(1, 1000);
            expect(recipient).to.equal(owner.address);
            expect(fee).to.equal(25);
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
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
            );

            await expectRevert(
                liquidAccess.connect(wallet1).removeRoyalty(),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
            );
        });
    });

    describe("NFT freezing", async () => {
        it("should be able to blacklist NFT", async () => {
            await mint();
            await mint();
            await mint();
            await mint();

            await liquidAccess.freezeNft(1);
            await liquidAccess.freezeNft(3);

            expect(await liquidAccess.frozenNFTList(1)).to.equal(true);
            expect(await liquidAccess.frozenNFTList(2)).to.equal(false);
            expect(await liquidAccess.frozenNFTList(3)).to.equal(true);
            expect(await liquidAccess.frozenNFTList(4)).to.equal(false);
        });

        it("should be able to remove NFT from blacklist", async () => {
            await mint();
            await mint();
            await mint();
            await mint();
            
            await liquidAccess.freezeNft(1);
            await liquidAccess.freezeNft(3);

            await liquidAccess.unfreezeNft(1);
            await liquidAccess.unfreezeNft(3);

            expect(await liquidAccess.frozenNFTList(1)).to.equal(false);
            expect(await liquidAccess.frozenNFTList(2)).to.equal(false);
            expect(await liquidAccess.frozenNFTList(3)).to.equal(false);
            expect(await liquidAccess.frozenNFTList(4)).to.equal(false);
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).freezeNft(1),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`

            );
            await expectRevert(
                liquidAccess.connect(wallet1).unfreezeNft(1),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`

            );
        });

        it("should not be able to transfer blacklisted NFT", async () => {
            await mint();
            await liquidAccess.freezeNft(1);

            await expectRevertCustom(
                LiquidAccess,
                liquidAccess.transferFrom(owner.address, wallet1.address, 1),
                "NFTisFrozen"
            );
        });
    });

    describe("Address blacklisting", async () => {
        it("should be able to blacklist address", async () => {
            await mint();
            await mint();
            await mint();
            await mint();

            await liquidAccess.banUser(wallet1.address);
            await liquidAccess.banUser(wallet2.address);

            expect(await liquidAccess.bannedUsersList(wallet1.address)).to.equal(true);
            expect(await liquidAccess.bannedUsersList(wallet2.address)).to.equal(true);
            expect(await liquidAccess.bannedUsersList(wallet3.address)).to.equal(false);
        });

        it("should be able to remove address from blacklist", async () => {
            await mint();
            await mint();
            await mint();
            await mint();

            await liquidAccess.banUser(wallet1.address);
            await liquidAccess.banUser(wallet2.address);

            await liquidAccess.unbanUser(wallet1.address);
            await liquidAccess.unbanUser(wallet2.address);

            expect(await liquidAccess.bannedUsersList(wallet1.address)).to.equal(false);
            expect(await liquidAccess.bannedUsersList(wallet2.address)).to.equal(false);
            expect(await liquidAccess.bannedUsersList(wallet3.address)).to.equal(false);
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).banUser(wallet1.address),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
            );
            await expectRevert(
                liquidAccess.connect(wallet1).unbanUser(wallet1.address),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
            );
        });

        it("should not be able to transfer NFT to blacklisted address", async () => {
            await mint();
            await liquidAccess.banUser(wallet1.address);

            await expectRevertCustom(
                LiquidAccess,
                liquidAccess.transferFrom(owner.address, wallet1.address, 1),
                "RecipientIsBanned"
            );
        });

        it("should not be able to transfer NFT from blacklisted address", async () => {
            await mint();
            await liquidAccess.banUser(owner.address);

            await expectRevertCustom(
                LiquidAccess,
                liquidAccess.transferFrom(owner.address, wallet1.address, 1),
                "HolderIsBanned"
            );
        });
    });

    describe("User tokens", async () => {
        it("should be able to retrieve user tokens", async () => {
            for (let i = 0; i < 4; ++i) {
                await mint();
            }

            await liquidAccess.transferFrom(owner.address, wallet1.address, 1);
            await liquidAccess.transferFrom(owner.address, wallet1.address, 3);

            expect(await liquidAccess.userTokens(owner.address)).to.deep.eq([4, 2]);
            expect(await liquidAccess.userTokens(wallet1.address)).to.deep.eq([1, 3]);
        });
    });

    describe("Metadata", async () => {
        beforeEach(async () => {
            await mint('ipfs://some-uri-assigned');
        })

        it("should have assigned URI after minting", async () => {
            const uri = await liquidAccess.tokenURI(1)
            expect(uri).to.be.eq('ipfs://some-uri-assigned')
        });

        it("should be able to change NFT URI", async () => {
            const changeURItx = await liquidAccess.connect(minter).changeTokenUri(1, 'ipfs://newAddress')
            const receipt = await changeURItx.wait()

            const updates = receipt.events.filter(e => e.event === 'MetadataUpdate')
            expect(updates).to.have.length(1);
            expect(updates[0].args[0]).to.be.eq(1)

            const uri = await liquidAccess.tokenURI(1)
            expect(uri).to.be.eq('ipfs://newAddress')
        });

        it("should revert if caller is not owner", async () => {
            await expectRevert(
                liquidAccess.connect(wallet1).changeTokenUri(1, 'ipfs://wrong-address'),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
            );
            await expectRevert(
                liquidAccess.connect(owner).changeTokenUri(1, 'ipfs://wrong-address'),
                `AccessControl: account ${owner.address.toLowerCase()} is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
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

        it("should be able to change contract meta image", async () => {
            const image = "https://la-sc-test.io/logo.png";
            await liquidAccess.setContractImage(image);

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
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
            );

            await expectRevert(
                liquidAccess.connect(wallet1).setContractDescription(""),
                `AccessControl: account ${wallet1.address.toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
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
