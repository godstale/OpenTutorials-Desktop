import type { TocNode } from "@/lib/types/course";

export function countChapters(toc?: TocNode[] | null): number {
  if (!toc) return 0;
  return toc.filter((node) => node.type === "chapter").length;
}

export function formatTargetAge(targetAge: string, language: string): string {
  if (targetAge === "all") return language === "en" ? "All Ages" : "전연령";
  return language === "en" ? `${targetAge} years old` : `${targetAge}세`;
}

export function isVersionNewer(local: string, online: string): boolean {
  if (!local || !online) return false;
  const parseVersion = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const localParts = parseVersion(local);
  const onlineParts = parseVersion(online);
  for (let i = 0; i < Math.max(localParts.length, onlineParts.length); i++) {
    const l = localParts[i] || 0;
    const o = onlineParts[i] || 0;
    if (o > l) return true;
    if (l > o) return false;
  }
  return false;
}

function countLeaves(node: TocNode): number {
  if (!node.children || node.children.length === 0) {
    return node.filename ? 1 : 0;
  }
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function countCardsFromToc(toc?: TocNode[] | null): number {
  if (!toc) return 0;
  return toc.reduce((sum, node) => sum + countLeaves(node), 0);
}

/**
 * currentCardPosition은 last_card/max_card(카드 배열 내 1-based 진행 위치)를 그대로 받는다.
 * 각 챕터가 포함하는 리프 카드 수의 누적합 구간에 현재 위치가 속한 챕터를 찾아 x/y 챕터로 환산한다.
 */
export function getChapterProgress(toc: TocNode[] | undefined | null, currentCardPosition: number): { current: number; total: number } | null {
  if (!toc) return null;
  const chapters = toc.filter((node) => node.type === "chapter");
  const total = chapters.length;
  if (total === 0) return null;

  let cumulative = 0;
  for (let i = 0; i < chapters.length; i++) {
    cumulative += countLeaves(chapters[i]);
    if (currentCardPosition <= cumulative) {
      return { current: i + 1, total };
    }
  }
  return { current: total, total };
}
