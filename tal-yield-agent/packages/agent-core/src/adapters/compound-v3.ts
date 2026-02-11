import type { IDataSource, RiskMetrics, ChainId, AuditInfo } from "../types.js";
import { BaseDefiLlamaAdapter } from "./base-adapter.js";

export class CompoundV3Adapter extends BaseDefiLlamaAdapter {
  readonly protocolName = "Compound V3" as const;
  readonly protocolType = "lending" as const;
  readonly supportedChains: readonly ChainId[] = [1];

  protected readonly defiLlamaProject = "compound-v3";
  protected readonly defaultContractAge = 800;

  protected readonly defaultAuditInfo: AuditInfo = {
    audited: true,
    auditors: ["OpenZeppelin", "ChainSecurity"],
    auditCount: 8,
    bugBountyActive: true,
    bugBountySize: 5_000_000,
  };

  constructor(dataSource: IDataSource) {
    super(dataSource);
  }

  protected override getDefaultProtocolRisk(): number {
    return 18;
  }

  async getProtocolRisk(): Promise<RiskMetrics> {
    return {
      overallScore: 18,
      smartContractRisk: 12,
      marketRisk: 22,
      liquidityRisk: 12,
      protocolRisk: 10,
      centralizationRisk: 30,
    };
  }
}
