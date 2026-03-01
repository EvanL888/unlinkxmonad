const { ethers } = require('ethers');
const rpc = 'https://testnet-rpc.monad.xyz';
// Use a random private key just to test reads and writes
const wallet = ethers.Wallet.createRandom().connect(new ethers.JsonRpcProvider(rpc));

const lendingAddr = "0xc594e8A50ecE126EACC4975E95D5771D43b4BBA3";
const lendingABI = ['function outstandingObligations(address) external view returns (uint256)'];
const lending = new ethers.Contract(lendingAddr, lendingABI, wallet.provider);

(async () => {
    // Check the user the user mentioned in the logs if they actually had owed > 0
    let owed = await lending.outstandingObligations('0xb2A646e4bCa4dF55A9c6Ee77534D7D0cfF285549');
    console.log("Owed for user:", ethers.formatEther(owed));
})();
