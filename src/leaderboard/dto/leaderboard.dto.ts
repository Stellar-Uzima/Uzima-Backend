export class LeaderboardEntryDto {
  rank: number;
  userId: string;
  displayName: string;
  totalXlm: number;
  country: string;
}

export class LeaderboardResponseDto {
  topRankings: LeaderboardEntryDto[];
  myRank: {
    rank: number | null;
    totalXlm: number;
  };
}
