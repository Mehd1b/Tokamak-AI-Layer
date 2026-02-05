// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistry.sol";
import "../src/core/TALReputationRegistry.sol";
import "../src/core/TALValidationRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployLocal
 * @notice Deployment script for TAL contracts on local/testnet
 * @dev Usage:
 *      1. Copy .env.example to .env and set your PRIVATE_KEY
 *      2. Run: source .env
 *      3. Deploy: forge script script/DeployLocal.s.sol --broadcast --rpc-url $RPC_URL
 *
 *      Required environment variables:
 *      - PRIVATE_KEY: Deployer private key (required)
 *      - RPC_URL: Network RPC endpoint (required for broadcast)
 *
 *      Optional environment variables:
 *      - STAKING_V2: Staking contract address
 *      - ZK_VERIFIER: ZK verifier contract address
 *      - DRB_COORDINATOR: DRB coordinator address
 *      - TEE_ORACLE: TEE oracle address
 */
contract DeployLocal is Script {
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
        address stakingV2 = vm.envOr("STAKING_V2", address(0));
        address zkVerifier = vm.envOr("ZK_VERIFIER", address(0));
        address drbCoordinator = vm.envOr("DRB_COORDINATOR", address(0));
        address teeOracle = vm.envOr("TEE_ORACLE", address(0));

        console.log("=== TAL Deployment Script ===");
        console.log("");
        console.log("Deployer:", deployer);
        console.log("Staking V2:", stakingV2);
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
            deployer,      // admin
            stakingV2,     // staking contract
            zkVerifier     // ZK verifier
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
            stakingV2                    // staking contract
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
            stakingV2,                   // staking contract
            drbCoordinator,              // DRB coordinator
            teeOracle                    // TEE oracle
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

        // Write deployment addresses to file for easy import
        string memory deploymentJson = string(abi.encodePacked(
            '{\n',
            '  "network": "local",\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
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

        vm.writeFile("deployments/local.json", deploymentJson);
        console.log("");
        console.log("Deployment addresses written to: deployments/local.json");
    }
}
