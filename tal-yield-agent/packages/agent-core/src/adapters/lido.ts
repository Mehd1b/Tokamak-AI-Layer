import type { IDataSource, RiskMetrics, ChainId, AuditInfo } from "../types.js";
import { BaseDefiLlamaAdapter } from "./base-adapter.js";

export class LidoAdapter extends BaseDefiLlamaAdapter {
  readonly protocolName = "Lido" as const;
  readonly protocolType = "liquid-staking" as const;
  readonly supportedChains: readonly ChainId[] = [1];

  protected readonly defiLlamaProject = "lido";
  protected readonly defaultContractAge = 1300;

  protected readonly defaultAuditInfo: AuditInfo = {
    audited: true,
    auditors: ["Quantstamp", "SigmaPrime", "MixBytes", "Statemind"],
    auditCount: 15,
    bugBountyActive: true,
    bugBountySize: 2_000_000,
  };

  constructor(dataSource: IDataSource) {
    super(dataSource);
  }

  protected override getDefaultProtocolRisk(): number {
    return 12; // Very low risk, largest protocol
  }

  async getProtocolRisk(): Promise<RiskMetrics> {
    return {
      overallScore: 12,
      smartContractRisk: 8,
      marketRisk: 10,
      liquidityRisk: 5,
      protocolRisk: 15,
      centralizationRisk: 25,
    };
  }
}
