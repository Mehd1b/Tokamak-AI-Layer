import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/trust-model',
        'architecture/cross-layer-bridge',
      ],
    },
    {
      type: 'category',
      label: 'Smart Contracts',
      collapsed: false,
      items: [
        'contracts/identity-registry',
        'contracts/reputation-registry',
        'contracts/validation-registry',
        'contracts/wston-vault',
        'contracts/task-fee-escrow',
        'contracts/deployment-and-security',
      ],
    },
    {
      type: 'category',
      label: 'SDK',
      collapsed: true,
      items: [
        'sdk/overview',
        'sdk/identity-client',
        'sdk/reputation-and-validation',
        'sdk/types-reference',
      ],
    },
    {
      type: 'category',
      label: 'Frontend App',
      collapsed: true,
      items: [
        'app/setup',
        'app/pages-guide',
        'app/wallet-and-chains',
        'app/hooks-reference',
        'app/contract-integration',
      ],
    },
    {
      type: 'category',
      label: 'Integration Guides',
      collapsed: true,
      items: [
        'integration/staking-bridge',
        'integration/drb-integration',
        'integration/ipfs-and-metadata',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/glossary',
        'reference/deployed-contracts',
        'reference/repo-map',
      ],
    },
  ],
};

export default sidebars;
