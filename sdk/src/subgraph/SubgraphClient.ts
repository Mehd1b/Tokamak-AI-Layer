import type {
  AgentDetails,
  AgentSearchQuery,
  AgentSearchResult,
  ProtocolStats,
} from '../types';

/**
 * SubgraphClient provides GraphQL query capabilities against the TAL subgraph.
 *
 * NOTE: The subgraph is part of Sprint 3 which has been postponed for the MVP.
 * This client provides the interface and will return stub data until the
 * subgraph is deployed. All methods gracefully degrade.
 */
export class SubgraphClient {
  private readonly url: string | undefined;

  constructor(url?: string) {
    this.url = url;
  }

  get isAvailable(): boolean {
    return !!this.url;
  }

  async searchAgents(query: AgentSearchQuery): Promise<AgentSearchResult> {
    if (!this.url) {
      return { agents: [], totalCount: 0, hasMore: false };
    }

    const graphqlQuery = this.buildSearchQuery(query);
    const data = await this.execute(graphqlQuery);
    return this.parseAgentSearchResult(data);
  }

  async getAgent(agentId: string): Promise<AgentDetails | null> {
    if (!this.url) return null;

    const query = `
      query GetAgent($id: ID!) {
        agent(id: $id) {
          id
          owner
          agentURI
          zkIdentity
          verifiedOperator
          stakedAmount
          operator
          registeredAt
          updatedAt
          feedbackCount
          averageScore
          verifiedScore
          validationCount
          successfulValidations
          isActive
        }
      }
    `;

    const data = await this.execute(query, { id: agentId });
    if (!data?.agent) return null;
    return this.parseAgent(data.agent);
  }

  async getTopAgents(
    limit: number,
    sortBy: 'averageScore' | 'validationCount' | 'stakedAmount' = 'averageScore',
  ): Promise<AgentDetails[]> {
    if (!this.url) return [];

    const query = `
      query GetTopAgents($first: Int!, $orderBy: Agent_orderBy) {
        agents(
          first: $first
          orderBy: $orderBy
          orderDirection: desc
          where: { isActive: true }
        ) {
          id
          owner
          agentURI
          verifiedOperator
          averageScore
          feedbackCount
          validationCount
        }
      }
    `;

    const data = await this.execute(query, { first: limit, orderBy: sortBy });
    return (data?.agents ?? []).map((a: any) => this.parseAgent(a));
  }

  async getProtocolStats(): Promise<ProtocolStats | null> {
    if (!this.url) return null;

    const query = `
      query GetProtocolStats {
        protocolStats(id: "singleton") {
          totalAgents
          activeAgents
          totalFeedbacks
          totalValidations
          completedValidations
          totalBountiesPaid
          totalStaked
        }
      }
    `;

    const data = await this.execute(query);
    if (!data?.protocolStats) return null;

    const stats = data.protocolStats;
    return {
      totalAgents: Number(stats.totalAgents),
      activeAgents: Number(stats.activeAgents),
      totalFeedbacks: Number(stats.totalFeedbacks),
      totalValidations: Number(stats.totalValidations),
      completedValidations: Number(stats.completedValidations),
      totalBountiesPaid: BigInt(stats.totalBountiesPaid),
      totalStaked: BigInt(stats.totalStaked),
    };
  }

  private buildSearchQuery(query: AgentSearchQuery): string {
    const where: string[] = [];
    if (query.verifiedOperatorOnly) where.push('verifiedOperator: true');
    if (query.zkIdentityOnly) where.push('zkIdentity_not: null');
    if (query.minReputation !== undefined)
      where.push(`averageScore_gte: "${query.minReputation}"`);

    const whereClause =
      where.length > 0 ? `where: { ${where.join(', ')} }` : '';
    const orderBy = query.orderBy
      ? `orderBy: ${this.mapOrderBy(query.orderBy)}`
      : 'orderBy: registeredAt';
    const orderDir = query.orderDirection ?? 'desc';
    const first = query.first ?? 20;
    const skip = query.skip ?? 0;

    return `
      query SearchAgents {
        agents(
          first: ${first}
          skip: ${skip}
          ${orderBy}
          orderDirection: ${orderDir}
          ${whereClause}
        ) {
          id
          owner
          agentURI
          verifiedOperator
          averageScore
          feedbackCount
          validationCount
          isActive
        }
      }
    `;
  }

  private mapOrderBy(
    orderBy: 'reputation' | 'validations' | 'stake' | 'registeredAt',
  ): string {
    switch (orderBy) {
      case 'reputation':
        return 'averageScore';
      case 'validations':
        return 'validationCount';
      case 'stake':
        return 'stakedAmount';
      case 'registeredAt':
        return 'registeredAt';
    }
  }

  private parseAgentSearchResult(data: any): AgentSearchResult {
    if (!data?.agents) {
      return { agents: [], totalCount: 0, hasMore: false };
    }
    const agents = data.agents.map((a: any) => this.parseAgent(a));
    return {
      agents,
      totalCount: agents.length,
      hasMore: agents.length > 0,
    };
  }

  private parseAgent(raw: any): AgentDetails {
    return {
      agentId: BigInt(raw.id),
      owner: raw.owner,
      agentURI: raw.agentURI ?? '',
      zkIdentity: raw.zkIdentity ?? null,
      verifiedOperator: raw.verifiedOperator ?? false,
      operator: raw.operator ?? null,
      registeredAt: raw.registeredAt
        ? new Date(Number(raw.registeredAt) * 1000)
        : new Date(),
      updatedAt: raw.updatedAt
        ? new Date(Number(raw.updatedAt) * 1000)
        : new Date(),
      feedbackCount: Number(raw.feedbackCount ?? 0),
      averageScore: raw.averageScore ? Number(raw.averageScore) : null,
      verifiedScore: raw.verifiedScore ? Number(raw.verifiedScore) : null,
      validationCount: Number(raw.validationCount ?? 0),
      successfulValidations: Number(raw.successfulValidations ?? 0),
    };
  }

  private async execute(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    if (!this.url) return null;

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph query failed: ${response.statusText}`);
    }

    const result = (await response.json()) as { data?: any; errors?: any[] };
    if (result.errors) {
      throw new Error(
        `Subgraph query errors: ${JSON.stringify(result.errors)}`,
      );
    }

    return result.data;
  }
}
