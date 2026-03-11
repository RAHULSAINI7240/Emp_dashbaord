export interface ProductivityAttendanceLog {
  date: string;
  workMinutes: number;
  lateByMinutes: number;
  workMode: 'OFFICE' | 'HOME';
  punchIn?: string;
  punchOut?: string;
}

export interface KpiTrendMetric {
  id: string;
  label: string;
  icon: string;
  value: number;
  suffix: string;
  decimals?: number;
  changePercent: number;
}

export interface AiEfficiencySnapshot {
  acceptedCount: number;
  rejectedCount: number;
  acceptedPercent: number;
  rejectedPercent: number;
  efficiency: number;
  efficiencyDelta: number;
  estimatedTimeSavedHours: number;
  productivityBoostPercent: number;
  aiUsageRate: number;
  insightMessage: string;
  weeklyEfficiency: number[];
}

export interface FocusSnapshot {
  focusScore: number;
  longestContinuousSessionMinutes: number;
  contextSwitches: number;
  distractionPercent: number;
  trendDelta: number;
  weeklyFocusScores: number[];
}

export interface PredictionSnapshot {
  projectedHours: number;
  expectedProductivityScore: number;
  predictedRank: number;
  paceMessage: string;
}

export interface HeatmapCell {
  date: string;
  day: number;
  hours: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  isCurrentMonth: boolean;
}

export interface InsightCard {
  id: string;
  title: string;
  message: string;
  tone: 'positive' | 'neutral' | 'caution';
}
