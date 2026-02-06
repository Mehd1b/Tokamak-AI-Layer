import { describe, it, expect } from 'vitest';
import { SubgraphClient } from '../subgraph/SubgraphClient';

describe('SubgraphClient', () => {
  describe('without URL (stubbed mode)', () => {
    const client = new SubgraphClient();

    it('isAvailable returns false', () => {
      expect(client.isAvailable).toBe(false);
    });

    it('searchAgents returns empty result', async () => {
      const result = await client.searchAgents({});
      expect(result).toEqual({
        agents: [],
        totalCount: 0,
        hasMore: false,
      });
    });

    it('getAgent returns null', async () => {
      const result = await client.getAgent('1');
      expect(result).toBeNull();
    });

    it('getTopAgents returns empty array', async () => {
      const result = await client.getTopAgents(10);
      expect(result).toEqual([]);
    });

    it('getProtocolStats returns null', async () => {
      const result = await client.getProtocolStats();
      expect(result).toBeNull();
    });
  });

  describe('with URL', () => {
    const client = new SubgraphClient('https://api.thegraph.com/subgraphs/name/test');

    it('isAvailable returns true', () => {
      expect(client.isAvailable).toBe(true);
    });
  });
});
