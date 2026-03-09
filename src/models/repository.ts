/**
 * Repository information data model
 */
export interface RepositoryInfo {
  name: string;
  full_name: string;
  url: string;
  stars: number;
  description: string;
  readme_content?: string;
  ai_summary?: string;
  first_seen?: string;
}