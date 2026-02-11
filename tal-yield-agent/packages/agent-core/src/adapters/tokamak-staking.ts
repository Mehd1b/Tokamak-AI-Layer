import type { IDataSource, RiskMetrics, ChainId, AuditInfo } from "../types.js";
import { BaseDefiLlamaAdapter } from "./base-adapter.js";

export class TokamakStakingAdapter extends BaseDefiLlamaAdapter {
  readonly protocolName = "Tokamak Staking" as const;
  readonly protocolType = "staking" as const;
  readonly supportedChains: readonly ChainId[] = [55004];

  protected readonly defiLlamaProject = "tokamak-network";
  protected readonly defaultContractAge = 400;

  protected readonly defaultAuditInfo: AuditInfo = {
    audited: true,
    auditors: ["Quantstamp"],
    auditCount: 3,
    bugBountyActive: false,
    bugBountySize: 0,
  };

  constructor(dataSource: IDataSource) {
    super(dataSource);
  }

  protected override chainNameToId(chain: string): ChainId | undefined {
    // Tokamak may appear under different chain names in DeFi Llama
    if (chain === "Tokamak" || chain === "Tokamak L2") return 55004;
    return super.chainNameToId(chain);
  }

  protected override getDefaultProtocolRisk(): number {
    return 35; // Newer protocol
  }

  async getProtocolRisk(): Promise<RiskMetrics> {
    return {
      overallScore: 35,
      smartContractRisk: 25,
      marketRisk: 30,
      liquidityRisk: 40,
      protocolRisk: 35,
      centralizationRisk: 45,
    };
  }
}
