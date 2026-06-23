export interface UniojStudent {
  username: string;
  displayName: string;
  pdfUrl: string;
}

export interface UniojStats {
  thisWeekCount: number;
  thisWeekDiff: number;
  activeDaysCount: number;
  bestDayCount: number;
  totalSolved: number;
  currentLevel: string;
  currentLevelName: string;
  totalPoints: number;
  acRate: number;
  totalSubmissions: number;
  startedAt: string;
}

export interface UniojDailyProgress {
  date: string;
  solvedCumulative: number;
  solvedDaily: number;
}

export interface UniojRoadmapLevel {
  levelCode: number;
  levelName: string;
  progress: number;
  solvedCount: number;
  totalCount: number;
  contestsCount: number;
  modulesCount: number;
}

export interface UniojRoadmapModule {
  levelCode: number;
  levelName: string;
  moduleName: string;
  solvedCount: number;
  totalCount: number;
  progress: number;
  status: string;
}

export interface UniojReportDto {
  student: UniojStudent;
  stats: UniojStats;
  dailyProgress: UniojDailyProgress[];
  roadmapLevels: UniojRoadmapLevel[];
  roadmapModules: UniojRoadmapModule[];
}
