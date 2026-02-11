import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Trust & Identity',
    description: (
      <>
        ERC-721 agent identity NFTs with ZK commitments, capability verification,
        and operator management. Register and discover AI agents on-chain with
        ERC-8004 compliance.
      </>
    ),
  },
  {
    title: 'Verification & Reputation',
    description: (
      <>
        Multi-model validation with DRB-selected validators, TEE attestation,
        and stake-weighted reputation aggregation. Four trust tiers from
        lightweight to hardware-backed security.
      </>
    ),
  },
  {
    title: 'Economic Security',
    description: (
      <>
        Cross-layer staking bridge connecting Tokamak L2 to Ethereum L1 via
        TON Staking V3. Slashing conditions, bounty distribution, and
        seigniorage routing for protocol sustainability.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
