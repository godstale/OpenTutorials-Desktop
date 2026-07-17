import { invoke } from "@tauri-apps/api/core";
import type { DbResult } from "@/lib/db/client";
import type { TocNode } from "@/lib/types/course";

export interface BundlePreview {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  target_age: string;
  license: string;
  author: { nickname: string; email?: string; website?: string };
  card_count: number;
  toc: TocNode[];
  has_thumbnail: boolean;
}

async function fileToBase64(file: File | Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Dry-run validation against the Bundler Protocol — no disk/db writes. */
export async function validateCourseBundle(file: File | Blob): Promise<DbResult<BundlePreview>> {
  const fileDataBase64 = await fileToBase64(file);
  return invoke<DbResult<BundlePreview>>("validate_course_bundle", { fileDataBase64 });
}

/** Validates again, then extracts the bundle and upserts course_packages/course_wiki. */
export async function importCourseBundle(file: File | Blob, source: string = "LOCAL"): Promise<DbResult<any>> {
  const fileDataBase64 = await fileToBase64(file);
  return invoke<DbResult<any>>("import_course_bundle", { fileDataBase64, source });
}
