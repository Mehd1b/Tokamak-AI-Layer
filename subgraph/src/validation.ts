import { BigInt } from '@graphprotocol/graph-ts';
import {
  ValidationRequested,
  ValidatorSelected,
  ValidationCompleted,
  ValidationDisputed,
  BountyDistributed,
} from '../generated/TALValidationRegistry/TALValidationRegistry';
import { Agent, ValidationRequest, ProtocolStats } from '../generated/schema';

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

export function handleValidationRequested(event: ValidationRequested): void {
  const id = event.params.requestHash.toHexString();
  const agentId = event.params.agentId.toString();

  let validation = new ValidationRequest(id);
  validation.agent = agentId;
  validation.requester = event.transaction.from;
  validation.model = event.params.model;
  validation.bounty = event.transaction.value;
  validation.status = 0; // Pending
  validation.disputed = false;
  validation.timestamp = event.block.timestamp;
  validation.blockNumber = event.block.number;
  validation.txHash = event.transaction.hash;
  validation.save();

  // Update agent stats
  let agent = Agent.load(agentId);
  if (agent) {
    agent.validationCount += 1;
    agent.save();
  }

  let stats = getOrCreateStats();
  stats.totalValidations += 1;
  stats.save();
}

export function handleValidatorSelected(event: ValidatorSelected): void {
  const id = event.params.requestHash.toHexString();
  let validation = ValidationRequest.load(id);
  if (validation) {
    validation.validator = event.params.validator;
    validation.validatorStake = event.params.stake;
    validation.save();
  }
}

export function handleValidationCompleted(event: ValidationCompleted): void {
  const id = event.params.requestHash.toHexString();
  let validation = ValidationRequest.load(id);
  if (validation) {
    validation.status = 1; // Completed
    validation.score = event.params.score;
    validation.completedAt = event.block.timestamp;
    validation.save();

    // Update agent stats
    let agent = Agent.load(validation.agent);
    if (agent) {
      if (event.params.score >= 70) {
        agent.successfulValidations += 1;
      }
      agent.save();
    }
  }

  let stats = getOrCreateStats();
  stats.completedValidations += 1;
  stats.save();
}

export function handleValidationDisputed(event: ValidationDisputed): void {
  const id = event.params.requestHash.toHexString();
  let validation = ValidationRequest.load(id);
  if (validation) {
    validation.status = 3; // Disputed
    validation.disputed = true;
    validation.save();
  }

  let stats = getOrCreateStats();
  stats.disputedValidations += 1;
  stats.save();
}

export function handleBountyDistributed(event: BountyDistributed): void {
  const id = event.params.requestHash.toHexString();
  let validation = ValidationRequest.load(id);
  if (validation) {
    validation.validatorBounty = event.params.validatorAmount;
    validation.agentBounty = event.params.agentAmount;
    validation.treasuryBounty = event.params.treasuryAmount;
    validation.save();
  }

  let stats = getOrCreateStats();
  const total = event.params.validatorAmount.plus(event.params.agentAmount).plus(event.params.treasuryAmount);
  stats.totalBountiesPaid = stats.totalBountiesPaid.plus(total);
  stats.save();
}
