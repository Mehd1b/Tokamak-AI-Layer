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
        'architecture/cryptographic-chain',
      ],
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/prerequisites',
        'getting-started/local-build',
        'getting-started/run-an-example',
        'getting-started/faq',
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
      label: 'SDK',
      collapsed: true,
      items: [
        'sdk/overview',
        'sdk/writing-an-agent',
        'sdk/constraints-and-commitments',
        'sdk/testing',
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
