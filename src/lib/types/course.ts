export type TocNodeType = "chapter" | "section" | "subsection";

export interface TocNode {
  type: TocNodeType;
  title: string;
  description: string;
  filename?: string;
  children?: TocNode[];
}

export interface CoursePackage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  published: boolean;
  sequential_play?: boolean;
  force_checkpoint?: boolean;
  version?: string;
  changelog?: string;
  target_age?: string | null;
  category?: string | null;
  tags?: string[];
  author_id?: string | null;
  author_nickname?: string | null;
  author_email?: string;
  author_homepage?: string;
  toc?: TocNode[];
  cards?: string[];
  license?: string;
  license_file?: string;
  bundler_protocol_version?: string;
  source?: string;
  agent_id?: string | null;
  created_at?: string;
}

export interface UserProgress {
  id?: string;
  user_id: string;
  course_id: string;
  last_card: number;
  max_card?: number;
  completed: boolean;
  updated_at?: string;
}

export interface VideoInfo {
  provider: string;
  video_id: string;
  duration_seconds?: number;
  subtitles?: Array<{ start: number; end: number; text: string }>;
}

export interface LearnCard {
  filename: string;
  title: string;
  type: "markdown" | "video";
  content: string | null;
  videoInfo: VideoInfo | null;
}
