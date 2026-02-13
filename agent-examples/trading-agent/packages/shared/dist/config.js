import { TAL_CONTRACTS } from "./constants.js";
export function loadConfig() {
    const apiKeysRaw = process.env["API_KEYS"] ?? "";
    const apiKeys = new Set(apiKeysRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean));
    return {
        // Network
        ethereumRpcUrl: process.env["ETHEREUM_RPC_URL"] ??
            "https://eth-mainnet.g.alchemy.com/v2/demo",
        thanosRpcUrl: process.env["THANOS_RPC_URL"] ??
            "https://rpc.thanos-sepolia.tokamak.network",
        chainId: 1,
        // Agent
        agentId: BigInt(process.env["AGENT_ID"] ?? "0"),
        agentPrivateKey: (process.env["AGENT_PRIVATE_KEY"] ?? "0x"),
        // LLM
        anthropicApiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
        openaiApiKey: process.env["OPENAI_API_KEY"],
        // IPFS
        pinataApiKey: process.env["PINATA_API_KEY"],
        pinataSecretKey: process.env["PINATA_SECRET_KEY"],
        // Server
        port: parseInt(process.env["PORT"] ?? "3000", 10),
        host: process.env["HOST"] ?? "0.0.0.0",
        nodeEnv: process.env["NODE_ENV"] ?? "development",
        // Security
        apiKeys,
        eip712Auth: process.env["EIP712_AUTH"] === "true",
        // SIWA
        siwaDomain: process.env["SIWA_DOMAIN"] ?? "localhost",
        siwaSessionTtl: parseInt(process.env["SIWA_SESSION_TTL"] ?? "3600", 10),
        // Contracts
        identityRegistryAddress: TAL_CONTRACTS.identityRegistry,
        reputationRegistryAddress: TAL_CONTRACTS.reputationRegistry,
        validationRegistryAddress: TAL_CONTRACTS.validationRegistry,
        taskFeeEscrowAddress: TAL_CONTRACTS.taskFeeEscrow,
    };
}
//# sourceMappingURL=config.js.map