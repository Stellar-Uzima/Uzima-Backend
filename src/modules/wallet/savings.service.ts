import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual, Between, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import StellarSdk from 'stellar-sdk';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SavingsGoal, SavingsGoalStatus } from '../../database/entities/savings-goal.entity';
import { SavingsContribution, ContributionStatus } from '../../database/entities/savings-goal.entity';
import { WalletTransaction, WalletTransactionType, WalletTransactionStatus } from '../../database/entities/wallet-transaction.entity';
import { User } from '../../entities/user.entity';
import { WalletService } from './wallet.service';
import { StellarService } from '../../stellar/stellar.service';
import {
  CreateSavingsGoalDto,
  UpdateSavingsGoalDto,
  CreateContributionDto,
  SavingsGoalResponseDto,
  ContributionResponseDto,
  SavingsGoalListQueryDto,
} from './dto/savings-wallet.dto';

@Injectable()
export class SavingsService {
  private readonly logger = new Logger(SavingsService.name);

  constructor(
    @InjectRepository(SavingsGoal)
    private readonly goalRepo: Repository<SavingsGoal>,
    @InjectRepository(SavingsContribution)
    private readonly contributionRepo: Repository<SavingsContribution>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletService: WalletService,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Create a new savings goal
   */
  async createGoal(userId: string, dto: CreateSavingsGoalDto): Promise<SavingsGoalResponseDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if wallet is linked
    const walletAddress = user.stellarWalletAddress || user.walletAddress;
    if (!walletAddress) {
      throw new BadRequestException('Please link a Stellar wallet before creating savings goals');
    }

    const goal = this.goalRepo.create({
      userId,
      title: dto.title,
      description: dto.description,
      targetAmount: dto.targetAmount,
      currentAmount: 0,
      autoContributionAmount: dto.autoContributionAmount || 0,
      autoContributionFrequency: dto.autoContributionFrequency || null,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      status: SavingsGoalStatus.ACTIVE,
    });

    const saved = await this.goalRepo.save(goal);

    // Invalidate user's goals cache
    await this.invalidateGoalsCache(userId);

    this.logger.log(`Savings goal created: ${saved.id} for user ${userId}`);

    return this.mapGoalToResponse(saved);
  }

  /**
   * Get user's savings goals with pagination and filters
   */
  async getGoals(userId: string, query: SavingsGoalListQueryDto): Promise<{
    data: SavingsGoalResponseDto[];
    metadata: { totalCount: number; page: number; limit: number; totalPages: number };
  }> {
    const qb = this.goalRepo
      .createQueryBuilder('goal')
      .where('goal.userId = :userId', { userId });

    if (query.status) {
      qb.andWhere('goal.status = :status', { status: query.status });
    }

    qb.orderBy('goal.createdAt', 'DESC');

    const skip = (query.page! - 1) * query.limit!;
    qb.skip(skip).take(query.limit!);

    const [goals, totalCount] = await qb.getManyAndCount();

    return {
      data: goals.map(g => this.mapGoalToResponse(g)),
      metadata: {
        totalCount,
        page: query.page!,
        limit: query.limit!,
        totalPages: Math.ceil(totalCount / query.limit!),
      },
    };
  }

  /**
   * Get a single savings goal by ID
   */
  async getGoalById(userId: string, goalId: string): Promise<SavingsGoalResponseDto> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId, userId } });
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }
    return this.mapGoalToResponse(goal);
  }

  /**
   * Update a savings goal
   */
  async updateGoal(userId: string, goalId: string, dto: UpdateSavingsGoalDto): Promise<SavingsGoalResponseDto> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId, userId } });
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }

    // Prevent changing amount if already completed
    if (goal.status === SavingsGoalStatus.COMPLETED && dto.targetAmount) {
      throw new BadRequestException('Cannot modify target amount of completed goal');
    }

    // Prevent modifying auto-contribution if there are pending contributions
    if (dto.autoContributionAmount !== undefined || dto.autoContributionFrequency !== undefined) {
      const pendingCount = await this.contributionRepo.count({
        where: { goalId, status: ContributionStatus.PENDING },
      });
      if (pendingCount > 0) {
        throw new BadRequestException('Cannot modify auto-contribution while pending contributions exist');
      }
    }

    Object.assign(goal, dto);

    // Check if goal is now completed
    if (dto.targetAmount && goal.currentAmount >= dto.targetAmount && goal.status === SavingsGoalStatus.ACTIVE) {
      goal.status = SavingsGoalStatus.COMPLETED;
      goal.completedAt = new Date();
      this.eventEmitter.emit('savings.goal.completed', { goalId: goal.id, userId });
    }

    await this.goalRepo.save(goal);
    await this.invalidateGoalsCache(userId);

    return this.mapGoalToResponse(goal);
  }

  /**
   * Delete/cancel a savings goal
   */
  async deleteGoal(userId: string, goalId: string): Promise<void> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId, userId } });
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }

    if (goal.status === SavingsGoalStatus.COMPLETED) {
      throw new BadRequestException('Cannot delete a completed goal');
    }

    // Check for pending contributions
    const pendingCount = await this.contributionRepo.count({
      where: { goalId, status: ContributionStatus.PENDING },
    });
    if (pendingCount > 0) {
      throw new BadRequestException('Cannot delete goal with pending contributions. Wait for them to complete or fail.');
    }

    goal.status = SavingsGoalStatus.CANCELLED;
    await this.goalRepo.save(goal);
    await this.invalidateGoalsCache(userId);
  }

  /**
   * Make a contribution to a savings goal
   */
  async contribute(userId: string, goalId: string, dto: CreateContributionDto): Promise<ContributionResponseDto> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId, userId } });
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }

    if (goal.status !== SavingsGoalStatus.ACTIVE) {
      throw new BadRequestException(`Cannot contribute to goal with status: ${goal.status}`);
    }

    // Check if contribution would exceed target
    const projectedAmount = Number(goal.currentAmount) + dto.amount;
    if (projectedAmount > Number(goal.targetAmount)) {
      throw new BadRequestException(
        `Contribution of ${dto.amount} XLM would exceed target of ${goal.targetAmount} XLM. Max allowed: ${(Number(goal.targetAmount) - Number(goal.currentAmount)).toFixed(7)} XLM`,
      );
    }

    // Check wallet balance
    const walletSummary = await this.walletService.getWalletSummary(userId);
    if (!walletSummary.walletLinked) {
      throw new BadRequestException('No wallet linked');
    }

    const liveBalance = parseFloat(walletSummary.liveBalance);
    const minReserve = 0.5;
    const availableBalance = liveBalance - minReserve;

    if (availableBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${availableBalance.toFixed(7)} XLM (minimum reserve: ${minReserve} XLM)`,
      );
    }

    // Create contribution record
    const contribution = this.contributionRepo.create({
      userId,
      goalId,
      amount: dto.amount,
      status: ContributionStatus.PENDING,
    });
    await this.contributionRepo.save(contribution);

    // Create wallet transaction record
    const transaction = this.transactionRepo.create({
      userId,
      type: WalletTransactionType.SAVINGS_CONTRIBUTION,
      amount: dto.amount,
      balanceBefore: liveBalance,
      balanceAfter: liveBalance - dto.amount,
      status: WalletTransactionStatus.PENDING,
      referenceId: contribution.id,
      referenceType: 'savings_goal',
      description: `Contribution to savings goal: ${goal.title}`,
      metadata: { goalId, goalTitle: goal.title },
    });
    await this.transactionRepo.save(transaction);

    // Process the contribution (in real implementation, this would be async via queue)
    // For now, we'll simulate immediate processing
    try {
      // Deduct from wallet (simulate Stellar transaction)
      const user = await this.userRepo.findOne({ where: { id: userId } });
      user.walletBalance = parseFloat((user.walletBalance - dto.amount).toFixed(7));
      await this.userRepo.save(user);

      // Update goal
      goal.currentAmount = parseFloat((Number(goal.currentAmount) + dto.amount).toFixed(7));
      if (goal.currentAmount >= Number(goal.targetAmount)) {
        goal.status = SavingsGoalStatus.COMPLETED;
        goal.completedAt = new Date();
        this.eventEmitter.emit('savings.goal.completed', { goalId: goal.id, userId });
      }
      await this.goalRepo.save(goal);

      // Update contribution
      contribution.status = ContributionStatus.CONFIRMED;
      contribution.transactionHash = `simulated_${Date.now()}`;
      await this.contributionRepo.save(contribution);

      // Update transaction
      transaction.status = WalletTransactionStatus.CONFIRMED;
      transaction.balanceAfter = user.walletBalance;
      transaction.stellarTxHash = contribution.transactionHash;
      await this.transactionRepo.save(transaction);

      // Invalidate caches
      await this.invalidateGoalsCache(userId);
      await this.walletService.invalidateCache({ userId });

      this.eventEmitter.emit('savings.contribution.confirmed', {
        contributionId: contribution.id,
        goalId,
        userId,
        amount: dto.amount,
      });

      this.logger.log(`Contribution confirmed: ${contribution.id} for goal ${goalId}`);
    } catch (error) {
      // Mark as failed
      contribution.status = ContributionStatus.FAILED;
      contribution.failureReason = error instanceof Error ? error.message : 'Unknown error';
      await this.contributionRepo.save(contribution);

      transaction.status = WalletTransactionStatus.FAILED;
      transaction.failureReason = contribution.failureReason;
      await this.transactionRepo.save(transaction);

      this.logger.error(`Contribution failed: ${contribution.id}`, error as any);
      throw new BadRequestException('Failed to process contribution. Please try again.');
    }

    return this.mapContributionToResponse(contribution);
  }

  /**
   * Get contributions for a goal
   */
  async getContributions(userId: string, goalId: string): Promise<ContributionResponseDto[]> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId, userId } });
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }

    const contributions = await this.contributionRepo.find({
      where: { goalId },
      order: { createdAt: 'DESC' },
    });

    return contributions.map(c => this.mapContributionToResponse(c));
  }

  /**
   * Get overall savings summary
   */
  async getSavingsSummary(userId: string): Promise<{
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    totalTargetAmount: number;
    totalCurrentAmount: number;
    overallProgress: number;
    nextMilestone?: { goalId: string; title: string; amountNeeded: number; daysRemaining?: number };
  }> {
    const goals = await this.goalRepo.find({ where: { userId } });

    const totalGoals = goals.length;
    const activeGoals = goals.filter(g => g.status === SavingsGoalStatus.ACTIVE).length;
    const completedGoals = goals.filter(g => g.status === SavingsGoalStatus.COMPLETED).length;

    const totalTargetAmount = goals.reduce((sum, g) => sum + Number(g.targetAmount), 0);
    const totalCurrentAmount = goals.reduce((sum, g) => sum + Number(g.currentAmount), 0);
    const overallProgress = totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) * 100 : 0;

    // Find next milestone (active goal closest to completion)
    const activeGoalsList = goals
      .filter(g => g.status === SavingsGoalStatus.ACTIVE)
      .sort((a, b) => Number(b.currentAmount) / Number(b.targetAmount) - Number(a.currentAmount) / Number(a.targetAmount));

    let nextMilestone: { goalId: string; title: string; amountNeeded: number; daysRemaining?: number } | undefined;
    if (activeGoalsList.length > 0) {
      const next = activeGoalsList[0];
      nextMilestone = {
        goalId: next.id,
        title: next.title,
        amountNeeded: Number(next.targetAmount) - Number(next.currentAmount),
        daysRemaining: next.targetDate ? Math.ceil((next.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : undefined,
      };
    }

    return {
      totalGoals,
      activeGoals,
      completedGoals,
      totalTargetAmount,
      totalCurrentAmount,
      overallProgress: Math.round(overallProgress * 100) / 100,
      nextMilestone,
    };
  }

  /**
   * Process auto-contributions (called by scheduler)
   */
  async processAutoContributions(): Promise<{ processed: number; failed: number }> {
    const now = new Date();
    const goals = await this.goalRepo.find({
      where: {
        status: SavingsGoalStatus.ACTIVE,
        autoContributionAmount: MoreThanOrEqual(0.01),
      },
    });

    let processed = 0;
    let failed = 0;

    for (const goal of goals) {
      if (!goal.autoContributionAmount || !goal.autoContributionFrequency) continue;

      // Check if it's time for auto-contribution
      const lastContribution = await this.contributionRepo.findOne({
        where: { goalId: goal.id, status: ContributionStatus.CONFIRMED },
        order: { createdAt: 'DESC' },
      });

      const shouldContribute = this.shouldAutoContribute(goal, lastContribution, now);
      if (!shouldContribute) continue;

      try {
        await this.contribute(goal.userId, goal.id, { amount: goal.autoContributionAmount });
        processed++;
      } catch (error) {
        this.logger.error(`Auto-contribution failed for goal ${goal.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        failed++;
      }
    }

    return { processed, failed };
  }

  private shouldAutoContribute(goal: SavingsGoal, lastContribution: SavingsContribution | null, now: Date): boolean {
    if (!lastContribution) return true;

    const lastDate = lastContribution.createdAt;
    const diffMs = now.getTime() - lastDate.getTime();

    switch (goal.autoContributionFrequency) {
      case 'DAILY':
        return diffMs >= 24 * 60 * 60 * 1000;
      case 'WEEKLY':
        return diffMs >= 7 * 24 * 60 * 60 * 1000;
      case 'MONTHLY':
        // Check if we're in a new month
        return now.getMonth() !== lastDate.getMonth() || now.getFullYear() !== lastDate.getFullYear();
      default:
        return false;
    }
  }

  private mapGoalToResponse(goal: SavingsGoal): SavingsGoalResponseDto {
    const progressPercentage = Number(goal.targetAmount) > 0
      ? Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 10000) / 100
      : 0;

    let daysRemaining: number | undefined;
    if (goal.targetDate) {
      const diffMs = goal.targetDate.getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    let requiredContributionRate: number | undefined;
    if (daysRemaining && daysRemaining > 0 && goal.status === SavingsGoalStatus.ACTIVE) {
      const amountNeeded = Number(goal.targetAmount) - Number(goal.currentAmount);
      requiredContributionRate = Math.round((amountNeeded / daysRemaining) * 10000000) / 10000000; // daily rate
    }

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      progressPercentage,
      autoContributionAmount: goal.autoContributionAmount ? Number(goal.autoContributionAmount) : undefined,
      autoContributionFrequency: goal.autoContributionFrequency,
      targetDate: goal.targetDate,
      status: goal.status,
      completedAt: goal.completedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      daysRemaining,
      requiredContributionRate,
    };
  }

  private mapContributionToResponse(contribution: SavingsContribution): ContributionResponseDto {
    return {
      id: contribution.id,
      goalId: contribution.goalId,
      amount: Number(contribution.amount),
      status: contribution.status,
      transactionHash: contribution.transactionHash,
      failureReason: contribution.failureReason,
      createdAt: contribution.createdAt,
      updatedAt: contribution.updatedAt,
    };
  }

  private async invalidateGoalsCache(userId: string): Promise<void> {
    try {
      await this.cacheManager.del(`savings_goals:${userId}`);
      await this.cacheManager.del(`savings_summary:${userId}`);
    } catch {
      // Ignore cache errors
    }
  }
}