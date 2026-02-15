// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistry.sol";
import "../src/core/TALReputationRegistry.sol";
import "../src/core/TALValidationRegistry.sol";
import "../src/modules/DRBIntegrationModule.sol";
import "../src/modules/StakingIntegrationModule.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeploySepolia
 * @notice Full deployment script for ALL TAL L2 contracts on Sepolia testnet
 * @dev Deploys core registries + Sprint 2 modules with Etherscan verification
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in all values
 *   2. Source env: source .env
 *   3. Deploy + verify:
 *      forge script script/DeploySepolia.s.sol \
 *        --broadcast --rpc-url $RPC_URL \
 *        --verify --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * Environment variables:
 *   - PRIVATE_KEY: Deployer private key (required)
 *   - RPC_URL: Sepolia RPC endpoint (required)
 *   - ETHERSCAN_API_KEY: For contract verification (required for --verify)
 *   - STAKING_BRIDGE: L2 staking bridge address (optional)
 *   - ZK_VERIFIER: ZK verifier address (optional)
 *   - DRB_COORDINATOR: DRB CommitReveal2 coordinator address (optional)
 *   - TEE_ORACLE: TEE oracle address (optional)
 *   - TREASURY: Treasury address for protocol fees (optional, defaults to deployer)
 */
contract DeploySepolia is Script {
    // Core registries
    TALIdentityRegistry public identityRegistry;
    TALReputationRegistry public reputationRegistry;
    TALValidationRegistry public validationRegistry;

    // Sprint 2 modules
    DRBIntegrationModule public drbModule;
    StakingIntegrationModule public stakingModule;

    // Implementation addresses
    address public identityImpl;
    address public reputationImpl;
    address public validationImpl;
    address public drbModuleImpl;
    address public stakingModuleImpl;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // External addresses
        address stakingBridge = vm.envOr("STAKING_BRIDGE", address(0));
        address zkVerifier = vm.envOr("ZK_VERIFIER", address(0));
        address drbCoordinator = vm.envOr("DRB_COORDINATOR", address(0));
        address teeOracle = vm.envOr("TEE_ORACLE", address(0));
        address treasury = vm.envOr("TREASURY", deployer);

        console.log("=== TAL Sepolia Deployment ===");
        console.log("");
        console.log("Network: Sepolia Testnet");
        console.log("Deployer:", deployer);
        console.log("Treasury:", treasury);
        console.log("Staking Bridge:", stakingBridge);
        console.log("ZK Verifier:", zkVerifier);
        console.log("DRB Coordinator:", drbCoordinator);
        console.log("TEE Oracle:", teeOracle);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ============ 1. Deploy TALIdentityRegistry ============

        console.log("Deploying TALIdentityRegistry...");
        TALIdentityRegistry identityImplContract = new TALIdentityRegistry();
        identityImpl = address(identityImplContract);

        bytes memory identityData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            deployer,
            zkVerifier,
            address(0), // validationRegistry (linked after deployment)
            1000 ether, // minOperatorStake
            7 days      // reactivationCooldown
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(identityImpl, identityData);
        identityRegistry = TALIdentityRegistry(address(identityProxy));
        console.log("  Implementation:", identityImpl);
        console.log("  Proxy:", address(identityRegistry));

        // ============ 2. Deploy TALReputationRegistry ============

        console.log("Deploying TALReputationRegistry...");
        TALReputationRegistry reputationImplContract = new TALReputationRegistry();
        reputationImpl = address(reputationImplContract);

        bytes memory reputationData = abi.encodeWithSelector(
            TALReputationRegistry.initialize.selector,
            deployer,
            address(identityRegistry)
        );
        ERC1967Proxy reputationProxy = new ERC1967Proxy(reputationImpl, reputationData);
        reputationRegistry = TALReputationRegistry(address(reputationProxy));
        console.log("  Implementation:", reputationImpl);
        console.log("  Proxy:", address(reputationRegistry));

        // ============ 3. Deploy TALValidationRegistry ============

        console.log("Deploying TALValidationRegistry...");
        TALValidationRegistry validationImplContract = new TALValidationRegistry();
        validationImpl = address(validationImplContract);

        bytes memory validationData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            deployer,
            address(identityRegistry),
            address(reputationRegistry),
            treasury
        );
        ERC1967Proxy validationProxy = new ERC1967Proxy(validationImpl, validationData);
        validationRegistry = TALValidationRegistry(payable(address(validationProxy)));
        console.log("  Implementation:", validationImpl);
        console.log("  Proxy:", address(validationRegistry));

        // ============ 4. Deploy DRBIntegrationModule ============

        if (drbCoordinator != address(0)) {
            console.log("Deploying DRBIntegrationModule...");
            DRBIntegrationModule drbModuleImplContract = new DRBIntegrationModule();
            drbModuleImpl = address(drbModuleImplContract);

            bytes memory drbModuleData = abi.encodeWithSelector(
                DRBIntegrationModule.initialize.selector,
                deployer,
                drbCoordinator
            );
            ERC1967Proxy drbModuleProxy = new ERC1967Proxy(drbModuleImpl, drbModuleData);
            drbModule = DRBIntegrationModule(payable(address(drbModuleProxy)));
            console.log("  Implementation:", drbModuleImpl);
            console.log("  Proxy:", address(drbModule));
        } else {
            console.log("Skipping DRBIntegrationModule (no DRB_COORDINATOR set)");
        }

        // ============ 5. Deploy StakingIntegrationModule ============

        console.log("Deploying StakingIntegrationModule...");
        StakingIntegrationModule stakingModuleImplContract = new StakingIntegrationModule();
        stakingModuleImpl = address(stakingModuleImplContract);

        bytes memory stakingModuleData = abi.encodeWithSelector(
            StakingIntegrationModule.initialize.selector,
            deployer,
            stakingBridge,
            address(identityRegistry),
            address(reputationRegistry)
        );
        ERC1967Proxy stakingModuleProxy = new ERC1967Proxy(stakingModuleImpl, stakingModuleData);
        stakingModule = StakingIntegrationModule(address(stakingModuleProxy));
        console.log("  Implementation:", stakingModuleImpl);
        console.log("  Proxy:", address(stakingModule));

        // ============ 6. Link Contracts ============

        console.log("");
        console.log("Linking contracts...");

        reputationRegistry.setValidationRegistry(address(validationRegistry));
        console.log("  ReputationRegistry -> ValidationRegistry");

        if (address(drbModule) != address(0)) {
            validationRegistry.setDRBModule(address(drbModule));
            console.log("  ValidationRegistry -> DRBModule");

            drbModule.grantRole(drbModule.VALIDATOR_SELECTOR_ROLE(), address(validationRegistry));
            console.log("  DRBModule: granted VALIDATOR_SELECTOR_ROLE to ValidationRegistry");
        }

        vm.stopBroadcast();

        // ============ Write Deployment JSON ============

        _writeDeploymentFile(deployer, treasury, drbCoordinator, stakingBridge, zkVerifier, teeOracle);

        // ============ Summary ============

        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("");
        console.log("TALIdentityRegistry:");
        console.log("  Proxy:         ", address(identityRegistry));
        console.log("  Implementation:", identityImpl);
        console.log("");
        console.log("TALReputationRegistry:");
        console.log("  Proxy:         ", address(reputationRegistry));
        console.log("  Implementation:", reputationImpl);
        console.log("");
        console.log("TALValidationRegistry:");
        console.log("  Proxy:         ", address(validationRegistry));
        console.log("  Implementation:", validationImpl);
        console.log("");
        if (address(drbModule) != address(0)) {
            console.log("DRBIntegrationModule:");
            console.log("  Proxy:         ", address(drbModule));
            console.log("  Implementation:", drbModuleImpl);
            console.log("  Coordinator:   ", drbCoordinator);
            console.log("");
        }
        console.log("StakingIntegrationModule:");
        console.log("  Proxy:         ", address(stakingModule));
        console.log("  Implementation:", stakingModuleImpl);
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("To verify contracts on Etherscan, ensure ETHERSCAN_API_KEY is set");
        console.log("and re-run with --verify flag.");
    }

    function _writeDeploymentFile(
        address deployer,
        address treasury,
        address drbCoordinator,
        address stakingBridge,
        address zkVerifier,
        address teeOracle
    ) internal {
        string memory json = string(abi.encodePacked(
            '{\n',
            '  "network": "sepolia",\n',
            '  "chainId": 11155111,\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "treasury": "', vm.toString(treasury), '",\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "blockNumber": ', vm.toString(block.number), ',\n'
        ));

        string memory json2 = string(abi.encodePacked(
            '  "externals": {\n',
            '    "drbCoordinator": "', vm.toString(drbCoordinator), '",\n',
            '    "stakingBridge": "', vm.toString(stakingBridge), '",\n',
            '    "zkVerifier": "', vm.toString(zkVerifier), '",\n',
            '    "teeOracle": "', vm.toString(teeOracle), '"\n',
            '  },\n'
        ));

        string memory json3 = string(abi.encodePacked(
            '  "contracts": {\n',
            '    "TALIdentityRegistry": {\n',
            '      "proxy": "', vm.toString(address(identityRegistry)), '",\n',
            '      "implementation": "', vm.toString(identityImpl), '"\n',
            '    },\n',
            '    "TALReputationRegistry": {\n',
            '      "proxy": "', vm.toString(address(reputationRegistry)), '",\n',
            '      "implementation": "', vm.toString(reputationImpl), '"\n',
            '    },\n'
        ));

        string memory json4 = string(abi.encodePacked(
            '    "TALValidationRegistry": {\n',
            '      "proxy": "', vm.toString(address(validationRegistry)), '",\n',
            '      "implementation": "', vm.toString(validationImpl), '"\n',
            '    },\n',
            '    "DRBIntegrationModule": {\n',
            '      "proxy": "', vm.toString(address(drbModule)), '",\n',
            '      "implementation": "', vm.toString(drbModuleImpl), '"\n',
            '    },\n'
        ));

        string memory json5 = string(abi.encodePacked(
            '    "StakingIntegrationModule": {\n',
            '      "proxy": "', vm.toString(address(stakingModule)), '",\n',
            '      "implementation": "', vm.toString(stakingModuleImpl), '"\n',
            '    }\n',
            '  }\n',
            '}'
        ));

        string memory fullJson = string(abi.encodePacked(json, json2, json3, json4, json5));

        try vm.createDir("deployments", false) {} catch {}
        vm.writeFile("deployments/sepolia.json", fullJson);
        console.log("");
        console.log("Deployment addresses written to: deployments/sepolia.json");
    }
}
