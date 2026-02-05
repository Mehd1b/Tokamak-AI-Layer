// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistry.sol";
import "../src/core/TALReputationRegistry.sol";
import "../src/core/TALValidationRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeploySepolia
 * @notice Deployment script for TAL contracts on Sepolia testnet
 * @dev Usage:
 *      1. Copy .env.example to .env and set required variables
 *      2. Run: source .env
 *      3. Deploy: forge script script/DeploySepolia.s.sol --broadcast --rpc-url $RPC_URL --verify
 *
 *      Required environment variables:
 *      - PRIVATE_KEY: Deployer private key (required)
 *      - RPC_URL: Sepolia RPC endpoint (required for broadcast)
 *      - ETHERSCAN_API_KEY: For contract verification (required for --verify)
 *
 *      Optional environment variables:
 *      - STAKING_BRIDGE: Staking bridge contract address (L2 cache of L1 Staking V3)
 *      - ZK_VERIFIER: ZK verifier contract address
 *      - DRB_COORDINATOR: DRB coordinator address
 *      - TEE_ORACLE: TEE oracle address
 */
contract DeploySepolia is Script {
    // Deployed contract addresses
    TALIdentityRegistry public identityRegistry;
    TALReputationRegistry public reputationRegistry;
    TALValidationRegistry public validationRegistry;

    // Implementation addresses (for verification)
    address public identityImpl;
    address public reputationImpl;
    address public validationImpl;

    function run() external {
        // Get deployer private key from environment (REQUIRED)
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // External contract addresses (can be overridden via env)
        address stakingBridge = vm.envOr("STAKING_BRIDGE", address(0));
        address zkVerifier = vm.envOr("ZK_VERIFIER", address(0));
        address drbCoordinator = vm.envOr("DRB_COORDINATOR", address(0));
        address teeOracle = vm.envOr("TEE_ORACLE", address(0));

        console.log("=== TAL Sepolia Deployment Script ===");
        console.log("");
        console.log("Network: Sepolia Testnet");
        console.log("Deployer:", deployer);
        console.log("Staking Bridge:", stakingBridge);
        console.log("ZK Verifier:", zkVerifier);
        console.log("DRB Coordinator:", drbCoordinator);
        console.log("TEE Oracle:", teeOracle);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Identity Registry
        console.log("Deploying TALIdentityRegistry...");
        TALIdentityRegistry identityImplContract = new TALIdentityRegistry();
        identityImpl = address(identityImplContract);

        bytes memory identityData = abi.encodeWithSelector(
            TALIdentityRegistry.initialize.selector,
            deployer,       // admin
            stakingBridge,  // staking bridge (L2 cache of L1 Staking V3)
            zkVerifier      // ZK verifier
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(identityImpl, identityData);
        identityRegistry = TALIdentityRegistry(address(identityProxy));
        console.log("  Implementation:", identityImpl);
        console.log("  Proxy:", address(identityRegistry));

        // 2. Deploy Reputation Registry
        console.log("Deploying TALReputationRegistry...");
        TALReputationRegistry reputationImplContract = new TALReputationRegistry();
        reputationImpl = address(reputationImplContract);

        bytes memory reputationData = abi.encodeWithSelector(
            TALReputationRegistry.initialize.selector,
            deployer,                    // admin
            address(identityRegistry),   // identity registry
            stakingBridge                // staking bridge (L2 cache of L1 Staking V3)
        );
        ERC1967Proxy reputationProxy = new ERC1967Proxy(reputationImpl, reputationData);
        reputationRegistry = TALReputationRegistry(address(reputationProxy));
        console.log("  Implementation:", reputationImpl);
        console.log("  Proxy:", address(reputationRegistry));

        // 3. Deploy Validation Registry
        console.log("Deploying TALValidationRegistry...");
        TALValidationRegistry validationImplContract = new TALValidationRegistry();
        validationImpl = address(validationImplContract);

        bytes memory validationData = abi.encodeWithSelector(
            TALValidationRegistry.initialize.selector,
            deployer,                    // admin
            address(identityRegistry),   // identity registry
            address(reputationRegistry), // reputation registry
            deployer                     // treasury (use deployer for testnet)
        );
        ERC1967Proxy validationProxy = new ERC1967Proxy(validationImpl, validationData);
        validationRegistry = TALValidationRegistry(payable(address(validationProxy)));
        console.log("  Implementation:", validationImpl);
        console.log("  Proxy:", address(validationRegistry));

        // 4. Link contracts (set validation registry in reputation registry)
        console.log("Linking contracts...");
        reputationRegistry.setValidationRegistry(address(validationRegistry));
        console.log("  ReputationRegistry -> ValidationRegistry linked");

        vm.stopBroadcast();

        // Print deployment summary
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
        console.log("=== Deployment Complete ===");

        // Write deployment addresses to JSON file
        _writeDeploymentFile(deployer);
    }

    /**
     * @notice Write deployment addresses to JSON file
     * @dev Creates deployments directory if needed and writes sepolia.json
     * @param deployer The deployer address
     */
    function _writeDeploymentFile(address deployer) internal {
        string memory deploymentJson = string(abi.encodePacked(
            '{\n',
            '  "network": "sepolia",\n',
            '  "chainId": 11155111,\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "blockNumber": ', vm.toString(block.number), ',\n',
            '  "contracts": {\n',
            '    "TALIdentityRegistry": {\n',
            '      "proxy": "', vm.toString(address(identityRegistry)), '",\n',
            '      "implementation": "', vm.toString(identityImpl), '"\n',
            '    },\n',
            '    "TALReputationRegistry": {\n',
            '      "proxy": "', vm.toString(address(reputationRegistry)), '",\n',
            '      "implementation": "', vm.toString(reputationImpl), '"\n',
            '    },\n',
            '    "TALValidationRegistry": {\n',
            '      "proxy": "', vm.toString(address(validationRegistry)), '",\n',
            '      "implementation": "', vm.toString(validationImpl), '"\n',
            '    }\n',
            '  }\n',
            '}'
        ));

        // Create deployments directory if it doesn't exist
        try vm.createDir("deployments", false) {
            console.log("Created deployments directory");
        } catch {
            // Directory already exists
        }

        vm.writeFile("deployments/sepolia.json", deploymentJson);
        console.log("");
        console.log("Deployment addresses written to: deployments/sepolia.json");
        console.log("");
        console.log("To verify contracts on Etherscan, ensure ETHERSCAN_API_KEY is set in .env");
        console.log("Run with --verify flag to automatically verify all contracts");
    }
}
