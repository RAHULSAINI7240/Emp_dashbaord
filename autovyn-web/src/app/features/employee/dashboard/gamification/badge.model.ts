export interface Badge {
  id: string;
  title: string;
  icon: string;
  description: string;
  unlocked: boolean;
  progressPercent: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  badges: number;
}

export interface BadgeEvaluationInput {
  aiEfficiency: number;
  workStreakDays: number;
  punctualityRate: number;
  productivityBoost: number;
  leaderboardRank: number;
}
