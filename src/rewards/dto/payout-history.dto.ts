export class GetPayoutHistoryDto {
  page?: number = 1;
  limit?: number = 10;
  startDate?: string;
  endDate?: string;
  status?: 'pending' | 'completed' | 'failed';
}

export class PayoutHistoryResponseDto {
  id: string;
  amount: string;
  date: Date;
  transactionHash: string;
  status: string;
}

export class PaginatedPayoutHistoryDto {
  data: PayoutHistoryResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
