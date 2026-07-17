import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Coins, Award, BookOpen, GraduationCap, ArrowRight } from "lucide-react";

import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { useLanguage } from "@/lib/context/LanguageContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { CourseCard } from "@/components/features/CourseCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants/routes";
import type { TocNode } from "@/lib/types/course";
import { countChapters, getChapterProgress } from "@/lib/utils/course";

interface LearningItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string | null;
  currentCard: number;
  totalCards: number;
  percent: number;
  updatedAt: string;
  agentId: string | null;
  authorNickname: string | null;
  category: string | null;
  license: string | null;
  targetAge: string | null;
  toc: TocNode[] | null;
}

interface DashboardData {
  externalAgentsCount: number;
  onlineCount: number;
  totalActiveCoursesCount: number;
  completedCoursesCount: number;
  unifiedLearningItems: LearningItem[];
  externalAgents: any[];
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <Skeleton className="h-9 w-48 bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-4 w-96 mt-2 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 space-y-2">
            <Skeleton className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-8 w-24 bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-3 w-32 bg-zinc-200 dark:bg-zinc-800" />
          </Card>
        ))}
      </div>
    </div>
  );
}

async function loadDashboardData(): Promise<DashboardData> {
  const [{ data: externalAgents }, { data: userProgress }] = await Promise.all([
    db.from("user_external_agents").select("id, name, status").eq("user_id", LOCAL_USER_ID),
    db.from("user_progress").select("*").eq("user_id", LOCAL_USER_ID),
  ]);

  const agents = externalAgents ?? [];
  const progress = userProgress ?? [];

  const externalAgentsCount = agents.length;
  const onlineCount = agents.filter((a: any) => a.status === "online").length;

  const activeProgress = progress.filter((p: any) => !p.completed);
  const completedCoursesCount = progress.filter((p: any) => p.completed).length;

  const unifiedLearningItems: LearningItem[] = activeProgress
    .map((p: any) => {
      const totalCards = p.course?.cards?.length || 10;
      const completedCards = p.completed ? totalCards : Math.max(0, (p.max_card ?? p.last_card ?? 1) - 1);
      const progressPercent = totalCards > 0 ? Math.min(100, Math.round((completedCards / totalCards) * 100)) : 0;

      return {
        id: `course-${p.id}`,
        slug: p.course?.slug || "",
        title: p.course?.title || "",
        description: p.course?.description || "",
        thumbnail: p.course?.thumbnail || null,
        currentCard: p.max_card ?? p.last_card ?? 0,
        totalCards,
        percent: progressPercent,
        updatedAt: p.updated_at,
        agentId: p.course?.agent_id || null,
        authorNickname: p.course?.author_nickname || null,
        category: p.course?.category || null,
        license: p.course?.license || null,
        targetAge: p.course?.target_age || null,
        toc: p.course?.toc || null,
      };
    })
    .sort((a: LearningItem, b: LearningItem) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    externalAgentsCount,
    onlineCount,
    totalActiveCoursesCount: activeProgress.length,
    completedCoursesCount,
    unifiedLearningItems,
    externalAgents: agents,
  };
}

export default function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let active = true;
    loadDashboardData().then((result) => {
      if (active) setData(result);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!data) {
    return <DashboardSkeleton />;
  }

  const {
    externalAgentsCount,
    onlineCount,
    totalActiveCoursesCount,
    completedCoursesCount,
    unifiedLearningItems,
    externalAgents,
  } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
        <p className="text-muted-foreground mt-2">{t("dashboardSubtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20 flex flex-col justify-between h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              <CardTitle className="text-lg">{t("manageAgents")}</CardTitle>
            </div>
            <CardDescription>{t("manageAgentsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-0">
            <div className="text-sm text-muted-foreground">
              {t("registeredAgents")}
              <span className="font-semibold text-foreground">{externalAgentsCount}</span> ({t("online")}:{" "}
              <span className="font-semibold text-emerald-500">{onlineCount}</span>)
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" asChild>
                <Link to={ROUTES.MY_AGENTS}>{t("manageAgents")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-background border-blue-500/20 flex flex-col justify-between h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-5 text-blue-500" />
              <CardTitle className="text-lg">{t("aiCourse")}</CardTitle>
            </div>
            <CardDescription>{t("aiCourseDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-0">
            <div className="text-sm text-muted-foreground">{t("searchCoursesDesc")}</div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" asChild>
                <Link to={ROUTES.COURSES}>{t("searchCourses")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("activeAgents")} value={`${onlineCount} / ${externalAgentsCount}`} icon={Bot} description={t("activeAgentsDesc")} />
        <StatCard title={t("tokenUsageThisMonth")} value={`0 ${t("tokens")}`} icon={Coins} description={t("tokenUsageThisMonthDesc")} />
        <StatCard title={t("enrolledCourses")} value={`${totalActiveCoursesCount}`} icon={BookOpen} description={t("enrolledCoursesDesc")} />
        <StatCard title={t("completedCourses")} value={`${completedCoursesCount}`} icon={Award} description={t("completedCoursesDesc")} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("coursesInProgress")}</h2>
          <Link to={ROUTES.MY_COURSES}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              {t("goToMyCourses")} <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {unifiedLearningItems.slice(0, 3).map((item) => {
            const assignedAgent = externalAgents.find((a: any) => a.id === item.agentId);
            const totalChapters = countChapters(item.toc);

            return (
              <CourseCard
                key={item.id}
                title={item.title}
                description={item.description}
                thumbnail={item.thumbnail}
                category={item.category}
                agentName={assignedAgent?.name || null}
                author={item.authorNickname}
                chapterStatus={getChapterProgress(item.toc, item.currentCard)}
                progressPercent={item.percent}
                totalChapters={totalChapters || null}
                totalCards={item.totalCards || null}
                license={item.license}
                targetAge={item.targetAge}
                enrollmentStatus="enrolled"
                hideMeta
                hideEnrollmentLabel
                onCardClick={() => navigate(`/courses/${item.slug}`)}
                footerAction={{ kind: "learn", onClick: () => navigate(`/learn/${item.slug}`) }}
              />
            );
          })}
        </div>
        {unifiedLearningItems.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p>{t("noCoursesInProgress")}</p>
            <Link to={ROUTES.COURSES}>
              <Button variant="outline" className="mt-4 text-xs">
                {t("browseAllCourses")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
