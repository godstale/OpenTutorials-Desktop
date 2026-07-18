import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  PlayCircle,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  User,
  ArrowUpCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CourseIcon } from "@/components/ui/course-icon";
import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { importCourseBundle } from "@/lib/bundle/client";
import { getAgentChatLogs } from "@/lib/agent/client";
import type { UserExternalAgent } from "@/lib/types";
import { useLanguage } from "@/lib/context/LanguageContext";
import type { TranslationKeys } from "@/lib/locales/ko";
import { ROUTES } from "@/lib/constants/routes";
import { formatTotalDuration, formatAvgResponse, formatTargetAge, isVersionNewer } from "@/lib/utils/course";

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/godstale/OpenTutorials-Browser/main/";

const CC_LICENSE_URLS: Record<string, string> = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC-BY-NC-4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
  "CC-BY-NC-SA-4.0": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "CC-BY-ND-4.0": "https://creativecommons.org/licenses/by-nd/4.0/",
  "CC-BY-NC-ND-4.0": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
};

interface CoursePackage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  published: boolean;
  sequential_play: boolean;
  force_checkpoint: boolean;
  version?: string;
  changelog?: string;
  agent_id?: string | null;
  toc?: any[];
  cards?: string[];
  tags?: string[];
  author_nickname?: string;
  license?: string;
  license_file?: string;
  target_age?: string | null;
  created_at?: string;
}

interface UserProgress {
  last_card: number;
  max_card?: number;
  completed: boolean;
}



function AgentStatsView({ agentId }: { agentId: string }) {
  const { t } = useLanguage();
  const [chatLogs, setChatLogs] = useState<{ duration_ms: number; input_token_size: number; output_token_size: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getAgentChatLogs(agentId)
      .then(({ data }) => {
        if (active) setChatLogs(data ?? []);
      })
      .catch((err) => console.error("Failed to fetch chat logs for stats:", err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  const totalLogs = chatLogs.length;
  const totalMs = chatLogs.reduce((acc, log) => acc + (log.duration_ms || 0), 0);
  const avgMs = totalLogs > 0 ? totalMs / totalLogs : 0;
  const totalTokens = chatLogs.reduce((acc, log) => acc + (log.input_token_size || 0) + (log.output_token_size || 0), 0);
  const avgTokens = totalLogs > 0 ? Math.round(totalTokens / totalLogs) : 0;

  const stats = {
    totalHours: formatTotalDuration(totalMs, t),
    avgResponse: formatAvgResponse(avgMs, t),
    totalTokens: `${totalTokens.toLocaleString()} ${t("tokens")}`,
    avgTokens: `${avgTokens.toLocaleString()} ${t("tokens")}`,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg border">
        <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("lblUsageTime")}</span>
        {isLoading ? (
          <span className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded mt-1 mx-auto block" />
        ) : (
          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 mt-1 block">{stats.totalHours}</span>
        )}
      </div>
      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg border">
        <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("lblAvgResponse")}</span>
        {isLoading ? (
          <span className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded mt-1 mx-auto block" />
        ) : (
          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 mt-1 block">{stats.avgResponse}</span>
        )}
      </div>
      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg border">
        <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("lblUsageTokens")}</span>
        {isLoading ? (
          <span className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded mt-1 mx-auto block" />
        ) : (
          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 mt-1 block">{stats.totalTokens}</span>
        )}
      </div>
      <div className="p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg border">
        <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("lblAvgTokens")}</span>
        {isLoading ? (
          <span className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded mt-1 mx-auto block" />
        ) : (
          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 mt-1 block">{stats.avgTokens}</span>
        )}
      </div>
    </div>
  );
}

export default function CourseDetail() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = routeSlug ?? "";
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  const [pkg, setPkg] = useState<CoursePackage | null>(null);
  const [userSubscribed, setUserSubscribed] = useState(false);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [externalAgents, setExternalAgents] = useState<UserExternalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({});

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [onlineCourseInfo, setOnlineCourseInfo] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  const toggleChapter = (index: number, currentExpanded: boolean) => {
    setExpandedChapters((prev) => ({ ...prev, [index]: !currentExpanded }));
  };

  const expandAllChapters = () => {
    if (!pkg?.toc) return;
    setExpandedChapters(Object.fromEntries(pkg.toc.map((_: any, index: number) => [index, true])));
  };

  const collapseAllChapters = () => {
    if (!pkg?.toc) return;
    setExpandedChapters(Object.fromEntries(pkg.toc.map((_: any, index: number) => [index, false])));
  };

  const fetchCourseDetail = useCallback(async () => {
    const { data: pkgData } = await db.from("course_packages").select("*").eq("slug", slug).maybeSingle();
    if (!pkgData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPkg(pkgData);

    const [{ data: subData }, { data: progressData }, { data: agentsData }] = await Promise.all([
      db.from("user_package_subscriptions").select("id").eq("user_id", LOCAL_USER_ID).eq("package_id", pkgData.id).maybeSingle(),
      db.from("user_progress").select("*").eq("user_id", LOCAL_USER_ID).eq("course_id", pkgData.id).maybeSingle(),
      db.from("user_external_agents").select("*").eq("user_id", LOCAL_USER_ID),
    ]);

    setUserSubscribed(!!subData);
    setUserProgress(progressData ?? null);
    setExternalAgents(agentsData ?? []);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetchCourseDetail();
  }, [fetchCourseDetail]);

  useEffect(() => {
    if (!pkg) return;
    const localVersion = pkg.version || "1.0.0";
    async function checkUpdate() {
      let coursesList: any[] = [];
      try {
        const res = await fetch(`https://raw.githubusercontent.com/godstale/OpenTutorials-Browser/main/courses.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          coursesList = Array.isArray(data) ? data : data?.courses || [];
        }
      } catch (err) {
        console.warn("Failed to check course update (offline or network error):", err);
      }

      const onlineInfo = coursesList.find((c: any) => c.slug === slug);
      if (onlineInfo) {
        setOnlineCourseInfo(onlineInfo);
        if (isVersionNewer(localVersion, onlineInfo.version || "1.0.0")) {
          setUpdateAvailable(true);
        }
      }
    }
    checkUpdate();
  }, [pkg, slug]);

  const handleSubscribe = async () => {
    if (!pkg) return;
    setRegistering(true);
    try {
      const { error: subErr } = await db.from("user_package_subscriptions").upsert({ user_id: LOCAL_USER_ID, package_id: pkg.id });
      if (subErr) throw new Error(subErr.message);

      await db.from("user_progress").upsert({ user_id: LOCAL_USER_ID, course_id: pkg.id, last_card: 0, completed: false });

      await fetchCourseDetail();
    } catch (err: any) {
      alert(t("errEnrollFailed") + err.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleUpdatePackageAgent = async (agentId: string | null) => {
    if (!pkg) return;
    try {
      const { error } = await db.from("course_packages").update({ agent_id: agentId }).eq("id", pkg.id);
      if (error) throw new Error(error.message);
      await fetchCourseDetail();
    } catch (err: any) {
      alert(t("errAssignAgentFailed") + err.message);
    }
  };

  const handleResetProgress = async () => {
    if (!pkg) return;
    const confirmReset = window.confirm(t("confirmResetProgress"));
    if (!confirmReset) return;

    try {
      const { error } = await db.from("user_progress").delete().eq("user_id", LOCAL_USER_ID).eq("course_id", pkg.id);
      if (error) throw new Error(error.message);
      alert(t("alertResetProgressSuccess"));
      await fetchCourseDetail();
    } catch (err: any) {
      alert(t("errResetProgressFailed") + err.message);
    }
  };

  const handleUpdateCourse = async () => {
    if (!onlineCourseInfo) return;
    const confirmUpdate = window.confirm(
      t("lblConfirmUpdate")
        .replace("{title}", onlineCourseInfo.title)
        .replace("{version}", onlineCourseInfo.version)
    );
    if (!confirmUpdate) return;

    setUpdating(true);
    try {
      let downloadUrl = onlineCourseInfo.downloadUrl;
      if (!downloadUrl) throw new Error(t("errNoDownloadUrl"));
      if (!downloadUrl.startsWith("http://") && !downloadUrl.startsWith("https://")) {
        downloadUrl = `${GITHUB_RAW_BASE}${downloadUrl}`;
      }

      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(t("lblDownloadZipFailed"));
      const zipBlob = await res.blob();

      const { error: importErr } = await importCourseBundle(zipBlob, "GITHUB");
      if (importErr) throw new Error(importErr.message);

      alert(
        t("alertUpdateSuccessWithVer")
          .replace("{title}", onlineCourseInfo.title)
          .replace("{version}", onlineCourseInfo.version)
      );
      setUpdateAvailable(false);
      await fetchCourseDetail();
    } catch (err: any) {
      alert(t("errUpdateCourseFailed") + err.message);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 space-y-6 animate-pulse">
        <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
        <div className="space-y-4">
          <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
          <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !pkg) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center">
        <h2 className="text-2xl font-bold mb-4">{t("lblNoCourseFound")}</h2>
        <Button onClick={() => navigate(ROUTES.COURSES)}>{t("lblGoToCourseList")}</Button>
      </div>
    );
  }

  const totalSubcourses = pkg.cards?.length || 0;
  const completedSubcourses = userProgress
    ? userProgress.completed
      ? totalSubcourses
      : Math.max(0, (userProgress.max_card ?? userProgress.last_card ?? 1) - 1)
    : 0;
  const progressPercent = totalSubcourses > 0 ? Math.min(100, Math.round((completedSubcourses / totalSubcourses) * 100)) : 0;
  const nextCardIndex = completedSubcourses;
  const hasNextCard = nextCardIndex < totalSubcourses;
  const assignedAgent = externalAgents.find((a) => a.id === pkg.agent_id);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-8">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.COURSES)} className="gap-1 text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="w-4 h-4" />
          {t("lblBackToList")}
        </Button>
      </div>

      <Card className="border border-emerald-100 dark:border-emerald-950 bg-gradient-to-br from-emerald-50/20 via-white to-white dark:from-emerald-950/10 dark:via-zinc-900 dark:to-zinc-900 overflow-hidden shadow-sm">
        <CardContent className="pt-0 pb-0 px-6 md:px-8 flex flex-col md:flex-row gap-6 md:gap-8 items-start">
          <div className="w-full md:w-64 h-44 rounded-lg overflow-hidden shrink-0 border border-zinc-200">
            <CourseIcon thumbnail={pkg.thumbnail} className="w-full h-full" iconClassName="w-16 h-16" alt={pkg.title} />
          </div>

          <div className="flex-1 space-y-4 w-full">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-green-700 hover:bg-green-700 text-white font-semibold">{t("aiCourse")}</Badge>
                {userSubscribed && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                    {t("statusEnrolled")}
                  </Badge>
                )}
                {pkg.sequential_play && (
                  <Badge variant="outline" className="text-amber-600 border-amber-600 dark:text-amber-400">
                    {t("lblSequentialReq")}
                  </Badge>
                )}
                {pkg.force_checkpoint && (
                  <Badge variant="outline" className="text-rose-600 border-rose-600 dark:text-rose-400">
                    {t("lblCheckpointReq")}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-50">{pkg.title}</h1>
              <p className="text-zinc-600 dark:text-zinc-400 mt-2 text-sm md:text-base leading-relaxed">{pkg.description || t("noIntroduction")}</p>
            </div>

            {userSubscribed ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  <span>{t("learningProgress")}</span>
                  <span>
                    {t("lblCompletedCountDesc")
                      .replace("{total}", String(totalSubcourses))
                      .replace("{completed}", String(completedSubcourses))
                      .replace("{percent}", String(progressPercent))}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2.5 bg-zinc-100 dark:bg-zinc-800" />

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  {hasNextCard ? (
                    <Button
                      onClick={() => navigate(`/learn/${pkg.slug}?card=${nextCardIndex + 1}`)}
                      className="bg-green-700 hover:bg-green-700 text-white flex-1 gap-2"
                    >
                      <PlayCircle className="w-4 h-4" />
                      {t("continueLearning")}
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 border-green-600 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20 pointer-events-none gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {t("lblAllLessonsCompleted")}
                    </Button>
                  )}
                  <Button onClick={handleResetProgress} variant="destructive" className="gap-2 shrink-0 shadow-sm">
                    <RotateCcw className="w-4 h-4" />
                    {t("lblResetProgress")}
                  </Button>
                  {updateAvailable && (
                    <Button
                      onClick={handleUpdateCourse}
                      disabled={updating}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shrink-0 shadow-sm"
                    >
                      {updating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{t("lblUpdatingEllipsis")}</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="w-4 h-4" />
                          <span>{t("lblUpdateVer").replace("{version}", onlineCourseInfo?.version || "")}</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="pt-4">
                <Button
                  onClick={handleSubscribe}
                  disabled={registering}
                  className="w-full md:w-auto px-8 bg-green-700 hover:bg-green-700 text-white font-semibold gap-2"
                >
                  {registering ? t("lblEnrollingEllipsis") : t("btnEnroll")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="pt-3 pb-0 px-6 md:px-8 flex flex-col gap-3 text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/50">
          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 w-full">
            {pkg.author_nickname && (
              <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 font-medium">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                <span>
                  {t("lblAuthorPrefix")}
                  {pkg.author_nickname}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>
                {t("lblSequentialPrefix")}
                <strong className={pkg.sequential_play ? "text-green-700 dark:text-green-300 font-semibold" : "text-zinc-600 dark:text-zinc-400 font-medium"}>
                  {pkg.sequential_play ? t("lblRequired") : t("lblOptional")}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              <span>
                {t("lblCheckpointPrefix")}
                <strong className={pkg.force_checkpoint ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-zinc-600 dark:text-zinc-400 font-medium"}>
                  {pkg.force_checkpoint ? t("lblCheckpointForceLabel") : t("lblSkipAllowed")}
                </strong>
              </span>
            </div>
            {pkg.target_age && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span>
                  {t("lblAgePrefix")}
                  <strong className="text-zinc-600 dark:text-zinc-400 font-medium">{formatTargetAge(pkg.target_age, t)}</strong>
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-zinc-100 dark:border-zinc-800/50 pt-2 w-full">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{t("lblTagsPrefix")}</span>
            {pkg.tags && pkg.tags.length > 0 ? (
              pkg.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-zinc-100 text-zinc-600 dark:bg-zinc-850 dark:text-zinc-400 text-[11px] font-normal px-2 py-0.5">
                  #{tag}
                </Badge>
              ))
            ) : (
              <span className="text-zinc-400">{t("lblNoTagsRegistered")}</span>
            )}
          </div>
        </CardFooter>
      </Card>

      {userSubscribed && (
        <Card className="border border-emerald-100 dark:border-emerald-950 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 px-6 md:px-8">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Bot className="w-5 h-5 text-green-700 dark:text-green-300" />
              {t("lblTutorSettingsStats")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("lblTutorSettingsStatsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6 md:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-green-100 dark:bg-zinc-900/50 border">
              <div className="space-y-1">
                <span className="text-sm font-semibold block">{t("lblSelectAgent")}</span>
                <span className="text-xs text-muted-foreground">{t("lblAgentDesc2")}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pkg.agent_id || ""}
                  onChange={(e) => handleUpdatePackageAgent(e.target.value || null)}
                  className="text-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-3 py-1.5 min-w-[200px] focus:outline-none shadow-sm cursor-pointer"
                >
                  <option value="">{t("lblNoTutorAssigned")}</option>
                  {externalAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.agent_type === "llm" ? "LLM" : "하네스"}
                      {agent.is_ai_tutor ? t("lblDefaultTutorSuffix") : ""})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {pkg.agent_id && assignedAgent ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs border-b pb-2">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {t("lblSelectedAgentProfile")}
                  </span>
                  <Badge className="bg-green-700 hover:bg-green-700 text-white text-[10px]">{assignedAgent.agent_type === "llm" ? "LLM" : "하네스"}</Badge>
                </div>
                <AgentStatsView agentId={pkg.agent_id} />
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed rounded-lg bg-zinc-50/30">
                <p className="text-sm text-muted-foreground">
                  {t("lblNoTutorAssignedDesc")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-green-700" />
            {t("courseCurriculum")}
          </h2>
          {pkg.toc && pkg.toc.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs px-2.5" onClick={expandAllChapters}>
                {t("lblExpandAll")}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs px-2.5" onClick={collapseAllChapters}>
                {t("lblCollapseAll")}
              </Button>
            </div>
          )}
        </div>

        {pkg.toc && pkg.toc.length > 0 ? (
          <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-4 pl-6 md:pl-8 space-y-8">
            {pkg.toc.map((chapter: any, index: number) => {
              const isChapterCompleted =
                chapter.children && chapter.children.length > 0
                  ? chapter.children.every((section: any) => {
                      const cardIndex = pkg.cards?.indexOf(section.filename) ?? -1;
                      return cardIndex !== -1 && cardIndex < completedSubcourses;
                    })
                  : chapter.filename
                    ? (pkg.cards?.indexOf(chapter.filename) ?? -1) < completedSubcourses
                    : false;

              const isExpanded = expandedChapters[index] !== undefined ? expandedChapters[index] : !isChapterCompleted;

              const renderItem = (item: any, key: number) => {
                const cardIndex = pkg.cards?.indexOf(item.filename) ?? -1;
                const isCompleted = cardIndex !== -1 && cardIndex < completedSubcourses;
                const isStarted = cardIndex !== -1 && cardIndex === completedSubcourses;
                const isLocked = pkg.sequential_play && cardIndex !== -1 && cardIndex > completedSubcourses;

                return (
                  <Card
                    key={key}
                    className={`border hover:shadow-sm transition-all overflow-hidden bg-white dark:bg-zinc-900 ${
                      isCompleted
                        ? "border-green-100 bg-zinc-50 dark:border-green-950/20 dark:bg-zinc-900/50"
                        : isStarted && !isLocked
                          ? "border-emerald-100 dark:border-emerald-950"
                          : "border-zinc-200 dark:border-zinc-800"
                    } ${isLocked ? "opacity-60 bg-zinc-50/30" : ""}`}
                  >
                    <CardContent className="px-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">{item.title}</h4>
                          {isCompleted ? (
                            <Badge variant="default" className="bg-zinc-400 text-white text-[10px] px-1.5 py-0">
                              {t("completed")}
                            </Badge>
                          ) : isLocked ? (
                            <Badge variant="outline" className="text-zinc-400 border-zinc-200 text-[10px] px-1.5 py-0">
                              {t("lblLocked")}
                            </Badge>
                          ) : isStarted ? (
                            <Badge variant="secondary" className="bg-green-700 text-white text-[10px] px-1.5 py-0">
                              {t("statusLearning")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-zinc-400 border-zinc-200 text-[10px] px-1.5 py-0">
                              {t("lblPending")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        {userSubscribed ? (
                          <Button
                            variant={isCompleted ? "outline" : "default"}
                            size="sm"
                            onClick={() => cardIndex !== -1 && navigate(`/learn/${pkg.slug}?card=${cardIndex + 1}`)}
                            disabled={isLocked}
                            className={isCompleted ? "border-zinc-300 text-zinc-700 hover:bg-zinc-50 text-xs h-8" : "bg-green-700 hover:bg-green-700 text-white text-xs h-8"}
                          >
                            {isCompleted ? t("lblReview") : isStarted ? t("continueLearning") : t("lblStartLearn")}
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={handleSubscribe} disabled={registering} className="border border-zinc-200 text-xs h-8">
                            {t("lblEnrollRequired")}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              };

              return (
                <div key={index} className="relative group space-y-4">
                  <div className="absolute -left-[35px] md:-left-[43px] top-1.5 w-6 h-6 md:w-8 md:h-8 rounded-full border-4 flex items-center justify-center font-bold text-xs bg-white dark:bg-zinc-900 border-green-700 text-green-700">
                    {index + 1}
                  </div>

                  <div className="pl-2 cursor-pointer flex items-center justify-between group/header select-none" onClick={() => toggleChapter(index, isExpanded)}>
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                        {chapter.title}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400 group-hover/header:text-green-700 transition-colors" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover/header:text-green-700 transition-colors" />
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">{chapter.description}</p>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 pl-2 transition-all duration-200">
                      {chapter.children && chapter.children.length > 0
                        ? chapter.children.map((section: any, sIdx: number) => renderItem(section, sIdx))
                        : chapter.filename && renderItem(chapter, 0)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed rounded-lg bg-zinc-50/30">
            <p className="text-sm text-muted-foreground">{t("lblNoCurriculum")}</p>
          </div>
        )}
      </div>

      <Card className="border border-emerald-100 dark:border-emerald-950 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
        <CardHeader className="pt-0 px-6 md:px-8">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-green-700" />
            {t("lblVersionChangelog")}
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            {t("lblVersionChangelogDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 md:pt-4 pb-6 px-6 md:px-8 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("lblCurrentVersionPrefix")}</span>
              <Badge className="bg-green-700 text-white dark:bg-green-950 dark:text-green-300 font-mono border-none">v{pkg.version || "1.0.0"}</Badge>
            </div>
            {pkg.created_at && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("lblRegisteredPrefix")}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{new Date(pkg.created_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
          <div className="p-4 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">{t("lblChangelogTitle")}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
              {pkg.changelog || t("lblInitialRegistration")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-emerald-100 dark:border-emerald-950 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
        <CardHeader className="pt-0 px-6 md:px-8">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center font-bold text-base text-green-700">©</span>
            {t("lblLicenseInfoTitle")}
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            {t("lblLicenseInfoDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 md:pt-4 pb-6 px-6 md:px-8 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("courseLicense")}:</span>
            <Badge className="bg-zinc-100 text-zinc-800 dark:bg-zinc-850 dark:text-zinc-300 font-mono border-none text-xs px-2.5 py-1">
              {pkg.license || "CC-BY-NC-4.0"}
            </Badge>
          </div>

          <div className="p-4 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
              {t("lblLicenseTermsDesc")}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {(() => {
                const lic = pkg.license || "CC-BY-NC-4.0";
                 const keys: Record<string, TranslationKeys> = {
                  "CC-BY-4.0": "descLicenseBY40",
                  "CC-BY-SA-4.0": "descLicenseBYSA40",
                  "CC-BY-NC-4.0": "descLicenseBYNC40",
                  "CC-BY-NC-SA-4.0": "descLicenseBYNCSA40",
                  "CC-BY-ND-4.0": "descLicenseBYND40",
                  "CC-BY-NC-ND-4.0": "descLicenseBYNCND40",
                  "CC0-1.0": "descLicenseCC010",
                  "custom": "descLicenseCustom",
                };
                return t(keys[lic] ?? "descLicenseARR");
              })()}
            </p>

            {pkg.license_file && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="text-zinc-500">
                  {t("lblLicenseDocPrefix")}
                  <code className="px-1 py-0.5 bg-zinc-100 dark:bg-zinc-850 dark:text-zinc-400 rounded text-green-700 dark:text-green-300 font-mono">{pkg.license_file}</code>
                </span>
                {(() => {
                  const lic = pkg.license || "CC-BY-NC-4.0";
                  const isCcLicense = CC_LICENSE_URLS[lic];
                  if (!isCcLicense) return null;
                  const licenseHref = language === "en" ? CC_LICENSE_URLS[lic] : `${CC_LICENSE_URLS[lic]}deed.ko`;
                  return (
                    <a
                      href={licenseHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 font-semibold underline"
                    >
                      {t("lblViewDocument")}
                    </a>
                  );
                })()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
