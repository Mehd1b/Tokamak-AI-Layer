// Core client
export { TALClient } from './TALClient';

// Domain clients
export { IdentityClient } from './identity/IdentityClient';
export { ReputationClient } from './reputation/ReputationClient';
export { ValidationClient } from './validation/ValidationClient';

// Builders
export { RegistrationBuilder } from './identity/RegistrationBuilder';

// Utilities
export { SubgraphClient } from './subgraph/SubgraphClient';
export { ProofGenerator } from './zk/ProofGenerator';

// Types
export * from './types';

// ABIs
export { TALIdentityRegistryABI } from './abi/TALIdentityRegistry';
export { TALIdentityRegistryV2ABI } from './abi/TALIdentityRegistryV2';
export { TALReputationRegistryABI } from './abi/TALReputationRegistry';
export { TALValidationRegistryABI } from './abi/TALValidationRegistry';
export { TALValidationRegistryV2ABI } from './abi/TALValidationRegistryV2';
