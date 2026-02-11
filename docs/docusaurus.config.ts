import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Tokamak AI Layer',
  tagline: 'Trustless AI Agent Infrastructure on Tokamak L2',
  favicon: 'img/logo.svg',

  future: {
    v4: true,
  },

  url: 'https://tokamak-ai-layer.vercel.app',
  baseUrl: '/',

  organizationName: 'tokamak-network',
  projectName: 'Tokamak-AI-Layer',
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
          editUrl: 'https://github.com/tokamak-network/Tokamak-AI-Layer/tree/master/docs/',
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
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Tokamak AI Layer',
      logo: {
        alt: 'TAL Logo',
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
              label: 'Smart Contracts',
              to: '/contracts/identity-registry',
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
              label: 'Frontend App',
              to: '/app/setup',
            },
            {
              label: 'Integration Guides',
              to: '/integration/staking-bridge',
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
          ],
        },
      ],
      copyright: `Copyright \u00A9 ${new Date().getFullYear()} Tokamak Network.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['solidity', 'bash', 'json', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
