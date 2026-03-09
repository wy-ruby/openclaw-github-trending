/**
 * Repository information data model
 *
 * Represents a GitHub repository with its metadata and AI-generated summary.
 */
export interface RepositoryInfo {
  /** Repository name (e.g., "repo-name") */
  name: string;
  /** Full repository name with owner (e.g., "owner/repo-name") */
  full_name: string;
  /** GitHub repository URL */
  url: string;
  /** Number of stars */
  stars: number;
  /** Repository description */
  description: string;
  /** Primary programming language */
  language?: string;
  /** Number of forks */
  forks?: number;
  /** README content (optional) */
  readme_content?: string;
  /** AI-generated summary in Chinese (optional) */
  ai_summary?: string;
  /** ISO timestamp when the repository was first seen (optional) */
  first_seen?: string;
}