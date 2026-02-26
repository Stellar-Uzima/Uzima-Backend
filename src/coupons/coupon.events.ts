export const REWARD_MILESTONE_EVENT = 'reward.milestone';

export interface RewardMilestonePayload {
  userId: string;
  totalXlm: number;
  milestoneReached?: number;
}
