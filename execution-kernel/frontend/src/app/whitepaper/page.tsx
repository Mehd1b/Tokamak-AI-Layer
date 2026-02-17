'use client';
import ExecutionWorkflowDiagram from '../../components/ExecutionWorkflowDiagram';
import ProofGenerationPipeline from '../../components/ProofGenerationPipeline';
import OperatingEnvelopeDiagram from '../../components/OperatingEnvelopeDiagram';

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white relative">
      {/* Grid Pattern Background */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px'
        }}
      />

      <main className="relative z-10 max-w-4xl mx-auto px-8 py-12 pt-28">
        <article className="prose prose-invert prose-lg max-w-none">
          <header className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-light mb-4">
              Verifiable ML Agent Marketplace for DeFi
            </h1>
            <div className="w-32 h-1 bg-gradient-to-r from-purple-400 via-violet-500 to-fuchsia-400 mx-auto rounded-full"></div>
          </header>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">Abstract</h2>
            <div className="bg-gray-900/60 rounded-2xl p-8 border border-gray-700/50">
              <p className="text-gray-300 leading-8 mb-6">
                This paper presents a decentralized protocol that enables the creation, discovery, and use of machine-learning agents whose behavior is cryptographically verifiable on-chain. The protocol allows users to delegate constrained decision-making authority to off-chain agents while preserving strict trust-minimization guarantees: vaults execute only actions accompanied by a valid proof of compliant execution.
              </p>
              <p className="text-gray-300 leading-8 mb-6">
                The Execution Kernel achieves this by combining (i) deterministic execution inside a zkVM, (ii) cryptographic commitments to agent code, model parameters, and constraint sets, and (iii) on-chain verification that gates settlement. Importantly, the protocol is designed for a realistic operating envelope: verifiable execution is best suited to risk management, rebalancing, governance automation, and policy-based execution—not latency-critical arbitrage.
              </p>
              <p className="text-gray-300 leading-8">
                The system removes trust in agent developers and executors by construction. Users need only trust standard cryptographic assumptions and the correctness of the verifier contracts.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">1. Introduction</h2>
            <p className="text-gray-300 leading-8 mb-6">
              Artificial intelligence agents are increasingly used in decentralized finance, automated trading, governance automation, and protocol operations. Despite their growing importance, current systems require users to place significant trust in off-chain actors. Users must trust agent developers not to include malicious logic, infrastructure operators not to deviate from declared behavior, and AI models not to act in ways that violate user expectations. This trust assumption is fundamentally incompatible with the ethos of decentralized systems.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              This protocol introduces a new primitive referred to as verifiable AI execution. Under this paradigm, every action performed by an AI agent is accompanied by a cryptographic proof that attests that the agent followed a pre-committed program, model, and set of constraints. The result is an AI execution framework that is auditable, enforceable, and trust-minimized.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">1.1 Related Work</h3>
            <p className="text-gray-300 leading-8 mb-6">
              Several existing projects explore the intersection of artificial intelligence and blockchain, but they rely on fundamentally different trust and execution assumptions. Autonolas and similar agent coordination frameworks focus on decentralized agent orchestration and incentive alignment, but they do not provide cryptographic guarantees that agents execute a specific program or respect strict behavioral constraints. As a result, correctness and safety ultimately depend on off-chain trust.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Bittensor introduces a token-incentivized marketplace for machine learning models, where participants are rewarded based on peer evaluation and network consensus. While effective for coordinating open-ended machine learning research, this approach does not provide deterministic guarantees about agent behavior or enforceable execution constraints. Model outputs are economically incentivized rather than cryptographically verified.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Visions.ai proposes a token-driven marketplace for AI agents, emphasizing economic alignment and reputation. However, agent execution remains opaque, and users must trust that reported behavior and performance accurately reflect reality. The system does not provide a mechanism to prove that an agent adhered to a specific strategy or respected predefined safety constraints during execution.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Our approach addresses a different class of problems than incentive-driven agent marketplaces. Instead of using social reputation or token economics to approximate correctness, the Execution Kernel enforces correctness as a verifiable property of execution. Every settled action is accompanied by proof that the agent ran the committed program, over the committed model, and produced outputs that satisfy a declared constraint set.
            </p>
            <p className="text-gray-300 leading-8">
              This is not &quot;trustless AI&quot; in the general sense. It is verifiable ML by design, tailored to the parts of DeFi where correctness, safety bounds, and auditability are more valuable than sub-second latency.
            </p>
          </section>

          <section className="mb-12">
            <h3 className="text-2xl font-semibold text-white mb-6">1.2 Problem Statement</h3>
            <p className="text-gray-300 leading-8">
              Existing AI agent marketplaces rely on opaque off-chain execution environments and unverifiable performance claims. Users cannot independently verify whether an agent executed the advertised strategy, whether historical returns are accurate, or whether funds are at risk of misuse. Smart contracts alone are insufficient to express complex AI logic efficiently, while purely off-chain systems lack enforceability. This gap between expressiveness and verifiability prevents the safe adoption of autonomous agents in Web3.
            </p>
          </section>
          <section className="mb-12">
            <h3 className="text-2xl font-semibold text-white mb-6">1.3 Design Goals</h3>
            <p className="text-gray-300 leading-8">
              The protocol is designed to eliminate unnecessary trust assumptions while remaining practical and scalable. It aims to ensure that no centralized party is required for correct operation, that every agent action can be verified cryptographically, and that participation as a developer, executor, or user remains permissionless. The architecture is intentionally modular so that execution, constraint enforcement, accounting, and analytics can evolve independently. Scalability is achieved by minimizing on-chain computation and leveraging recursive zero-knowledge proofs.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">2. High-Level Architecture</h2>
            <p className="text-gray-300 leading-8 mb-6">
              The system is composed of several interacting actors and components. Agent developers author AI agents and publish cryptographic commitments to their code and models. Users interact with the protocol through isolated vaults that hold their assets. Executors run agents off-chain and generate proofs of correct execution. Smart contracts deployed on-chain are responsible for verifying proofs, enforcing constraints, and executing authorized actions.
            </p>

            <div className="my-12 text-center">
              <h4 className="text-xl font-semibold text-white mb-6">Protocol Workflow Overview</h4>
              <div className="bg-gray-900/40 rounded-2xl p-8 border border-gray-700/30">
                <img
                  src="/workflow/workflow.png"
                  alt="Protocol Workflow Overview"
                  className="w-full max-w-4xl mx-auto rounded-lg shadow-2xl"
                />
              </div>
            </div>

            <p className="text-gray-300 leading-8">
              At the protocol level, the architecture includes an agent registry, user vault contracts, a zero-knowledge proof system, verifier contracts, and a metrics engine that maintains verifiable reputation data. Each component has a narrowly defined responsibility in order to minimize complexity and attack surface.
            </p>

            <div className="my-8">
              <ExecutionWorkflowDiagram />
            </div>

            <h3 className="text-2xl font-semibold text-white mb-6">2.1 Agent Lifecycle</h3>
            <p className="text-gray-300 leading-8 mb-6">
              The lifecycle of an agent begins with registration. An agent developer compiles the agent into a deterministic execution format, such as WASM, and computes cryptographic commitments to the agent code, the model parameters, and the declared execution constraints. These commitments are published on-chain and become immutable identifiers for the agent.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Once registered, agents become discoverable through the marketplace interface. Users can evaluate agents based on strategy descriptions, declared risk constraints, and performance metrics that are derived from verifiable execution history. Because all metrics are backed by cryptographic proofs, users do not need to rely on self-reported claims.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.2 User Vaults</h3>
            <p className="text-gray-300 leading-8 mb-6">
              Users interact with agents exclusively through dedicated vault smart contracts. Each vault holds the user&apos;s assets and enforces strict execution policies. The vault only accepts actions that are accompanied by valid zero-knowledge proofs and that comply with the agent&apos;s declared constraints. At no point does an agent or executor gain direct custody of user funds, which significantly reduces the risk of misuse or theft.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.3 Execution Environment & Determinism</h3>
            <p className="text-gray-300 leading-8 mb-6">
              The protocol relies on a zkVM to make agent execution reproducible and objectively verifiable. However, &quot;deterministic execution&quot; is not a vague aspiration—it is a set of enforceable rules. The Execution Kernel therefore defines a Deterministic Runtime Profile for agents, specifying exactly which operations are permitted and how they must behave.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              The Execution Kernel uses RISC Zero to execute RISC-V guest programs and to generate proofs of execution. RISC Zero&apos;s native floating-point support is a pragmatic advantage, but floating-point alone does not guarantee bit-exact reproducibility across implementations. For that reason, the Execution Kernel constrains agents to a deterministic runtime: no external calls, no system time, no nondeterministic host inputs, no parallel reductions, and no architecture-dependent math intrinsics. Where numerical stability is critical, agents must rely on protocol-provided deterministic math primitives (e.g., canonical f32 operations or fixed-point/softfloat variants where required).
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              In short: agents are not &quot;arbitrary Rust programs.&quot; They are programs that opt into verifiability by adhering to a deterministic execution contract—one that can be audited, tested, and enforced at build time.
            </p>

            <div className="mb-8">
              <ProofGenerationPipeline />
            </div>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.1 Private Zone Execution</h4>
            <p className="text-gray-300 leading-8 mb-6">
              Agent execution occurs within a secure private zone where model weights are loaded directly into prover memory and never transmitted over networks. The RISC Zero zkVM executes deterministic RISC-V code with native f32 floating-point support, processing approximately 10 million CPU cycles for typical AI inference workloads. The execution follows a strict four-step process: (1) <span className="font-mono text-purple-400">env::read()</span> loads inputs and weights, (2) <span className="font-mono text-purple-400">inference(x, W)</span> performs the forward pass, (3) <span className="font-mono text-purple-400">constraints.validate()</span> checks bounds, and (4) <span className="font-mono text-purple-400">env::commit(action)</span> writes results to the cryptographically verifiable journal.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.2 Model Commitment Scheme</h4>
            <p className="text-gray-300 leading-8 mb-6">
              Every agent is associated with an immutable cryptographic commitment to both the code and the model parameters, called the Image ID. The Image ID is derived as a hash of the compiled RISC-V binary, memory layout, and entry point, ensuring that any change produces a new identifier. Large model parameters are committed via a Merkle tree structure, where the root hash is stored on-chain. This allows the zkVM to verify that executed models correspond exactly to the committed parameters without revealing sensitive weights.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.3 Execution Architecture</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The execution environment follows a guest-host model. The guest program runs inside the zkVM, producing a cryptographic proof of correct execution, writing outputs to a journal, and operating independently of the host. The host program orchestrates inputs, collects proofs, and submits verified outputs to on-chain contracts. This architecture enforces strict separation between computation and orchestration, preventing the host from influencing execution while enabling proofs to be generated efficiently.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.4 Proof Generation Pipeline</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The proof pipeline transforms execution traces through multiple compression stages, achieving a 50,000,000x reduction from raw trace (~10 GB) to final proof (~200 bytes). First, the RV32IM instruction set execution generates a complete trace over the BabyBear field. This trace is segmented into 1M-cycle chunks, with each segment producing a STARK proof using FRI polynomial commitments and Poseidon2 hashing, achieving ~100 bits of security. Segment proofs are recursively aggregated into a single STARK and then compressed through a STARK-to-SNARK wrapper. In practice, compression latency is workload-dependent; the Execution Kernel targets sub-10s end-to-end proving for MVP agents and treats longer proving times as acceptable only for non-urgent workflows or higher-complexity models.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              A verifiable execution pipeline introduces unavoidable latency between observation and settlement. The Execution Kernel is therefore optimized for strategies where correctness and bounded behavior matter more than millisecond reaction time—e.g., risk checks, rebalancing, parameter updates, and policy-based automation. For state-sensitive actions, the protocol supports freshness bounds (see §2.5) so proofs are only valid if settlement conditions remain within declared tolerances.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.5 Receipt Structure and On-Chain Verification</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The final execution receipt consists of three components: a Groth16 seal (π, ~200 bytes), the agent Image ID (32 bytes), and a variable-length journal containing proven outputs. On-chain verification calls <span className="font-mono text-emerald-400">verifier.verify(seal, imageId, sha256(journal))</span> consuming approximately 250k gas through BN254 pairing operations. The Groth16 circuit takes as public inputs the imageId and journalHash, while the private witness includes the complete STARK proof and auxiliary data (~100KB). The constraint <span className="font-mono text-amber-400">STARK.verify(Π, imageId, journal) == true</span> ensures that the compressed proof validates against the committed program and declared outputs.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.6 STARK-to-SNARK Compression Rationale</h4>
            <p className="text-gray-300 leading-8 mb-6">
              Raw STARK proofs, while providing excellent security guarantees and parallelizable proving, produce proofs of 100-500 KB that are prohibitively expensive to verify on-chain. The STARK-to-SNARK wrapper addresses this by embedding a complete STARK verifier within a Groth16 circuit, leveraging the constant-size property of SNARK proofs. This approach requires a trusted setup for the Common Reference String (CRS) but results in constant ~200-byte proofs with efficient pairing-based verification. The compression trades off the transparent setup of STARKs for the practical on-chain verification requirements of Ethereum and L2 networks.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.7 Executor Infrastructure and Security</h4>
            <p className="text-gray-300 leading-8 mb-6">
              Executors participate in a decentralized network and must stake tokens to submit proofs. Slashing mechanisms penalize invalid proofs, aligning incentives with honest computation. The execution environment and proof system rely on well-established cryptographic assumptions including discrete log hardness for Groth16, the Fiat-Shamir transform for STARK soundness, and collision resistance for Poseidon2. Formal verification of RISC Zero circuits ensures correctness of instruction execution, memory safety, and cryptographic operations.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.8 Supported Models and Practical Limits</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The Execution Kernel supports a range of models implemented in Rust or compatible deterministic libraries, including linear/logistic regression, tree-based methods (e.g., small random forests / gradient-boosted trees), and compact neural networks (e.g., MLPs).
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              However, verifiable execution has a practical operating envelope defined by zkVM cycle budgets and prover economics. For the initial protocol versions, the Execution Kernel is designed for small to moderate models—typically on the order of ~1–10M parameters and execution traces in the ~10–20M cycle range for inference plus constraint checks. This is sufficient for many DeFi automation tasks (risk scoring, guardrails, rebalancing policies, and signal generation), but it is not intended for &quot;GPT-scale&quot; inference.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Where users require heavyweight models, the roadmap explicitly includes hybrid architectures (e.g., TEE-backed inference with ZK verification of policy compliance) to preserve security while maintaining practical latency.
            </p>

            <div className="mb-8">
              <OperatingEnvelopeDiagram />
            </div>

            <h4 className="text-xl font-semibold text-white mb-4">2.3.9 Implementation Roadmap</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The protocol&apos;s roadmap includes incremental support for increasingly complex AI models, recursive proofs for multi-agent execution, and integration with hardware-based trusted execution environments. Initial deployment focuses on basic ML models, followed by neural network support, advanced constraint enforcement, multi-agent composition, and eventually TEE integration for enhanced security and efficiency.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.3.10 Proving Economics</h3>
            <p className="text-gray-300 leading-8 mb-6">
              Verifiable execution is only viable if proving costs remain a fraction of the economic value secured. Under realistic usage, each agent action requires roughly 5–20 million RISC-V cycles, translating to 3–15 seconds of proving time on an A100-class GPU. At bulk GPU pricing ($2–3/hour), this implies a raw proving cost of approximately $0.003–$0.015 per proof, or conservatively $0.01–$0.03 all-in including infrastructure overhead.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              The protocol only generates proofs for economically meaningful actions—DeFi trades, vault rebalances, position adjustments—where protocol revenue per action is typically an order of magnitude higher than proving cost. This ensures a sustainable margin buffer of 5&times;–100&times; depending on transaction size. The protocol explicitly avoids proving full neural inference inside the zkVM, keeping computation bounded and unit economics viable. Larger models and heavier inference workloads are handled through hybrid architectures (e.g., TEE-backed inference with ZK-verified policy compliance) rather than by scaling proving costs linearly.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.4 Verification Model: What ZKP Proves</h3>
            <p className="text-gray-300 leading-8 mb-6">
              A critical distinction must be made explicit: the Execution Kernel does not attempt to prove that an AI agent &quot;reasoned correctly&quot; or produced an &quot;intelligent&quot; output. Open-ended problem solving—such as an LLM generating code or a neural network producing a trading signal—is not an NP problem in the classical sense. There is no fixed, static predicate that defines &quot;correct reasoning,&quot; and attempting to encode the full cognitive process of an AI model into a zero-knowledge circuit would be both misguided and infeasible.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Zero-knowledge proofs address NP problems: problems where the complexity of finding a solution may be high and dynamic, but the complexity of <em>verifying</em> a solution is fixed and tractable. The Execution Kernel aligns with this model by clearly separating the act of solving a problem (agent inference) from the act of verifying the solution (execution integrity and constraint compliance).
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.4.1 RISC Zero&apos;s Verification Methodology</h4>
            <p className="text-gray-300 leading-8 mb-6">
              RISC Zero does not transform arbitrary RISC-V programs into bespoke ZK circuits. Instead, the RISC Zero team defined a <em>static methodology for verifying the execution of RISC-V programs</em>. This methodology checks whether memory data is consistent between steps, whether instructions are processed correctly at each step, and—critically—whether the number of steps required to execute a program does not exceed a predetermined maximum. The execution trace is the witness, and the fixed VM transition rules form the verification predicate. This stays aligned with the NP model: the predicate is static and tractable, even though the computation being verified may be complex.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              By adopting RISC Zero, the Execution Kernel inherits this predefined verification methodology rather than defining one from scratch. Our contribution is at the application layer: embedding protocol-specific constraint logic inside the guest program whose correct execution RISC Zero already knows how to prove. We extend the verification framework with domain-specific guarantees without redefining the proving model itself.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.4.2 Two Layers of Verification</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The protocol provides two complementary layers of cryptographic verification. The first layer is <strong>execution integrity</strong>: given fixed agent code, fixed model weights, and fixed inputs, inference is deterministic computation that can be compiled to RISC-V instructions and proven as an execution trace. The proof guarantees that the declared program ran correctly over the declared inputs—nothing more, nothing less. This does not require the underlying problem to be NP; it only requires that execution be deterministic and well-defined.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              The second layer is <strong>constraint compliance</strong>: rather than proving that an agent &quot;correctly reasoned,&quot; the protocol defines explicit, static verification predicates over the agent&apos;s output—risk bounds, position size limits, leverage caps, drawdown thresholds, cooldown periods, and asset whitelists. The agent generates a candidate action; what gets proven is that the action satisfies these predefined rules. This aligns closely with the classical NP verification model: the constraints form a fixed predicate, and the proof demonstrates that the output is a valid witness.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              In summary: the protocol does not prove intelligence. It proves either that a deterministic program executed correctly (execution integrity) or that an output satisfies predefined safety rules (constraint compliance). The latter is the more scalable and practically meaningful guarantee for DeFi applications.
            </p>

            <h4 className="text-xl font-semibold text-white mb-4">2.4.3 Proof Composition</h4>
            <p className="text-gray-300 leading-8 mb-6">
              The proof system is structured as a composition of several logical stages. The base layer proves correct agent execution with respect to the committed code and model. The constraint engine, running inside the same zkVM execution, enforces the declared safety and risk constraints as an unskippable post-condition. Vault state transitions and accounting correctness are verified through deterministic state root updates. These stages are captured in a single execution trace that is recursively compressed and verified efficiently on-chain.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.5 Constraint Model</h3>
            <p className="text-gray-300 leading-8 mb-6">
              Constraints are declared by the agent developer at registration time and enforced cryptographically during execution. Constraints may include limits on drawdown, bounds on position sizing, restrictions on asset transfers, and prohibitions on specific contract calls. Any execution that violates constraints produces an invalid proof and is rejected by the protocol.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              In addition, the Execution Kernel supports freshness and state-binding constraints for economically sensitive actions. Agents may commit to a snapshot of relevant on-chain state (e.g., oracle price, pool reserves, vault equity) and declare validity conditions such as: &quot;settle only if price deviation ≤ X%,&quot; &quot;settle only if block.number ≤ snapshotBlock + N,&quot; or &quot;settle only if liquidity remains above threshold Y.&quot; These bounds reduce the risk that a proof remains technically valid but economically stale by the time it reaches settlement.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.6 Performance and Reputation</h3>
            <p className="text-gray-300 leading-8 mb-6">
              Performance metrics such as return on investment, volatility, and maximum drawdown are computed within zero-knowledge circuits. Because these metrics are derived from provably correct state transitions, they cannot be forged or manipulated. The resulting reputation scores provide users with a reliable basis for comparing agents.
            </p>

            <h3 className="text-2xl font-semibold text-white mb-6">2.7 Privacy and Strategy Confidentiality</h3>
            <p className="text-gray-300 leading-8 mb-6">
              Proofs certify correct execution and constraint compliance, but proofs alone do not automatically provide confidentiality. In the MVP architecture, journals and committed inputs may reveal aspects of an agent&apos;s decisions or a user&apos;s parameters, which can enable strategy inference in adversarial environments.
            </p>
            <p className="text-gray-300 leading-8">
              The Execution Kernel therefore treats privacy as a staged capability. Early deployments prioritize correctness and enforceability; subsequent versions introduce confidentiality through (i) input-hiding commitment schemes for sensitive parameters, (ii) selective disclosure of journal fields, and (iii) hybrid execution options (e.g., TEE-backed confidentiality with ZK-backed policy compliance) where appropriate. The goal is to preserve verifiability without forcing strategy disclosure as the default.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">3. Accounting and State Roots</h2>
            <p className="text-gray-300 leading-8">
              Vault state is represented by a Merkle-based state root that commits to balances, open positions, and accrued fees. Each execution produces a new state root, and the proof system guarantees that the transition from the previous state root to the new one is correct. This approach allows the protocol to maintain a compact on-chain representation of complex off-chain state.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">4. Incentive Model</h2>
            <p className="text-gray-300 leading-8">
              The protocol includes a native incentive structure that aligns the interests of all participants. Users pay execution and performance fees in exchange for verifiable agent behavior. Developers receive royalties proportional to the usage and success of their agents. Executors are compensated for running agents and generating proofs. All fee distribution logic is enforced on-chain and is fully transparent.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">5. Tokenomics</h2>
            <p className="text-gray-300 leading-8 mb-6">
              The protocol is governed and coordinated by a native utility token that serves as the economic backbone of the system. This token is designed to align long-term incentives between users, agent developers, executors, and governance participants, while avoiding reliance on speculative mechanics. The token plays an active role in protocol security, coordination, and value distribution rather than serving solely as a medium of exchange.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              The primary function of the token is to secure and regulate participation in the protocol. Executors are required to stake tokens in order to submit execution proofs. This staking mechanism creates an economic guarantee of honest behavior, as executors who submit invalid proofs or attempt to censor executions can be penalized through slashing. The staking requirement also acts as a Sybil-resistance mechanism, ensuring that execution power is backed by economic cost.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Agent developers may optionally stake tokens to signal confidence in their agents. Staked agents benefit from increased visibility in the marketplace and preferential discovery. If an agent is shown, through verifiable execution history, to consistently violate declared constraints or underperform relative to its claims, the developer&apos;s stake may be reduced or locked, creating a reputational and economic cost for dishonest behavior.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Users interact with the token primarily through fee payments and governance participation. A portion of execution fees and performance fees is denominated in the native token, creating persistent demand tied directly to protocol usage. Fee revenue collected by the protocol is partially redistributed to token stakers, aligning token holders with the growth and health of the ecosystem.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              The token also serves as the governance mechanism for the protocol. Token holders may participate in decisions regarding protocol upgrades, parameter tuning, supported execution environments, verifier keys, and the evolution of agent standards. Governance is explicitly constrained to avoid interference with individual agent execution, which remains strictly rule-based and proof-enforced.
            </p>
            <p className="text-gray-300 leading-8 mb-6">
              Token issuance follows a capped or predictably decaying supply schedule to avoid long-term inflationary pressure. Initial distribution is allocated among the core contributors, early developers, ecosystem incentives, and a community treasury. The community treasury is governed on-chain and is used to fund research, security audits, prover infrastructure, and ecosystem development.
            </p>
            <p className="text-gray-300 leading-8">
              Importantly, the value of the token is directly coupled to real protocol activity rather than abstract narratives. As more agents are deployed, more executions are proven, and more capital flows through verified vaults, token demand increases through staking requirements, fee payments, and governance participation. This creates a feedback loop in which protocol adoption strengthens the economic security and coordination capacity of the system.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">6. Security Considerations</h2>
            <p className="text-gray-300 leading-8">
              The protocol is designed to mitigate a wide range of attack vectors, including malicious agent code, executor deviation, and state manipulation. Security relies on well-understood cryptographic assumptions underlying hash functions and zero-knowledge proof systems. By minimizing trusted components, the protocol reduces the impact of potential failures.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">7. Scalability Considerations</h2>
            <p className="text-gray-300 leading-8">
              Scalability is achieved through off-chain execution and recursive proof aggregation. On-chain verification remains lightweight, making the protocol suitable for deployment on layer two networks and rollups. As proof systems improve, the protocol can benefit from reduced costs without fundamental redesign.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">8. Future Work</h2>
            <p className="text-gray-300 leading-8">
              Future extensions of the protocol include governance frameworks for agent standards, composition of multiple agents, on-chain governance over agent upgrades, and integration with hardware-based attestations. These directions aim to further expand the applicability of verifiable AI agents.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-semibold text-white mb-6 text-center">9. Conclusion</h2>
            <div className="bg-gray-900/60 rounded-2xl p-8 border border-gray-700/50">
              <p className="text-gray-300 leading-8">
                This protocol introduces a foundational layer for trustless AI agents in decentralized systems. By combining zero-knowledge proofs, constrained execution, and on-chain enforcement, it enables a new class of autonomous agents whose behavior is verifiable, accountable, and economically aligned with user interests.
              </p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
