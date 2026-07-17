import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Award, Compass, FolderOpen, Search, ArrowUpDown } from "lucide-react";
import { CourseCard } from "@/components/features/CourseCard";
import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { useLanguage } from "@/lib/context/LanguageContext";
import type { TocNode } from "@/lib/types/course";
import { countChapters, getChapterProgress } from "@/lib/utils/course";

interface ProgressItem {
  id: string;
  course_id: string;
  last_card: number;
  max_card?: number;
  completed: boolean;
}

interface PackageSubscriptionItem {
  id: string;
  user_id: string;
  package_id: string;
  created_at: string;
  total_courses: number;
  completed_courses: number;
  package: {
    id: string;
    slug: string;
    title: string;
    description: string;
    thumbnail: string | null;
    agent_id?: string | null;
    author_nickname?: string | null;
    category?: string | null;
    license?: string | null;
    target_age?: string | null;
    toc?: TocNode[] | null;
  } | null;
}

async function loadSubscriptions(): Promise<{ progress: ProgressItem[]; subscriptions: PackageSubscriptionItem[]; agents: { id: string; name: string }[] }> {
  const [{ data: subs }, { data: progressList }, { data: agentsData }] = await Promise.all([
    db.from("user_package_subscriptions").select("*").eq("user_id", LOCAL_USER_ID),
    db.from("user_progress").select("course_id, completed, max_card, last_card").eq("user_id", LOCAL_USER_ID),
    db.from("user_external_agents").select("id, name").eq("user_id", LOCAL_USER_ID),
  ]);

  const progressMap = new Map<string, any>((progressList ?? []).map((p: any) => [p.course_id, p]));

  const subscriptions: PackageSubscriptionItem[] = (subs ?? []).map((sub: any) => {
    const pkg = sub.package;
    const totalCourses = pkg?.cards?.length || 0;
    const progress = progressMap.get(sub.package_id);
    let completedCourses = 0;
    if (progress) {
      completedCourses = progress.completed ? totalCourses : Math.max(0, (progress.max_card ?? progress.last_card ?? 1) - 1);
    }

    return {
      id: sub.id,
      user_id: sub.user_id,
      package_id: sub.package_id,
      created_at: sub.created_at,
      total_courses: totalCourses,
      completed_courses: completedCourses,
      package: pkg
        ? {
            id: pkg.id,
            slug: pkg.slug,
            title: pkg.title,
            description: pkg.description,
            thumbnail: pkg.thumbnail,
            agent_id: pkg.agent_id,
            author_nickname: pkg.author_nickname,
            category: pkg.category,
            license: pkg.license,
            target_age: pkg.target_age,
            toc: pkg.toc,
          }
        : null,
    };
  });

  return { progress: progressList ?? [], subscriptions, agents: agentsData ?? [] };
}

export default function MyCourses() {
  const navigate = useNavigate();
  const [progressList, setProgressList] = useState<ProgressItem[]>([]);
  const [packageSubscriptions, setPackageSubscriptions] = useState<PackageSubscriptionItem[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "az" | "za">("newest");

  useEffect(() => {
    let active = true;
    loadSubscriptions()
      .then((result) => {
        if (!active) return;
        setProgressList(result.progress);
        setPackageSubscriptions(result.subscriptions);
        setAgents(result.agents);
      })
      .catch((err) => console.error("Failed to fetch user progress, packages, or agents:", err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const getPackageTargetUrl = (packageId: string, defaultSlug: string) => {
    const pkgProgress = progressList.find((p) => p.course_id === packageId);
    if (pkgProgress) {
      const currentCard = pkgProgress.max_card ?? pkgProgress.last_card ?? 0;
      return `/learn/${defaultSlug}?card=${currentCard || 1}`;
    }
    return `/learn/${defaultSlug}`;
  };

  const activePackages = packageSubscriptions.filter((sub) => sub.total_courses === 0 || sub.completed_courses < sub.total_courses);
  const completedPackages = packageSubscriptions.filter((sub) => sub.total_courses > 0 && sub.completed_courses === sub.total_courses);

  const applyFilter = (list: PackageSubscriptionItem[]) =>
    list
      .filter((sub) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        const pkg = sub.package;
        return (
          pkg?.title?.toLowerCase().includes(q) ||
          pkg?.description?.toLowerCase().includes(q) ||
          pkg?.author_nickname?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const titleA = a.package?.title || "";
        const titleB = b.package?.title || "";
        if (sortOrder === "az") return titleA.localeCompare(titleB);
        if (sortOrder === "za") return titleB.localeCompare(titleA);
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

  const filteredActive = applyFilter(activePackages);
  const filteredCompleted = applyFilter(completedPackages);

  return (
    <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto pt-1 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t("myCourses")}</h2>
          <p className="text-muted-foreground mt-2">{t("myCoursesDesc")}</p>
        </div>
        <Button onClick={() => navigate("/courses")} className="text-white shadow-sm">
          <BookOpen className="w-4 h-4 mr-2" />
          {t("findNewCourses")}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col overflow-hidden h-[280px] animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="active" className="w-full">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ArrowUpDown className="size-3.5 text-muted-foreground mr-0.5 ml-6" />
              {(["newest", "az", "za"] as const).map((order) => (
                <Button
                  key={order}
                  variant={sortOrder === order ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortOrder(order)}
                  className={`text-xs h-9 px-3 ${
                    sortOrder === order
                      ? "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  {order === "newest" ? t("sortRegistered") : order === "az" ? t("sortAZ") : t("sortZA")}
                </Button>
              ))}
            </div>
          </div>

          <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
            <TabsTrigger value="active">
              {t("coursesEnrolled")} ({filteredActive.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              {t("coursesCompleted")} ({filteredCompleted.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-0 space-y-8">
            {filteredActive.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredActive.map((sub) => {
                  const pkg = sub.package;
                  if (!pkg) return null;
                  const percent = sub.total_courses > 0 ? Math.round((sub.completed_courses / sub.total_courses) * 100) : 0;
                  const assignedAgent = agents.find((a) => a.id === pkg.agent_id);
                  const totalChapters = countChapters(pkg.toc);

                  return (
                    <CourseCard
                      key={sub.id}
                      title={pkg.title}
                      description={pkg.description}
                      thumbnail={pkg.thumbnail}
                      category={pkg.category}
                      agentName={assignedAgent?.name || null}
                      author={pkg.author_nickname}
                      chapterStatus={getChapterProgress(pkg.toc, sub.completed_courses)}
                      progressPercent={percent}
                      totalChapters={totalChapters || null}
                      totalCards={sub.total_courses || null}
                      license={pkg.license}
                      targetAge={pkg.target_age}
                      enrollmentStatus="enrolled"
                      hideMeta
                      hideEnrollmentLabel
                      onCardClick={() => navigate(`/courses/${pkg.slug}`)}
                      footerAction={{ kind: "learn", onClick: () => navigate(getPackageTargetUrl(sub.package_id, pkg.slug)) }}
                    />
                  );
                })}
              </div>
            )}

            {filteredActive.length === 0 && (
              <div className="py-12 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed flex flex-col items-center justify-center gap-4">
                <FolderOpen className="w-12 h-12 text-muted-foreground/50" />
                <div>{t("noEnrolledCourses")}</div>
                <Button onClick={() => navigate("/courses")} variant="outline" size="sm">
                  <Compass className="w-4 h-4 mr-2" />
                  {t("browseNewCourses")}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-0 space-y-8">
            {filteredCompleted.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCompleted.map((sub) => {
                  const pkg = sub.package;
                  if (!pkg) return null;
                  const assignedAgent = agents.find((a) => a.id === pkg.agent_id);
                  const totalChapters = countChapters(pkg.toc);

                  return (
                    <CourseCard
                      key={sub.id}
                      title={pkg.title}
                      description={pkg.description}
                      thumbnail={pkg.thumbnail}
                      category={pkg.category}
                      agentName={assignedAgent?.name || null}
                      author={pkg.author_nickname}
                      chapterStatus={getChapterProgress(pkg.toc, sub.completed_courses)}
                      progressPercent={100}
                      totalChapters={totalChapters || null}
                      totalCards={sub.total_courses || null}
                      license={pkg.license}
                      targetAge={pkg.target_age}
                      enrollmentStatus="completed"
                      hideMeta
                      hideEnrollmentLabel
                      onCardClick={() => navigate(`/courses/${pkg.slug}`)}
                      footerAction={{ kind: "learn", onClick: () => navigate(`/learn/${pkg.slug}`) }}
                    />
                  );
                })}
              </div>
            )}

            {filteredCompleted.length === 0 && (
              <div className="py-12 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed flex flex-col items-center justify-center gap-4">
                <Award className="w-12 h-12 text-muted-foreground/50" />
                <div>{t("noCompletedCourses")}</div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
