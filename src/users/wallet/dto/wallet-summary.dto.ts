import { ApiProperty } from '@nestjs/swagger';

export class WalletSummaryDto {
  @ApiProperty({
    description: 'The user\'s Stellar wallet address',
    example: 'GABCDE...',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Current XLM balance from Stellar network',
    example: '12.50',
  })
  liveBalance: string;

  @ApiProperty({
    description: 'Total XLM earned from completed tasks',
    example: '18.00',
  })
  totalEarnedFromTasks: string;

  @ApiProperty({
    description: 'Total XLM spent on completed consultations',
    example: '3.00',
  })
  totalSpentOnConsultations: string;

  @ApiProperty({
    description: 'Pending XLM rewards not yet sent',
    example: '2.50',
  })
  pendingRewards: string;

  @ApiProperty({
    description: 'Current XLM to USD exchange rate',
    example: 0.12,
  })
  xlmUsdRate: number;

  @ApiProperty({
    description: 'Live balance converted to USD',
    example: '1.50',
  })
  balanceUsd: string;

  @ApiProperty({
    description: 'Whether the user has linked a wallet',
    example: true,
  })
  walletLinked: boolean;
}