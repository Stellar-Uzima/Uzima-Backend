import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  const makeRepo = () => ({ create: jest.fn(), save: jest.fn(), findOne: jest.fn() });
  const mockRepo = makeRepo();
  const mockQueueService = { addDelayedJob: jest.fn() } as any;

  beforeEach(() => {
    // @ts-ignore
    service = new ConsultationsService(mockRepo as any, mockQueueService);
    jest.clearAllMocks();
  });

  it('schedules a consultation and enqueues a reminder job', async () => {
    const userId = 'user-1';
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const created = { id: 'c1', userId, scheduledAt };

    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue(created);

    const result = await service.schedule(userId, scheduledAt);

    expect(mockRepo.create).toHaveBeenCalledWith({ userId, scheduledAt });
    expect(mockRepo.save).toHaveBeenCalledWith(created);
    expect(mockQueueService.addDelayedJob).toHaveBeenCalledTimes(1);

    const [[queueName, jobName, data, delay]] = mockQueueService.addDelayedJob.mock.calls;
    expect(data.userId).toBe(userId);
    expect(data.consultationId).toBe(created.id);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(result).toEqual(created);
  });

  it('cancels a consultation', async () => {
    const consultation = { id: 'c1', cancelled: false };
    mockRepo.findOne.mockResolvedValue(consultation);
    mockRepo.save.mockResolvedValue({ ...consultation, cancelled: true });

    const res = await service.cancel('c1');
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(mockRepo.save).toHaveBeenCalled();
    expect(res.cancelled).toBe(true);
  });
});
