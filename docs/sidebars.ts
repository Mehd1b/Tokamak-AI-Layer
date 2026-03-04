import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'quickstart',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/prerequisites',
        'getting-started/local-build',
        'getting-started/run-an-example',
        'getting-started/defi-yield-farmer',
        'getting-started/faq',
      ],
    },
    {
      type: 'category',
      label: 'Agent Development',
      collapsed: false,
      items: [
        'sdk/overview',
        'sdk/writing-an-agent',
        'sdk/agent-input-macro',
        'sdk/call-builder',
        'sdk/testing',
        'sdk/constraints-and-commitments',
        'sdk/cli-reference',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: true,
      items: [
        'architecture/overview',
        'architecture/trust-model',
        'architecture/cryptographic-chain',
      ],
    },
    {
      type: 'category',
      label: 'Kernel Core',
      collapsed: true,
      items: [
        'kernel/input-format',
        'kernel/journal-format',
        'kernel/versioning',
      ],
    },
    {
      type: 'category',
      label: 'Guest Program',
      collapsed: true,
      items: [
        'guest-program/overview',
        'guest-program/transcript-and-hashing',
        'guest-program/risc0-build-pipeline',
      ],
    },
    {
      type: 'category',
      label: 'Agent Pack',
      collapsed: true,
      items: [
        'agent-pack/format',
        'agent-pack/publishing',
        'agent-pack/verification',
        'agent-pack/manifest-schema',
      ],
    },
    {
      type: 'category',
      label: 'On-Chain',
      collapsed: true,
      items: [
        'onchain/verifier-overview',
        'onchain/solidity-integration',
        'onchain/security-considerations',
        'onchain/permissionless-system',
        'onchain/hyperliquid-integration',
      ],
    },
    {
      type: 'category',
      label: 'Integration',
      collapsed: true,
      items: [
        'integration/overview',
        'integration/reference-integrator',
        'integration/golden-path',
      ],
    },
    {
      type: 'category',
      label: 'Decisions',
      collapsed: true,
      items: [
        'decisions/binding-elimination',
        'decisions/agent-input-macro',
        'decisions/cargo-agent-cli',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/repo-map',
        'reference/glossary',
        'reference/changelog',
      ],
    },
  ],
};

export default sidebars;
