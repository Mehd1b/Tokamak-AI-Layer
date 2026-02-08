import { BigInt, BigDecimal } from '@graphprotocol/graph-ts';
import {
  FeedbackSubmitted,
  PaymentProofSubmitted,
  MerkleRootUpdated,
} from '../generated/TALReputationRegistry/TALReputationRegistry';
import { Agent, Feedback, PaymentProof, ProtocolStats } from '../generated/schema';

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

export function handleFeedbackSubmitted(event: FeedbackSubmitted): void {
  const agentId = event.params.agentId.toString();
  const feedbackId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

  let feedback = new Feedback(feedbackId);
  feedback.agent = agentId;
  feedback.sender = event.params.sender;

  // Convert uint8[] scores to Int[]
  let scoresArray: i32[] = [];
  let scoreSum: i32 = 0;
  let scoresLength = event.params.scores.length;
  for (let i = 0; i < scoresLength; i++) {
    const s = event.params.scores[i];
    scoresArray.push(s);
    scoreSum += s;
  }
  feedback.scores = scoresArray;
  feedback.timestamp = event.block.timestamp;
  feedback.blockNumber = event.block.number;
  feedback.txHash = event.transaction.hash;
  feedback.save();

  // Update agent stats
  let agent = Agent.load(agentId);
  if (agent) {
    agent.feedbackCount += 1;
    agent.totalScoreSum = agent.totalScoreSum.plus(BigInt.fromI32(scoreSum));
    if (agent.feedbackCount > 0 && scoresLength > 0) {
      let totalScores = agent.feedbackCount * scoresLength;
      let totalAvg = agent.totalScoreSum.toBigDecimal().div(
        BigDecimal.fromString(totalScores.toString())
      );
      agent.averageScore = totalAvg;
    }
    agent.save();
  }

  let stats = getOrCreateStats();
  stats.totalFeedbacks += 1;
  stats.save();
}

export function handlePaymentProofSubmitted(event: PaymentProofSubmitted): void {
  const agentId = event.params.agentId.toString();
  const proofId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

  let proof = new PaymentProof(proofId);
  proof.agent = agentId;
  proof.client = event.params.client;
  proof.paymentTxHash = event.params.txHash;
  proof.amount = event.params.amount;
  proof.timestamp = event.block.timestamp;
  proof.save();
}

export function handleMerkleRootUpdated(event: MerkleRootUpdated): void {
  // Merkle root updates are informational - no entity changes needed beyond logging
  // The event is indexed but we don't need to store it as a separate entity
}
