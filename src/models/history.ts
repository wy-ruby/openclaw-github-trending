/**
 * History data structure for caching processed repositories
 */
export interface HistoryProject {
  full_name: string;
  url: string;
  stars: number;
  ai_summary: string;
  first_seen: string;
}

export interface HistoryData {
  projects: {
    [full_name: string]: HistoryProject;
  };
}