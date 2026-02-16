import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/',
    component: ComponentCreator('/', '570'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', 'c24'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '65c'),
            routes: [
              {
                path: '/app/contract-integration',
                component: ComponentCreator('/app/contract-integration', '9c0'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/app/hooks-reference',
                component: ComponentCreator('/app/hooks-reference', '49d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/app/pages-guide',
                component: ComponentCreator('/app/pages-guide', '507'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/app/setup',
                component: ComponentCreator('/app/setup', '5ae'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/app/wallet-and-chains',
                component: ComponentCreator('/app/wallet-and-chains', 'ae9'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/architecture/cross-layer-bridge',
                component: ComponentCreator('/architecture/cross-layer-bridge', '735'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/architecture/overview',
                component: ComponentCreator('/architecture/overview', '67c'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/architecture/trust-model',
                component: ComponentCreator('/architecture/trust-model', 'c28'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/contracts/deployment-and-security',
                component: ComponentCreator('/contracts/deployment-and-security', '0f5'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/contracts/identity-registry',
                component: ComponentCreator('/contracts/identity-registry', '2c0'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/contracts/reputation-registry',
                component: ComponentCreator('/contracts/reputation-registry', 'be6'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/contracts/task-fee-escrow',
                component: ComponentCreator('/contracts/task-fee-escrow', 'adb'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/contracts/validation-registry',
                component: ComponentCreator('/contracts/validation-registry', '2bd'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/contracts/wston-vault',
                component: ComponentCreator('/contracts/wston-vault', '568'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/integration/drb-integration',
                component: ComponentCreator('/integration/drb-integration', 'f20'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/integration/ipfs-and-metadata',
                component: ComponentCreator('/integration/ipfs-and-metadata', '121'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/integration/staking-bridge',
                component: ComponentCreator('/integration/staking-bridge', '9f3'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/reference/deployed-contracts',
                component: ComponentCreator('/reference/deployed-contracts', '851'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/reference/glossary',
                component: ComponentCreator('/reference/glossary', '098'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/reference/repo-map',
                component: ComponentCreator('/reference/repo-map', '3c7'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/sdk/identity-client',
                component: ComponentCreator('/sdk/identity-client', '5b7'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/sdk/overview',
                component: ComponentCreator('/sdk/overview', 'fb1'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/sdk/reputation-and-validation',
                component: ComponentCreator('/sdk/reputation-and-validation', '0d8'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/sdk/types-reference',
                component: ComponentCreator('/sdk/types-reference', 'a7e'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/',
                component: ComponentCreator('/', 'b56'),
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
