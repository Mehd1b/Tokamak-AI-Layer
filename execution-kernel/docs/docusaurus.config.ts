import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Execution Kernel',
  tagline: 'Verifiable Agent Execution with RISC Zero zkVM',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.executionkernel.com',
  baseUrl: '/',

  organizationName: 'tokamak-network',
  projectName: 'docs',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/tokamak-network/Tokamak-AI-Layer/tree/master/execution-kernel/docs/',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Execution Kernel',
      logo: {
        alt: 'Execution Kernel Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/tokamak-network/Tokamak-AI-Layer',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Introduction',
              to: '/',
            },
            {
              label: 'Architecture',
              to: '/architecture/overview',
            },
            {
              label: 'Getting Started',
              to: '/getting-started/prerequisites',
            },
          ],
        },
        {
          title: 'Developer Resources',
          items: [
            {
              label: 'SDK Reference',
              to: '/sdk/overview',
            },
            {
              label: 'Building an Agent',
              to: '/sdk/writing-an-agent',
            },
            {
              label: 'Agent Pack',
              to: '/agent-pack/format',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/tokamak-network/Tokamak-AI-Layer',
            },
            {
              label: 'TAL',
              href: 'https://tokagent.network',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Tokamak Network.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['rust', 'toml', 'bash', 'json', 'solidity'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
