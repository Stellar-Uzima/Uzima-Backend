import { IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { CustomValidationPipe } from './validation.pipe';

class IncomingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count!: number;

  @IsString()
  name!: string;
}

const bodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: IncomingDto,
  data: '',
};

describe('CustomValidationPipe', () => {
  let pipe: CustomValidationPipe;

  beforeEach(() => {
    pipe = new CustomValidationPipe();
  });

  it('transforms values and returns a validated DTO instance', async () => {
    const result = await pipe.transform(
      { count: '3', name: 'Ada' },
      bodyMetadata,
    );

    expect(result).toBeInstanceOf(IncomingDto);
    expect(result.count).toBe(3);
  });

  it('rejects invalid DTO fields before the controller receives them', async () => {
    await expect(
      pipe.transform({ count: 'not-a-number', name: 'Ada' }, bodyMetadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown properties instead of silently stripping them', async () => {
    let exception: BadRequestException | undefined;
    try {
      await pipe.transform(
        { count: 3, name: 'Ada', isAdmin: true },
        bodyMetadata,
      );
    } catch (error) {
      exception = error as BadRequestException;
    }

    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception?.getResponse()).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      errors: {
        isAdmin: expect.arrayContaining([
          expect.stringContaining('should not exist'),
        ]),
      },
    });
  });
});
