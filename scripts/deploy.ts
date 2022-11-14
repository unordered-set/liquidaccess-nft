import hre, { ethers } from "hardhat";

async function main() {
  const Contract = await ethers.getContractFactory("LiquidAccess");
  const contract = await Contract.deploy(
    "Liquid Access",
    "LA",
    "Aloha Browser",
    10
  );

  await contract.deployed();

  console.log("LiquidAccess deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
