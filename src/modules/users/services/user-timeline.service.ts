import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { User } from '../../../entities/user.entity';
import {
  UserActivity,
  ActivityType,
} from '../../../database/entities/user-activity.entity';
import { TaskCompletion, TaskCompletionStatus } from '../../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../../../rewards/enums/reward-status.enum';
import { ReferralRecord } from '../../../referral/entities/referral-record.entity';
import { Coupon } from '../../../coupons/entities/coupon.entity';
import {
  UserTimelineEntryDto,
  UserTimelineEventType,
  UserTimelineQueryDto,
  UserTimelineResponseDto,
} from '../dto/user-timeline.dto';

type TimelineFilterOptions = {
  from?: Date;
  to?: Date;
  eventTypes?: UserTimelineEventType[];
};

@Injectable()
export class UserTimelineService {
  private readonly logger = new Logger(UserTimelineService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserActivity)
    private readonly activityRepo: Repository<UserActivity>,
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(ReferralRecord)
    private readonly referralRepo: Repository<ReferralRecord>,
    @InjectRepository(Coupon)
    private readonly couponRepo: Repository<Coupon>,
  ) {}

  async getTimeline(
    userId: string,
    query: UserTimelineQueryDto,
  ): Promise<UserTimelineResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const eventTypes = query.eventTypes;

    const entries = await this.collectTimelineEntries(userId, {
      from,
      to,
      eventTypes,
    });

    const total = entries.length;
    const start = (page - 1) * limit;
    const paged = entries.slice(start, start + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      data: paged,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      filteredEventTypes: eventTypes,
    };
  }

  private async collectTimelineEntries(
    userId: string,
    filters: TimelineFilterOptions,
  ): Promise<UserTimelineEntryDto[]> {
    const { from, to, eventTypes } = filters;
    const wanted = new Set<UserTimelineEventType>(eventTypes ?? Object.values(UserTimelineEventType));

    const tasks: Promise<UserTimelineEntryDto[]>[] = [];

    if (this.wantsAny(wanted, [
      UserTimelineEventType.LOGIN,
      UserTimelineEventType.LOGOUT,
      UserTimelineEventType.PROFILE_UPDATE,
      UserTimelineEventType.AVATAR_UPDATED,
      UserTimelineEventType.TASK_CREATED,
      UserTimelineEventType.TASK_COMPLETED,
    ])) {
      tasks.push(this.fetchUserActivityEvents(userId, { from, to }, wanted));
    }

    if (this.wantsAny(wanted, [
      UserTimelineEventType.TASK_COMPLETED,
    ])) {
      tasks.push(this.fetchTaskCompletionEvents(userId, { from, to }, wanted));
    }

    if (this.wantsAny(wanted, [
      UserTimelineEventType.REWARD_EARNED,
      UserTimelineEventType.REWARD_FAILED,
      UserTimelineEventType.WALLET_DEPOSIT,
    ])) {
      tasks.push(this.fetchRewardEvents(userId, { from, to }, wanted));
    }

    if (this.wantsAny(wanted, [
      UserTimelineEventType.REFERRAL_MADE,
      UserTimelineEventType.REFERRAL_REDEEMED,
    ])) {
      tasks.push(this.fetchReferralEvents(userId, { from, to }, wanted));
    }

    if (wanted.has(UserTimelineEventType.BADGE_EARNED)) {
      tasks.push(this.fetchBadgeEvents(userId, { from, to }, wanted));
    }

    if (wanted.has(UserTimelineEventType.EMAIL_VERIFIED)) {
      tasks.push(this.fetchEmailVerifiedEvent(userId, wanted));
    }

    const results = await Promise.all(tasks);
    const merged = results.flat();
    merged.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const deduped = new Map<string, UserTimelineEntryDto>();
    for (const entry of merged) deduped.set(entry.id, entry);
    return Array.from(deduped.values());
  }

  private wantsAny(
    wanted: Set<UserTimelineEventType>,
    events: UserTimelineEventType[],
  ): boolean {
    return events.some((e) => wanted.has(e));
  }

  private inRange(ts: Date, from?: Date, to?: Date): boolean {
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
  }

  private async fetchUserActivityEvents(
    userId: string,
    range: { from?: Date; to?: Date },
    wanted: Set<UserTimelineEventType>,
  ): Promise<UserTimelineEntryDto[]> {
    const where: Record<string, unknown> = { userId };
    if (range.from || range.to) {
      if (range.from && range.to) {
        where.createdAt = Between(range.from, range.to);
      } else if (range.from) {
        where.createdAt = MoreThanOrEqual(range.from);
      } else {
        where.createdAt = LessThanOrEqual(range.to as Date);
      }
    }

    const activities = await this.activityRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 500,
    });

    const mapping: Partial<Record<ActivityType, UserTimelineEventType>> = {
      [ActivityType.LOGIN]: UserTimelineEventType.LOGIN,
      [ActivityType.LOGOUT]: UserTimelineEventType.LOGOUT,
      [ActivityType.PROFILE_UPDATE]: UserTimelineEventType.PROFILE_UPDATE,
      [ActivityType.AVATAR_UPDATED]: UserTimelineEventType.AVATAR_UPDATED,
      [ActivityType.TASK_CREATED]: UserTimelineEventType.TASK_CREATED,
      [ActivityType.TASK_COMPLETED]: UserTimelineEventType.TASK_COMPLETED,
    };

    return activities
      .map((a) => {
        const type = mapping[a.activityType];
        if (!type || !wanted.has(type)) return null;
        return {
          id: `activity-${a.id}`,
          type,
          title: a.description ?? this.defaultTitle(type),
          description: a.description,
          occurredAt: a.createdAt,
          metadata: {
            ...(a.metadata ?? {}),
            ipAddress: a.ipAddress,
            userAgent: a.userAgent,
          },
        } as UserTimelineEntryDto;
      })
      .filter((v): v is UserTimelineEntryDto => !!v);
  }

  private async fetchTaskCompletionEvents(
    userId: string,
    range: { from?: Date; to?: Date },
    wanted: Set<UserTimelineEventType>,
  ): Promise<UserTimelineEntryDto[]> {
    if (!wanted.has(UserTimelineEventType.TASK_COMPLETED)) return [];

    const where: Record<string, unknown> = { userId, status: TaskCompletionStatus.VERIFIED };
    if (range.from || range.to) {
      if (range.from && range.to) {
        (where as any).completedAt = Between(range.from, range.to);
      } else if (range.from) {
        (where as any).completedAt = MoreThanOrEqual(range.from);
      } else {
        (where as any).completedAt = LessThanOrEqual(range.to as Date);
      }
    }

    const completions = await this.completionRepo.find({
      where,
      relations: ['task'],
      order: { completedAt: 'DESC' },
      take: 500,
    });

    return completions.map((c) => ({
      id: `completion-${c.id}`,
      type: UserTimelineEventType.TASK_COMPLETED,
      title: c.task?.title ?? 'Task completed',
      description: c.task?.description ?? undefined,
      occurredAt: c.completedAt ?? c.createdAt,
      metadata: {
        taskId: c.task?.id,
        xlmRewarded: Number(c.xlmRewarded ?? 0),
        status: c.status,
      },
    }));
  }

  private async fetchRewardEvents(
    userId: string,
    range: { from?: Date; to?: Date },
    wanted: Set<UserTimelineEventType>,
  ): Promise<UserTimelineEntryDto[]> {
    const where: Record<string, unknown> = { userId };
    if (range.from || range.to) {
      if (range.from && range.to) {
        where.createdAt = Between(range.from, range.to);
      } else if (range.from) {
        where.createdAt = MoreThanOrEqual(range.from);
      } else {
        where.createdAt = LessThanOrEqual(range.to as Date);
      }
    }

    const rewards = await this.rewardRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 500,
    });

    return rewards
      .map((r) => {
        let type: UserTimelineEventType | null = null;
        if (r.status === RewardStatus.SUCCESS && wanted.has(UserTimelineEventType.REWARD_EARNED)) {
          type = UserTimelineEventType.REWARD_EARNED;
        } else if (r.status === RewardStatus.FAILED && wanted.has(UserTimelineEventType.REWARD_FAILED)) {
          type = UserTimelineEventType.REWARD_FAILED;
        } else if (r.status === RewardStatus.SUCCESS && wanted.has(UserTimelineEventType.WALLET_DEPOSIT)) {
          type = UserTimelineEventType.WALLET_DEPOSIT;
        }
        if (!type) return null;
        return {
          id: `reward-${r.id}`,
          type,
          title:
            type === UserTimelineEventType.REWARD_EARNED
              ? 'Reward earned'
              : type === UserTimelineEventType.REWARD_FAILED
                ? 'Reward failed'
                : 'Wallet deposit',
          description:
            type === UserTimelineEventType.REWARD_FAILED
              ? `Reward payment failed after ${r.attempts} attempt(s)`
              : undefined,
          occurredAt: r.createdAt,
          metadata: {
            amount: Number(r.amount),
            status: r.status,
            stellarTxHash: r.stellarTxHash,
            attempts: r.attempts,
            taskCompletionId: r.taskCompletionId,
          },
        } as UserTimelineEntryDto;
      })
      .filter((v): v is UserTimelineEntryDto => !!v);
  }

  private async fetchReferralEvents(
    userId: string,
    range: { from?: Date; to?: Date },
    wanted: Set<UserTimelineEventType>,
  ): Promise<UserTimelineEntryDto[]> {
    const [asReferrer, asReferred] = await Promise.all([
      wanted.has(UserTimelineEventType.REFERRAL_MADE)
        ? this.referralRepo.find({
            where: { referrer: { id: userId } },
            relations: ['referred'],
            order: { createdAt: 'DESC' },
            take: 500,
          })
        : Promise.resolve([]),
      wanted.has(UserTimelineEventType.REFERRAL_REDEEMED)
        ? this.referralRepo.find({
            where: { referred: { id: userId } },
            relations: ['referrer'],
            order: { createdAt: 'DESC' },
            take: 500,
          })
        : Promise.resolve([]),
    ]);

    const out: UserTimelineEntryDto[] = [];

    for (const rec of asReferrer) {
      if (!this.inRange(rec.createdAt, range.from, range.to)) continue;
      out.push({
        id: `referral-made-${rec.id}`,
        type: UserTimelineEventType.REFERRAL_MADE,
        title: 'Referral joined',
        description: rec.referred
          ? `${rec.referred.firstName ?? ''} ${rec.referred.lastName ?? ''}`.trim() ||
            rec.referred.email ||
            undefined
          : undefined,
        occurredAt: rec.createdAt,
        metadata: {
          referredUserId: rec.referred?.id,
          rewardPaid: rec.rewardPaid,
          rewardPaidAt: rec.rewardPaidAt,
        },
      });
    }

    for (const rec of asReferred) {
      if (!this.inRange(rec.createdAt, range.from, range.to)) continue;
      out.push({
        id: `referral-redeemed-${rec.id}`,
        type: UserTimelineEventType.REFERRAL_REDEEMED,
        title: 'Redeemed referral code',
        description: rec.referrer
          ? `${rec.referrer.firstName ?? ''} ${rec.referrer.lastName ?? ''}`.trim() ||
            rec.referrer.email ||
            undefined
          : undefined,
        occurredAt: rec.createdAt,
        metadata: {
          referrerUserId: rec.referrer?.id,
        },
      });
    }

    return out;
  }

  private async fetchBadgeEvents(
    userId: string,
    range: { from?: Date; to?: Date },
    _wanted: Set<UserTimelineEventType>,
  ): Promise<UserTimelineEntryDto[]> {
    const coupons = await this.couponRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 500,
    });

    return coupons
      .filter((c) => this.inRange(c.createdAt, range.from, range.to))
      .map((c) => ({
        id: `badge-${c.id}`,
        type: UserTimelineEventType.BADGE_EARNED,
        title: 'Milestone badge earned',
        description: c.specialistType
          ? `Unlocked ${c.discount}% discount for ${c.specialistType}`
          : `Unlocked ${c.discount}% milestone discount`,
        occurredAt: c.createdAt,
        metadata: {
          couponCode: c.code,
          discount: c.discount,
          specialistType: c.specialistType,
          expiresAt: (c as any).expiresAt,
        },
      }));
  }

  private async fetchEmailVerifiedEvent(
    userId: string,
    _wanted: Set<UserTimelineEventType>,
  ): Promise<UserTimelineEntryDto[]> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'isVerified', 'emailVerificationExpiry', 'createdAt'],
    });
    if (!user || !user.isVerified) return [];
    const occurredAt = user.emailVerificationExpiry
      ? new Date(user.emailVerificationExpiry.getTime() - 3_600_000)
      : user.createdAt;
    return [
      {
        id: `email-verified-${userId}`,
        type: UserTimelineEventType.EMAIL_VERIFIED,
        title: 'Email verified',
        description: 'User email address was successfully verified',
        occurredAt,
        metadata: {},
      },
    ];
  }

  private defaultTitle(type: UserTimelineEventType): string {
    switch (type) {
      case UserTimelineEventType.LOGIN:
        return 'User logged in';
      case UserTimelineEventType.LOGOUT:
        return 'User logged out';
      case UserTimelineEventType.PROFILE_UPDATE:
        return 'Profile updated';
      case UserTimelineEventType.AVATAR_UPDATED:
        return 'Avatar updated';
      case UserTimelineEventType.TASK_CREATED:
        return 'Task created';
      case UserTimelineEventType.TASK_COMPLETED:
        return 'Task completed';
      default:
        return 'Activity';
    }
  }
}
