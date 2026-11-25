import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role } from '@modules/auth/enums/role.enum';
import { UpdateEnrollmentStatusDto } from './dto/update-enrollment-status.dto';
import {
  HealthProgramEnrollment,
  HealthProgramEnrollmentHistory,
  HealthProgramEnrollmentStatus,
} from './entities/health-program-enrollment.entity';

const VALID_TRANSITIONS: Record<
  HealthProgramEnrollmentStatus,
  readonly HealthProgramEnrollmentStatus[]
> = {
  [HealthProgramEnrollmentStatus.PENDING]: [
    HealthProgramEnrollmentStatus.ELIGIBLE,
    HealthProgramEnrollmentStatus.INELIGIBLE,
  ],
  [HealthProgramEnrollmentStatus.INELIGIBLE]: [HealthProgramEnrollmentStatus.ELIGIBLE],
  [HealthProgramEnrollmentStatus.ELIGIBLE]: [
    HealthProgramEnrollmentStatus.INELIGIBLE,
    HealthProgramEnrollmentStatus.ENROLLED,
  ],
  [HealthProgramEnrollmentStatus.ENROLLED]: [
    HealthProgramEnrollmentStatus.INELIGIBLE,
    HealthProgramEnrollmentStatus.WITHDRAWN,
  ],
  [HealthProgramEnrollmentStatus.WITHDRAWN]: [HealthProgramEnrollmentStatus.ELIGIBLE],
};

const SELF_SERVICE_TRANSITIONS: readonly HealthProgramEnrollmentStatus[] = [
  HealthProgramEnrollmentStatus.ENROLLED,
  HealthProgramEnrollmentStatus.WITHDRAWN,
];

@Injectable()
export class HealthProgramEnrollmentService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getEnrollment(
    userId: string,
    actorId: string,
    actorRole: Role
  ): Promise<
    | HealthProgramEnrollment
    | {
        userId: string;
        status: HealthProgramEnrollmentStatus.PENDING;
        createdAt: null;
        updatedAt: null;
      }
  > {
    this.assertCanAccess(userId, actorId, actorRole);

    const enrollment = await this.dataSource
      .getRepository(HealthProgramEnrollment)
      .findOne({ where: { userId } });

    return (
      enrollment ?? {
        userId,
        status: HealthProgramEnrollmentStatus.PENDING,
        createdAt: null,
        updatedAt: null,
      }
    );
  }

  async getHistory(
    userId: string,
    actorId: string,
    actorRole: Role
  ): Promise<HealthProgramEnrollmentHistory[]> {
    this.assertCanAccess(userId, actorId, actorRole);

    return this.dataSource.getRepository(HealthProgramEnrollmentHistory).find({
      where: { userId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  async updateStatus(
    userId: string,
    actorId: string,
    actorRole: Role,
    dto: UpdateEnrollmentStatusDto
  ): Promise<HealthProgramEnrollment> {
    const isStaff = actorRole === Role.ADMIN || actorRole === Role.HEALER;
    if (!isStaff && actorId !== userId) {
      throw new ForbiddenException('You can only update your own enrollment');
    }
    if (!isStaff && !SELF_SERVICE_TRANSITIONS.includes(dto.status)) {
      throw new ForbiddenException('Only health program staff can update eligibility');
    }

    return this.dataSource.transaction(async (manager) => {
      const users: unknown = await manager.query(
        'SELECT "id" FROM "users" WHERE "id" = $1 AND "deleted_at" IS NULL FOR UPDATE',
        [userId]
      );
      if (!Array.isArray(users) || users.length === 0) {
        throw new NotFoundException('User not found');
      }

      const enrollments = manager.getRepository(HealthProgramEnrollment);
      const enrollment = await enrollments.findOne({ where: { userId } });
      const fromStatus = enrollment?.status ?? HealthProgramEnrollmentStatus.PENDING;

      if (!VALID_TRANSITIONS[fromStatus].includes(dto.status)) {
        throw new BadRequestException(
          `Invalid enrollment transition: ${fromStatus} -> ${dto.status}`
        );
      }

      const updatedEnrollment = await enrollments.save(
        enrollment
          ? { ...enrollment, status: dto.status }
          : enrollments.create({ userId, status: dto.status })
      );

      await manager.getRepository(HealthProgramEnrollmentHistory).save({
        userId,
        fromStatus,
        toStatus: dto.status,
        changedById: actorId,
        reason: dto.reason ?? null,
      });

      return updatedEnrollment;
    });
  }

  private assertCanAccess(userId: string, actorId: string, actorRole: Role): void {
    if (actorId !== userId && actorRole !== Role.ADMIN && actorRole !== Role.HEALER) {
      throw new ForbiddenException('You can only view your own enrollment history');
    }
  }
}
