import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
  emoji: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Verifiable Execution',
    emoji: '🔐',
    description: (
      <>
        Agents run inside a RISC Zero zkVM, producing cryptographic proofs that
        guarantee correct execution without trusting the operator.
      </>
    ),
  },
  {
    title: 'Agent-Agnostic Design',
    emoji: '🔧',
    description: (
      <>
        Write agents in Rust using a simple trait interface. The kernel handles
        encoding, commitments, and constraint enforcement automatically.
      </>
    ),
  },
  {
    title: 'On-Chain Settlement',
    emoji: '⛓️',
    description: (
      <>
        Proofs verify on-chain via Groth16. Vaults execute agent decisions only
        after cryptographic verification — fully permissionless.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center" style={{fontSize: '3rem', marginBottom: '1rem'}}>
        {emoji}
      </div>
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
