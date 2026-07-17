import { Bot, User, Download, BookOpenCheck, ArrowRight, Trash2, Loader2 } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CourseIcon } from "@/components/ui/course-icon";
import { useLanguage } from "@/lib/context/LanguageContext";
import type { TranslationKeys } from "@/lib/locales/ko";
import { formatTargetAge } from "@/lib/utils/course";
import { cn } from "@/lib/utils";

export interface CourseCardChapterStatus {
  current: number;
  total: number;
}

export type CourseCardFooterAction =
  | { kind: "install"; onClick: () => void; loading?: boolean; disabled?: boolean }
  | { kind: "enroll"; onClick: () => void; loading?: boolean; disabled?: boolean }
  | { kind: "learn"; onClick: () => void }
  | { kind: "delete"; onClick: () => void; loading?: boolean };

export interface CourseCardProps {
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  category?: string | null;
  agentName?: string | null;
  author?: string | null;
  chapterStatus?: CourseCardChapterStatus | null;
  progressPercent?: number | null;
  totalChapters?: number | null;
  totalCards?: number | null;
  license?: string | null;
  targetAge?: string | null;
  enrollmentStatus?: "enrolled" | "completed" | null;
  onCardClick?: () => void;
  footerAction: CourseCardFooterAction;
  className?: string;
}

function FooterActionButton({ action, t }: { action: CourseCardFooterAction; t: (key: TranslationKeys) => string }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  switch (action.kind) {
    case "install":
      return (
        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={action.disabled || action.loading} onClick={(e) => { stop(e); action.onClick(); }}>
          {action.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          <span>{t("btnInstall")}</span>
        </Button>
      );
    case "enroll":
      return (
        <Button
          size="sm"
          className="h-8 text-white bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 gap-1.5"
          disabled={action.disabled || action.loading}
          onClick={(e) => { stop(e); action.onClick(); }}
        >
          {action.loading ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          <span>{t("btnEnroll")}</span>
        </Button>
      );
    case "learn":
      return (
        <Button
          size="sm"
          className="h-8 text-white bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 gap-1.5"
          onClick={(e) => { stop(e); action.onClick(); }}
        >
          <BookOpenCheck className="size-3.5" />
          <span>{t("btnLearn")}</span>
        </Button>
      );
    case "delete":
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={action.loading}
          onClick={(e) => { stop(e); action.onClick(); }}
        >
          {action.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          <span>{t("lblDelete")}</span>
        </Button>
      );
  }
}

export function CourseCard({
  title,
  description,
  thumbnail,
  category,
  agentName,
  author,
  chapterStatus,
  progressPercent,
  totalChapters,
  totalCards,
  license,
  targetAge,
  enrollmentStatus,
  onCardClick,
  footerAction,
  className,
}: CourseCardProps) {
  const { t, language } = useLanguage();

  const metaText = [
    totalChapters != null ? (language === "en" ? `${totalChapters} ch` : `챕터 ${totalChapters}`) : null,
    totalCards != null ? (language === "en" ? `${totalCards} cards` : `카드 ${totalCards}`) : null,
    license || null,
    targetAge ? formatTargetAge(targetAge, language) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const enrollmentLabel = enrollmentStatus === "enrolled" ? t("statusEnrolled") : enrollmentStatus === "completed" ? t("completed") : "";

  return (
    <Card className={cn("overflow-hidden flex flex-col hover:border-primary/50 transition-all duration-300 bg-white py-0 pb-0", className)}>
      <div
        className={cn("flex-1 flex flex-col", onCardClick && "cursor-pointer hover:opacity-95 transition-opacity")}
        onClick={onCardClick}
      >
        <div className="h-32 relative overflow-hidden shrink-0">
          <CourseIcon thumbnail={thumbnail} className="w-full h-full" iconClassName="w-10 h-10" alt={title} />
          <div className="absolute top-2.5 left-2.5">
            {category && (
              <Badge variant="outline" className="bg-white/90 backdrop-blur-sm text-xs shadow-sm">
                {category}
              </Badge>
            )}
          </div>
          <div className="absolute top-2.5 right-2.5">
            {agentName && (
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-xs gap-1 shadow-sm">
                <Bot className="size-3 shrink-0" />
                <span className="truncate max-w-[100px]">{agentName}</span>
              </Badge>
            )}
          </div>
        </div>

        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-base line-clamp-1">{title}</CardTitle>
          <CardDescription className="line-clamp-1 text-xs">{description}</CardDescription>
        </CardHeader>

        <CardContent className="flex-1 pt-1 space-y-2.5 flex flex-col justify-end">
          {(author || chapterStatus) && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
              {author ? (
                <div className="flex items-center gap-1 min-w-0">
                  <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{author}</span>
                </div>
              ) : (
                <span />
              )}
              {chapterStatus && (
                <span className="shrink-0 font-medium text-zinc-500">
                  {chapterStatus.current} / {chapterStatus.total} {t("unitChapter")}
                </span>
              )}
            </div>
          )}

          {progressPercent != null && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>{t("learningProgress")}</span>
                <span className="text-primary">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
            </div>
          )}

          {metaText && <div className="text-[11px] text-zinc-400">{metaText}</div>}
        </CardContent>
      </div>

      <CardFooter className="pt-3 pb-3 border-t bg-muted/10 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground truncate">{enrollmentLabel}</span>
        <FooterActionButton action={footerAction} t={t} />
      </CardFooter>
    </Card>
  );
}
