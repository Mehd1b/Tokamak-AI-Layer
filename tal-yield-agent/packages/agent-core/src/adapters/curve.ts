import type { IDataSource, RiskMetrics, ChainId, AuditInfo } from "../types.js";
import { BaseDefiLlamaAdapter } from "./base-adapter.js";

export class CurveAdapter extends BaseDefiLlamaAdapter {
  readonly protocolName = "Curve" as const;
  readonly protocolType = "stableswap" as const;
  readonly supportedChains: readonly ChainId[] = [1];

  protected readonly defiLlamaProject = "curve-dex";
  protected readonly defaultContractAge = 1500;

  protected readonly defaultAuditInfo: AuditInfo = {
    audited: true,
    auditors: ["Trail of Bits", "Quantstamp", "MixBytes"],
    auditCount: 10,
    bugBountyActive: true,
    bugBountySize: 2_500_000,
  };

  constructor(dataSource: IDataSource) {
    super(dataSource);
  }

  protected override getDefaultProtocolRisk(): number {
    return 20; // Low IL for stableswaps
  }

  async getProtocolRisk(): Promise<RiskMetrics> {
    return {
      overallScore: 20,
      smartContractRisk: 15,
      marketRisk: 15,
      liquidityRisk: 12,
      protocolRisk: 20,
      centralizationRisk: 30,
    };
  }
}
