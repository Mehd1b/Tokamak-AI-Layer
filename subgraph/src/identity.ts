import { BigInt, BigDecimal } from '@graphprotocol/graph-ts';
import {
  AgentRegistered,
  AgentURIUpdated,
  OperatorUpdated,
  OperatorVerified,
  ZKIdentityCommitted,
} from '../generated/TALIdentityRegistry/TALIdentityRegistry';
import { Agent, ProtocolStats } from '../generated/schema';

function getOrCreateStats(): ProtocolStats {
  let stats = ProtocolStats.load('global');
  if (!stats) {
    stats = new ProtocolStats('global');
    stats.totalAgents = 0;
    stats.totalFeedbacks = 0;
    stats.totalValidations = 0;
    stats.completedValidations = 0;
    stats.disputedValidations = 0;
    stats.totalBountiesPaid = BigInt.zero();
    stats.save();
  }
  return stats;
}

export function handleAgentRegistered(event: AgentRegistered): void {
  const id = event.params.agentId.toString();
  let agent = new Agent(id);
  agent.owner = event.params.owner;
  agent.agentURI = event.params.agentURI;
  agent.registeredAt = event.block.timestamp;
  agent.isActive = true;
  agent.feedbackCount = 0;
  agent.averageScore = BigDecimal.zero();
  agent.totalScoreSum = BigInt.zero();
  agent.validationCount = 0;
  agent.successfulValidations = 0;
  agent.verifiedOperator = false;
  agent.stakedAmount = BigInt.zero();
  agent.save();

  let stats = getOrCreateStats();
  stats.totalAgents += 1;
  stats.save();
}

export function handleAgentURIUpdated(event: AgentURIUpdated): void {
  const id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.agentURI = event.params.newURI;
    agent.save();
  }
}

export function handleOperatorUpdated(event: OperatorUpdated): void {
  const id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.operator = event.params.operator;
    agent.verifiedOperator = false;
    agent.save();
  }
}

export function handleOperatorVerified(event: OperatorVerified): void {
  const id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.verifiedOperator = true;
    agent.save();
  }
}

export function handleZKIdentityCommitted(event: ZKIdentityCommitted): void {
  const id = event.params.agentId.toString();
  let agent = Agent.load(id);
  if (agent) {
    agent.zkIdentity = event.params.commitment;
    agent.save();
  }
}
