// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { VaultFactory } from "../src/VaultFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for KernelVault deposit + fee configuration
interface IKernelVault {
    function depositERC20Tokens(uint256 assets) external returns (uint256 sharesMinted);
    function depositETH() external payable returns (uint256 sharesMinted);
    function setFees(uint256 mgmtBps, uint256 perfBps) external;
    function setFeeRecipient(address recipient) external;
    function totalAssets() external view returns (uint256);
    function totalShares() external view returns (uint256);
    function agentId() external view returns (bytes32);
    function owner() external view returns (address);
}

/// @title SeedVaults
/// @notice Registers demo agents and deploys+seeds KernelVaults for each.
/// @dev Idempotent: skips agents/vaults that already exist.
///
/// Required env vars:
///   AGENT_REGISTRY       — deployed AgentRegistry proxy address
///   VAULT_FACTORY        — deployed VaultFactory proxy address
///   DEPLOYER_PRIVATE_KEY — private key of the deployer (will be agent author)
///
/// Optional env vars:
///   DEPOSIT_ASSET   — ERC20 token address (address(0) or unset = native ETH vault)
///   SEED_AMOUNT     — seed deposit per vault in wei (default 1 ether)
///   IMAGE_ID        — RISC Zero image ID placeholder (default 0x...01)
///   AGENT_CODE_HASH — agent code hash placeholder (default 0x...01)
contract SeedVaults is Script {
    /// @notice Packed configuration loaded from env
    struct Config {
        AgentRegistry registry;
        VaultFactory factory;
        address deployer;
        address depositAsset;
        uint256 seedAmount;
        bytes32 imageId;
        bytes32 agentCodeHash;
    }

    /// @notice Agent definition
    struct AgentDescriptor {
        string name;
        bytes32 salt;
        string metadataURI;
        bytes32 vaultSalt;
    }

    /// @dev Management fee: 1% annual (100 bps)
    uint256 internal constant MGMT_FEE_BPS = 100;

    /// @dev Performance fee: 15% of profits (1500 bps)
    uint256 internal constant PERF_FEE_BPS = 1500;

    function run() external {
        Config memory cfg = _loadConfig();

        AgentDescriptor[] memory agents = _buildAgents();

        _logBanner(cfg);

        // Pre-check ERC20 balance if needed
        if (cfg.depositAsset != address(0)) {
            uint256 balance = IERC20(cfg.depositAsset).balanceOf(cfg.deployer);
            require(balance >= cfg.seedAmount * agents.length, "Insufficient ERC20 balance");
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        for (uint256 i = 0; i < agents.length; i++) {
            _processAgent(cfg, agents[i]);
        }

        vm.stopBroadcast();

        _logSummary(cfg, agents);
    }

    // ========================================================================
    // Internal helpers
    // ========================================================================

    function _loadConfig() internal view returns (Config memory cfg) {
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address factoryAddr = vm.envAddress("VAULT_FACTORY");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        cfg = Config({
            registry: AgentRegistry(registryAddr),
            factory: VaultFactory(factoryAddr),
            deployer: vm.addr(deployerKey),
            depositAsset: vm.envOr("DEPOSIT_ASSET", address(0)),
            seedAmount: vm.envOr("SEED_AMOUNT", uint256(1 ether)),
            imageId: vm.envOr("IMAGE_ID", bytes32(uint256(1))),
            agentCodeHash: vm.envOr("AGENT_CODE_HASH", bytes32(uint256(1)))
        });
    }

    function _buildAgents() internal pure returns (AgentDescriptor[] memory agents) {
        agents = new AgentDescriptor[](3);

        agents[0] = AgentDescriptor({
            name: "Perp Momentum Alpha",
            salt: keccak256("perp-momentum-alpha-v1"),
            metadataURI: "https://tokamak.network/agents/perp-momentum-alpha.json",
            vaultSalt: keccak256("perp-momentum-alpha-vault-v1")
        });

        agents[1] = AgentDescriptor({
            name: "ETH Yield Optimizer",
            salt: keccak256("eth-yield-optimizer-v1"),
            metadataURI: "https://tokamak.network/agents/eth-yield-optimizer.json",
            vaultSalt: keccak256("eth-yield-optimizer-vault-v1")
        });

        agents[2] = AgentDescriptor({
            name: "Delta Neutral Funding",
            salt: keccak256("delta-neutral-funding-v1"),
            metadataURI: "https://tokamak.network/agents/delta-neutral-funding.json",
            vaultSalt: keccak256("delta-neutral-funding-vault-v1")
        });
    }

    function _logBanner(Config memory cfg) internal pure {
        bool isETH = cfg.depositAsset == address(0);
        console.log("=== Tokamak AI Layer - Seed Vaults ===");
        console.log("Deployer:       ", cfg.deployer);
        console.log("AgentRegistry:  ", address(cfg.registry));
        console.log("VaultFactory:   ", address(cfg.factory));
        if (isETH) {
            console.log("Deposit Asset:   Native ETH");
        } else {
            console.log("Deposit Asset:  ", cfg.depositAsset);
        }
        console.log("Seed Amount:    ", cfg.seedAmount);
        console.log("Mgmt Fee (bps): ", MGMT_FEE_BPS);
        console.log("Perf Fee (bps): ", PERF_FEE_BPS);
        console.log("");
    }

    /// @notice Register agent, deploy vault, configure fees, seed deposit
    function _processAgent(Config memory cfg, AgentDescriptor memory agent) internal {
        console.log("--------------------------------------------");
        console.log("Agent:", agent.name);

        // Step 1: Register agent (idempotent)
        bytes32 agentId = _ensureAgent(cfg, agent);

        // Step 2: Deploy vault (idempotent)
        address vault = _ensureVault(cfg, agentId, agent);

        // Step 3: Configure fees + seed
        _configureAndSeed(cfg, vault);

        console.log("");
    }

    function _ensureAgent(Config memory cfg, AgentDescriptor memory agent)
        internal
        returns (bytes32 agentId)
    {
        agentId = cfg.registry.computeAgentId(cfg.deployer, agent.salt);

        if (cfg.registry.agentExists(agentId)) {
            console.log("  [SKIP] Agent already registered:");
            console.logBytes32(agentId);
        } else {
            agentId = cfg.registry.register(agent.salt, cfg.imageId, cfg.agentCodeHash);
            console.log("  [OK]   Agent registered:");
            console.logBytes32(agentId);

            cfg.registry.setMetadataURI(agentId, agent.metadataURI);
            console.log("  [OK]   Metadata URI set");
        }
    }

    function _ensureVault(Config memory cfg, bytes32 agentId, AgentDescriptor memory agent)
        internal
        returns (address vault)
    {
        address[] memory existing = cfg.factory.getAgentVaults(agentId);

        if (existing.length > 0) {
            vault = existing[0];
            console.log("  [SKIP] Vault already deployed:", vault);
        } else {
            vault = cfg.factory.deployVault(agentId, cfg.depositAsset, agent.vaultSalt, cfg.imageId);
            console.log("  [OK]   Vault deployed:", vault);
        }
    }

    function _configureAndSeed(Config memory cfg, address vault) internal {
        IKernelVault kv = IKernelVault(vault);

        // Configure fees only on fresh vaults
        if (kv.totalShares() == 0) {
            kv.setFees(MGMT_FEE_BPS, PERF_FEE_BPS);
            console.log("  [OK]   Fees configured (mgmt=100bps, perf=1500bps)");

            kv.setFeeRecipient(cfg.deployer);
            console.log("  [OK]   Fee recipient set to deployer");
        } else {
            console.log("  [SKIP] Fees already configured (vault has shares)");
        }

        // Seed deposit
        if (kv.totalAssets() > 0) {
            console.log("  [SKIP] Vault already seeded, totalAssets:", kv.totalAssets());
            return;
        }

        uint256 sharesMinted;
        if (cfg.depositAsset == address(0)) {
            sharesMinted = kv.depositETH{ value: cfg.seedAmount }();
        } else {
            IERC20(cfg.depositAsset).approve(vault, cfg.seedAmount);
            sharesMinted = kv.depositERC20Tokens(cfg.seedAmount);
        }
        console.log("  [OK]   Seeded vault. Shares minted:", sharesMinted);
    }

    function _logSummary(Config memory cfg, AgentDescriptor[] memory agents) internal view {
        console.log("============================================");
        console.log("=== SEED COMPLETE ===");
        console.log("============================================");
        console.log("Agents registered:", cfg.registry.agentCount());
        console.log("Vaults deployed:  ", cfg.factory.vaultCount());

        for (uint256 i = 0; i < agents.length; i++) {
            bytes32 agentId = cfg.registry.computeAgentId(cfg.deployer, agents[i].salt);
            address[] memory vaults = cfg.factory.getAgentVaults(agentId);
            console.log("");
            console.log(agents[i].name);
            console.log("  agentId:");
            console.logBytes32(agentId);
            if (vaults.length > 0) {
                console.log("  vault:   ", vaults[0]);
                console.log("  assets:  ", IKernelVault(vaults[0]).totalAssets());
                console.log("  shares:  ", IKernelVault(vaults[0]).totalShares());
            }
        }
    }
}
