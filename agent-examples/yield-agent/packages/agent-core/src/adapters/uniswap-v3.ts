import type { IDataSource, RiskMetrics, ChainId, AuditInfo } from "../types.js";
import { BaseDefiLlamaAdapter } from "./base-adapter.js";

export class UniswapV3Adapter extends BaseDefiLlamaAdapter {
  readonly protocolName = "Uniswap V3" as const;
  readonly protocolType = "amm" as const;
  readonly supportedChains: readonly ChainId[] = [1, 10, 42161];

  protected readonly defiLlamaProject = "uniswap-v3";
  protected readonly defaultContractAge = 1100;

  protected readonly defaultAuditInfo: AuditInfo = {
    audited: true,
    auditors: ["Trail of Bits", "ABDK", "samczsun"],
    auditCount: 6,
    bugBountyActive: true,
    bugBountySize: 15_000_000,
  };

  constructor(dataSource: IDataSource) {
    super(dataSource);
  }

  protected override getDefaultProtocolRisk(): number {
    return 25; // Higher IL risk for AMMs
  }

  async getProtocolRisk(): Promise<RiskMetrics> {
    return {
      overallScore: 25,
      smartContractRisk: 10,
      marketRisk: 40,
      liquidityRisk: 15,
      protocolRisk: 8,
      centralizationRisk: 15,
    };
  }
}
