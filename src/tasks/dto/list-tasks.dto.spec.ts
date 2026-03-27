import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListTasksDto } from './list-tasks.dto';

describe('ListTasksDto', () => {
  it('should set defaults page=1 and limit=20 when omitted', () => {
    const dto = plainToInstance(ListTasksDto, {});
    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('should reject page less than 1 and limit less than 1', () => {
    const dto = plainToInstance(ListTasksDto, { page: 0, limit: 0 });
    const errors = validateSync(dto);

    expect(errors.some((e) => e.property === 'page')).toBe(true);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('should reject limit greater than 100', () => {
    const dto = plainToInstance(ListTasksDto, { page: 1, limit: 99999 });
    const errors = validateSync(dto);

    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
