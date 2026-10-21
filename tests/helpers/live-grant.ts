import { LIVE_OPERATIONS, createLiveGrant, proposeLiveGrant, type GrantEnvironment, type LiveOperation } from "../../src/qloo/live-grant";

export const ALL_OPERATIONS: LiveOperation[] = [...LIVE_OPERATIONS];
export type GrantOptions = { minutes?: number; maxRequests?: number; maxRuns?: number; operations?: readonly LiveOperation[]; now?: number; environment?: GrantEnvironment;
  // Replaces the exact sentence the proposal printed; used to prove that anything else is refused.
  ownerReply?: string };
// Mimics the owner's two steps against a throwaway root: write the proposal, then answer with the exact sentence it printed.
export async function approvedGrant(root: string, change: GrantOptions = {}) {
  const proposal = await proposeLiveGrant(root, { minutes: change.minutes ?? 15, maxRequests: change.maxRequests ?? 14, maxRuns: change.maxRuns ?? 3,
    operations: change.operations ?? ALL_OPERATIONS, now: change.now, environment: change.environment });
  return createLiveGrant(root, { proposalId: proposal.proposal_id, ownerReply: change.ownerReply ?? proposal.approval_statement, now: change.now });
}
