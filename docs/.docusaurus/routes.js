import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/tal/__docusaurus/debug',
    component: ComponentCreator('/tal/__docusaurus/debug', '4f1'),
    exact: true
  },
  {
    path: '/tal/__docusaurus/debug/config',
    component: ComponentCreator('/tal/__docusaurus/debug/config', 'ab0'),
    exact: true
  },
  {
    path: '/tal/__docusaurus/debug/content',
    component: ComponentCreator('/tal/__docusaurus/debug/content', '58f'),
    exact: true
  },
  {
    path: '/tal/__docusaurus/debug/globalData',
    component: ComponentCreator('/tal/__docusaurus/debug/globalData', '052'),
    exact: true
  },
  {
    path: '/tal/__docusaurus/debug/metadata',
    component: ComponentCreator('/tal/__docusaurus/debug/metadata', 'd8f'),
    exact: true
  },
  {
    path: '/tal/__docusaurus/debug/registry',
    component: ComponentCreator('/tal/__docusaurus/debug/registry', '2b1'),
    exact: true
  },
  {
    path: '/tal/__docusaurus/debug/routes',
    component: ComponentCreator('/tal/__docusaurus/debug/routes', 'f6a'),
    exact: true
  },
  {
    path: '/tal/',
    component: ComponentCreator('/tal/', 'a18'),
    routes: [
      {
        path: '/tal/',
        component: ComponentCreator('/tal/', 'fcb'),
        routes: [
          {
            path: '/tal/',
            component: ComponentCreator('/tal/', '75c'),
            routes: [
              {
                path: '/tal/app/contract-integration',
                component: ComponentCreator('/tal/app/contract-integration', '533'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/app/hooks-reference',
                component: ComponentCreator('/tal/app/hooks-reference', 'e4b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/app/pages-guide',
                component: ComponentCreator('/tal/app/pages-guide', 'c8b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/app/setup',
                component: ComponentCreator('/tal/app/setup', '5aa'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/app/wallet-and-chains',
                component: ComponentCreator('/tal/app/wallet-and-chains', '3b0'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/architecture/cross-layer-bridge',
                component: ComponentCreator('/tal/architecture/cross-layer-bridge', 'c16'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/architecture/overview',
                component: ComponentCreator('/tal/architecture/overview', '2af'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/architecture/trust-model',
                component: ComponentCreator('/tal/architecture/trust-model', '470'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/contracts/deployment-and-security',
                component: ComponentCreator('/tal/contracts/deployment-and-security', '73f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/contracts/identity-registry',
                component: ComponentCreator('/tal/contracts/identity-registry', 'e05'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/contracts/reputation-registry',
                component: ComponentCreator('/tal/contracts/reputation-registry', 'e7a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/contracts/task-fee-escrow',
                component: ComponentCreator('/tal/contracts/task-fee-escrow', 'a0f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/contracts/validation-registry',
                component: ComponentCreator('/tal/contracts/validation-registry', '37c'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/integration/drb-integration',
                component: ComponentCreator('/tal/integration/drb-integration', 'af8'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/integration/ipfs-and-metadata',
                component: ComponentCreator('/tal/integration/ipfs-and-metadata', 'a55'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/integration/staking-bridge',
                component: ComponentCreator('/tal/integration/staking-bridge', 'c92'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/reference/deployed-contracts',
                component: ComponentCreator('/tal/reference/deployed-contracts', 'c03'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/reference/glossary',
                component: ComponentCreator('/tal/reference/glossary', '69f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/reference/repo-map',
                component: ComponentCreator('/tal/reference/repo-map', '99d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/sdk/identity-client',
                component: ComponentCreator('/tal/sdk/identity-client', 'bb7'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/sdk/overview',
                component: ComponentCreator('/tal/sdk/overview', 'd99'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/sdk/reputation-and-validation',
                component: ComponentCreator('/tal/sdk/reputation-and-validation', '1bf'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/sdk/types-reference',
                component: ComponentCreator('/tal/sdk/types-reference', '52a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/tal/',
                component: ComponentCreator('/tal/', '59b'),
                exact: true,
                sidebar: "docsSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
