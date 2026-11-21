import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Role } from '@modules/auth/enums/role.enum';
import { HealthProgramEnrollment } from '../../entities/health-program-enrollment.entity';
import { HealthProgramEnrollmentHistory } from '../../entities/health-program-enrollment-history.entity';
import { UpdateEnrollmentStateDto } from './dto/update-enrollment-state.dto';
import { HealthProgramEnrollmentState as State } from './enums/health-program-enrollment-state.enum';

const VALID_TRANSITIONS: Record<State, readonly State[]> = {
  [State.PENDING]: [State.ELIGIBLE, State.INELIGIBLE],
  [State.ELIGIBLE]: [State.ENROLLED, State.INELIGIBLE],
  [State.INELIGIBLE]: [State.ELIGIBLE],
  [State.ENROLLED]: [State.WITHDRAWN],
  [State.WITHDRAWN]: [State.ELIGIBLE],
};

const USER_MANAGED_STATES = new Set<State>([State.ENROLLED, State.WITHDRAWN]);

@Injectable()
export class HealthProgramEnrollmentService {
  constructor(private readonly dataSource: DataSource) {}

  async listForUser(userId: string): Promise<HealthProgramEnrollment[]> {
    return this.dataSource.getRepository(HealthProgramEnrollment).find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getHistory(userId: string, programCode: string): Promise<HealthProgramEnrollmentHistory[]> {
    const code = this.normalizeProgramCode(programCode);
    return this.dataSource.getRepository(HealthProgramEnrollmentHistory).find({
      where: { userId, programCode: code },
      order: { changedAt: 'DESC' },
    });
  }

  async updateState(
    userId: string,
    programCode: string,
    actorId: string,
    actorRole: Role,
    dto: UpdateEnrollmentStateDto
  ): Promise<HealthProgramEnrollment> {
    const code = this.normalizeProgramCode(programCode);
    if (actorRole !== Role.ADMIN && !USER_MANAGED_STATES.has(dto.state)) {
      throw new ForbiddenException('Users may only enroll in or withdraw from a program');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const enrollmentRepository = manager.getRepository(HealthProgramEnrollment);
        const historyRepository = manager.getRepository(HealthProgramEnrollmentHistory);
        let enrollment = await enrollmentRepository.findOne({
          where: { userId, programCode: code },
        });

        if (!enrollment) {
          enrollment = enrollmentRepository.create({
            userId,
            programCode: code,
            state: State.PENDING,
          });
          enrollment = await enrollmentRepository.save(enrollment);
        }

        const previousState = enrollment.state;
        if (previousState === dto.state) {
          throw new ConflictException(`Enrollment is already ${dto.state}`);
        }
        if (!VALID_TRANSITIONS[previousState]?.includes(dto.state)) {
          throw new ConflictException(
            `Cannot transition enrollment from ${previousState} to ${dto.state}`
          );
        }

        const updatedAt = new Date();
        const result = await enrollmentRepository.update(
          { id: enrollment.id, state: previousState },
          { state: dto.state, updatedAt }
        );
        if (result.affected !== 1) {
          throw new ConflictException('Enrollment changed concurrently; retry the request');
        }

        const history = historyRepository.create({
          userId,
          programCode: code,
          previousState,
          newState: dto.state,
          changedBy: actorId,
          reason: dto.reason?.trim() || null,
        });
        await historyRepository.save(history);

        return { ...enrollment, state: dto.state, updatedAt };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Enrollment already exists; retry the request');
      }
      throw error;
    }
  }

  async getEnrollment(userId: string, programCode: string): Promise<HealthProgramEnrollment> {
    const enrollment = await this.dataSource.getRepository(HealthProgramEnrollment).findOne({
      where: { userId, programCode: this.normalizeProgramCode(programCode) },
    });
    if (!enrollment) {
      throw new NotFoundException('Health program enrollment not found');
    }
    return enrollment;
  }

  private normalizeProgramCode(programCode: string): string {
    const code = programCode?.trim().toUpperCase();
    if (!code || !/^[A-Z0-9][A-Z0-9_-]{0,99}$/.test(code)) {
      throw new BadRequestException(
        'Program code must be 1-100 letters, numbers, underscores, or hyphens'
      );
    }
    return code;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError: unknown = error.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505'
    );
  }
}
