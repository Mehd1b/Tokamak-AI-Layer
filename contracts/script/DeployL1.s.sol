// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/bridge/TALStakingBridgeL1.sol";
import "../src/bridge/TALSlashingConditionsL1.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployL1
 * @notice Deployment script for TAL L1 bridge contracts on Ethereum
 * @dev Deploys TALStakingBridgeL1 + TALSlashingConditionsL1 with proper linking
 *
 * Usage:
 *   1. Set environment variables in .env
 *   2. Source env: source .env
 *   3. Deploy:
 *      forge script script/DeployL1.s.sol \
 *        --broadcast --rpc-url $L1_RPC_URL \
 *        --verify --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * Environment variables:
 *   - PRIVATE_KEY: Deployer private key (required)
 *   - L1_RPC_URL: L1 Ethereum RPC endpoint (required)
 *   - SEIG_MANAGER: SeigManagerV3_1 address on L1 (required for mainnet)
 *   - L1_CROSS_DOMAIN_MESSENGER: L1CrossDomainMessenger address (required)
 *   - L2_BRIDGE_ADDRESS: TALStakingBridgeL2 proxy address on L2 (set after L2 deploy)
 *   - TAL_LAYER2_ADDRESS: Tokamak layer2 address for stakeOf queries (required)
 *   - ETHERSCAN_API_KEY: For contract verification (optional)
 *
 * Deployment order:
 *   1. TALSlashingConditionsL1 (needs bridgeL1 for SLASHER_ROLE, set after)
 *   2. TALStakingBridgeL1 (references slashingConditions)
 *   3. Grant SLASHER_ROLE on SlashingConditions to StakingBridge
 */
contract DeployL1 is Script {
    TALStakingBridgeL1 public stakingBridge;
    TALSlashingConditionsL1 public slashingConditions;

    address public stakingBridgeImpl;
    address public slashingConditionsImpl;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // L1 external addresses
        address seigManager = vm.envOr("SEIG_MANAGER", address(0));
        address l1Messenger = vm.envOr("L1_CROSS_DOMAIN_MESSENGER", address(0));
        address l2BridgeAddress = vm.envOr("L2_BRIDGE_ADDRESS", address(0));
        address talLayer2Address = vm.envOr("TAL_LAYER2_ADDRESS", address(0));

        console.log("=== TAL L1 Bridge Deployment ===");
        console.log("");
        console.log("Deployer:", deployer);
        console.log("SeigManager:", seigManager);
        console.log("L1 Messenger:", l1Messenger);
        console.log("L2 Bridge:", l2BridgeAddress);
        console.log("TAL Layer2:", talLayer2Address);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============ 1. Deploy TALSlashingConditionsL1 ============

        console.log("Deploying TALSlashingConditionsL1...");
        TALSlashingConditionsL1 slashingImpl = new TALSlashingConditionsL1();
        slashingConditionsImpl = address(slashingImpl);

        // bridgeL1_ is set to deployer temporarily; will grant SLASHER_ROLE to bridge after
        bytes memory slashingData = abi.encodeWithSelector(
            TALSlashingConditionsL1.initialize.selector,
            deployer,           // admin
            seigManager,        // SeigManagerV3_1
            talLayer2Address,   // layer2 address for stakeOf
            deployer            // temporary bridgeL1 (deployer gets SLASHER_ROLE)
        );
        ERC1967Proxy slashingProxy = new ERC1967Proxy(slashingConditionsImpl, slashingData);
        slashingConditions = TALSlashingConditionsL1(address(slashingProxy));
        console.log("  Implementation:", slashingConditionsImpl);
        console.log("  Proxy:", address(slashingConditions));

        // ============ 2. Deploy TALStakingBridgeL1 ============

        console.log("Deploying TALStakingBridgeL1...");
        TALStakingBridgeL1 bridgeImpl = new TALStakingBridgeL1();
        stakingBridgeImpl = address(bridgeImpl);

        bytes memory bridgeData = abi.encodeWithSelector(
            TALStakingBridgeL1.initialize.selector,
            deployer,                       // admin
            l1Messenger,                    // L1CrossDomainMessenger
            l2BridgeAddress,                // TALStakingBridgeL2 on L2
            seigManager,                    // SeigManagerV3_1
            address(slashingConditions),    // TALSlashingConditionsL1
            talLayer2Address                // layer2 address
        );
        ERC1967Proxy bridgeProxy = new ERC1967Proxy(stakingBridgeImpl, bridgeData);
        stakingBridge = TALStakingBridgeL1(address(bridgeProxy));
        console.log("  Implementation:", stakingBridgeImpl);
        console.log("  Proxy:", address(stakingBridge));

        // ============ 3. Link: Grant SLASHER_ROLE to Bridge ============

        console.log("");
        console.log("Linking contracts...");

        slashingConditions.grantRole(slashingConditions.SLASHER_ROLE(), address(stakingBridge));
        console.log("  SlashingConditions: granted SLASHER_ROLE to StakingBridge");

        vm.stopBroadcast();

        // ============ Write Deployment JSON ============

        _writeDeploymentFile(deployer, seigManager, l1Messenger, l2BridgeAddress, talLayer2Address);

        // ============ Summary ============

        console.log("");
        console.log("=== L1 Deployment Summary ===");
        console.log("");
        console.log("TALSlashingConditionsL1:");
        console.log("  Proxy:         ", address(slashingConditions));
        console.log("  Implementation:", slashingConditionsImpl);
        console.log("");
        console.log("TALStakingBridgeL1:");
        console.log("  Proxy:         ", address(stakingBridge));
        console.log("  Implementation:", stakingBridgeImpl);
        console.log("");
        console.log("=== L1 Deployment Complete ===");
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Deploy L2 contracts using DeployLocal.s.sol or DeploySepolia.s.sol");
        console.log("  2. Set L2_BRIDGE_ADDRESS in .env to the TALStakingBridgeL2 proxy address");
        console.log("  3. Call stakingBridge.setL2BridgeAddress(l2BridgeProxy) if L2 was deployed after L1");
    }

    function _writeDeploymentFile(
        address deployer,
        address seigManager,
        address l1Messenger,
        address l2BridgeAddress,
        address talLayer2Address
    ) internal {
        string memory json = string(abi.encodePacked(
            '{\n',
            '  "network": "l1",\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "blockNumber": ', vm.toString(block.number), ',\n'
        ));

        string memory json2 = string(abi.encodePacked(
            '  "externals": {\n',
            '    "seigManager": "', vm.toString(seigManager), '",\n',
            '    "l1CrossDomainMessenger": "', vm.toString(l1Messenger), '",\n',
            '    "l2BridgeAddress": "', vm.toString(l2BridgeAddress), '",\n',
            '    "talLayer2Address": "', vm.toString(talLayer2Address), '"\n',
            '  },\n'
        ));

        string memory json3 = string(abi.encodePacked(
            '  "contracts": {\n',
            '    "TALSlashingConditionsL1": {\n',
            '      "proxy": "', vm.toString(address(slashingConditions)), '",\n',
            '      "implementation": "', vm.toString(slashingConditionsImpl), '"\n',
            '    },\n',
            '    "TALStakingBridgeL1": {\n',
            '      "proxy": "', vm.toString(address(stakingBridge)), '",\n',
            '      "implementation": "', vm.toString(stakingBridgeImpl), '"\n',
            '    }\n',
            '  }\n',
            '}'
        ));

        string memory fullJson = string(abi.encodePacked(json, json2, json3));

        try vm.createDir("deployments", false) {} catch {}
        vm.writeFile("deployments/l1.json", fullJson);
        console.log("");
        console.log("Deployment addresses written to: deployments/l1.json");
    }
}
