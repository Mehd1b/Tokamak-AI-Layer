import type { IDataSource, RiskMetrics, ChainId, AuditInfo } from "../types.js";
import { BaseDefiLlamaAdapter } from "./base-adapter.js";

export class AaveV3Adapter extends BaseDefiLlamaAdapter {
  readonly protocolName = "Aave V3" as const;
  readonly protocolType = "lending" as const;
  readonly supportedChains: readonly ChainId[] = [1, 10, 42161];

  protected readonly defiLlamaProject = "aave-v3";
  protected readonly defaultContractAge = 900; // ~2.5 years

  protected readonly defaultAuditInfo: AuditInfo = {
    audited: true,
    auditors: ["OpenZeppelin", "Trail of Bits", "SigmaPrime", "ABDK"],
    auditCount: 12,
    bugBountyActive: true,
    bugBountySize: 10_000_000,
  };

  constructor(dataSource: IDataSource) {
    super(dataSource);
  }

  protected override getDefaultProtocolRisk(): number {
    return 15; // Very established, multiple audits
  }

  async getProtocolRisk(): Promise<RiskMetrics> {
    return {
      overallScore: 15,
      smartContractRisk: 10,
      marketRisk: 20,
      liquidityRisk: 10,
      protocolRisk: 8,
      centralizationRisk: 25,
    };
  }
}
