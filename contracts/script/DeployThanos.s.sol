// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/core/TALIdentityRegistry.sol";
import "../src/core/TALReputationRegistry.sol";
import "../src/core/TALValidationRegistry.sol";
import "../src/core/TaskFeeEscrow.sol";
import "../src/modules/DRBIntegrationModule.sol";
import "../src/modules/StakingIntegrationModule.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployThanos
 * @notice Full deployment script for ALL TAL contracts on Thanos Sepolia L2
 * @dev Deploys core registries + TaskFeeEscrow on Thanos L2 (native TON)
 *
 * Network: Thanos Sepolia
 * Chain ID: 111551119090
 * RPC: https://rpc.thanos-sepolia.tokamak.network
 * Explorer: https://explorer.thanos-sepolia.tokamak.network
 * Native Token: TON
 *
 * Usage:
 *   1. Set environment variables (PRIVATE_KEY required)
 *   2. Deploy:
 *      forge script script/DeployThanos.s.sol \
 *        --broadcast --rpc-url https://rpc.thanos-sepolia.tokamak.network \
 *        --legacy
 *
 * Environment variables:
 *   - PRIVATE_KEY: Deployer private key (required)
 *   - STAKING_BRIDGE: L2 staking bridge address (optional)
 *   - ZK_VERIFIER: ZK verifier address (optional)
 *   - DRB_COORDINATOR: DRB CommitReveal2 coordinator address (optional)
 *   - TREASURY: Treasury address for protocol fees (optional, defaults to deployer)
 */
contract DeployThanos is Script {
    // Core registries
    TALIdentityRegistry public identityRegistry;
    TALReputationRegistry public reputationRegistry;
    TALValidationRegistry public validationRegistry;

    // Fee escrow
    TaskFeeEscrow public taskFeeEscrow;

    // Integration modules
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
        address treasury = vm.envOr("TREASURY", deployer);

        console.log("=== TAL Thanos Sepolia Deployment ===");
        console.log("");
        console.log("Network: Thanos Sepolia (Chain ID: 111551119090)");
        console.log("Native Token: TON");
        console.log("Deployer:", deployer);
        console.log("Treasury:", treasury);
        console.log("Staking Bridge:", stakingBridge);
        console.log("ZK Verifier:", zkVerifier);
        console.log("DRB Coordinator:", drbCoordinator);
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

        // ============ 4. Deploy TaskFeeEscrow ============

        console.log("Deploying TaskFeeEscrow...");
        taskFeeEscrow = new TaskFeeEscrow(address(identityRegistry));
        console.log("  Address:", address(taskFeeEscrow));

        // ============ 5. Deploy DRBIntegrationModule ============

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

        // ============ 6. Deploy StakingIntegrationModule ============

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

        // ============ 7. Link Contracts ============

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

        // ============ Summary ============

        console.log("");
        console.log("=== Deployment Summary (Thanos Sepolia) ===");
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
        console.log("TaskFeeEscrow:");
        console.log("  Address:       ", address(taskFeeEscrow));
        console.log("");
        if (address(drbModule) != address(0)) {
            console.log("DRBIntegrationModule:");
            console.log("  Proxy:         ", address(drbModule));
            console.log("  Implementation:", drbModuleImpl);
            console.log("");
        }
        console.log("StakingIntegrationModule:");
        console.log("  Proxy:         ", address(stakingModule));
        console.log("  Implementation:", stakingModuleImpl);
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Next steps:");
        console.log("  1. Update frontend/src/lib/contracts.ts with new addresses");
        console.log("  2. Update agent-runtime .env with TASK_FEE_ESCROW address");
        console.log("  3. Register agents and set fees via the frontend");
    }
}
