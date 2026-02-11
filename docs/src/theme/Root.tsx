import type {ReactNode} from 'react';

export default function Root({children}: {children: ReactNode}): ReactNode {
  return <>{children}</>;
}
