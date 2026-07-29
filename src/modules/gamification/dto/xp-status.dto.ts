export class XpStatusDto {
  userId: string;
  totalXp: number;
  currentLevel: number;
  xpTowardNextLevel: number;
  xpForNextLevel: number;
  progressPercentage: number;
}

export class AwardXpDto {
  userId: string;
  amount: number;
  reason: string;
  sourceEvent: string;
  metadata?: Record<string, any>;
}

export class XpTransactionDto {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  sourceEvent: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export class LevelUpEventDto {
  userId: string;
  newLevel: number;
  xpEarned: number;
  totalXp: number;
}
