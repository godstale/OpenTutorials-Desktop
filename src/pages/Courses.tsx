import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, Mail, Globe, CheckCircle2, ArrowRight, BookOpenCheck, ExternalLink, ArrowUpDown, Download, Loader2, X } from "lucide-react";
import { CourseCard } from "@/components/features/CourseCard";
import { CourseIcon } from "@/components/ui/course-icon";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { importCourseBundle } from "@/lib/bundle/client";
import { useLanguage } from "@/lib/context/LanguageContext";
import type { TocNode } from "@/lib/types/course";
import { countChapters, isVersionNewer, countCardsFromToc } from "@/lib/utils/course";

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/godstale/OpenTutorials-Browser/main/";
const GITHUB_REPO_URL = "https://github.com/godstale/OpenTutorials-Browser";
const REGISTER_BANNER_HIDDEN_KEY = "open-tutorials-hide-register-banner";

interface CoursePackage {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string;
  published: boolean;
  sequential_play: boolean;
  force_checkpoint: boolean;
  version: string;
  created_at: string;
  category?: string;
  target_age?: string;
  tags?: string[];
  author_id?: string;
  author_nickname?: string;
  author_email?: string;
  author_homepage?: string;
  toc?: TocNode[];
  cards?: string[];
  license?: string;
  license_file?: string;
  bundler_protocol_version?: string;
}

interface Subscription {
  id: string;
  package_id: string;
}

const LICENSE_MAP: Record<string, { ko: string; en: string }> = {
  "CC-BY-4.0": { ko: "CC BY 4.0 (저작자 표시)", en: "CC BY 4.0 (Attribution)" },
  "CC-BY-SA-4.0": { ko: "CC BY-SA 4.0 (저작자표시-동일조건변경허락)", en: "CC BY-SA 4.0 (Attribution-ShareAlike)" },
  "CC-BY-NC-4.0": { ko: "CC BY-NC 4.0 (저작자표시-비영리)", en: "CC BY-NC 4.0 (Attribution-NonCommercial)" },
  "CC-BY-NC-SA-4.0": { ko: "CC BY-NC-SA 4.0 (저작자표시-비영리-동일조건변경허락)", en: "CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike)" },
  "CC-BY-ND-4.0": { ko: "CC BY-ND 4.0 (저작자표시-변경금지)", en: "CC BY-ND 4.0 (Attribution-NoDerivatives)" },
  "CC-BY-NC-ND-4.0": { ko: "CC BY-NC-ND 4.0 (저작자표시-비영리-변경금지)", en: "CC BY-NC-ND 4.0 (Attribution-NonCommercial-NoDerivatives)" },
  "CC0-1.0": { ko: "CC0 1.0 (퍼블릭 도메인)", en: "CC0 1.0 (Public Domain Dedication)" },
  "all-rights-reserved": { ko: "모든 권리 보유 (All Rights Reserved)", en: "All Rights Reserved" },
  custom: { ko: "커스텀 라이선스 (Custom)", en: "Custom License" },
};

async function fetchLocalCourses(): Promise<CoursePackage[]> {
  const { data } = await db.from("course_packages").select("*").eq("published", true).order("created_at", { ascending: false });
  return data ?? [];
}

async function fetchSubscriptions(): Promise<Subscription[]> {
  const { data } = await db.from("user_package_subscriptions").select("id, package_id").eq("user_id", LOCAL_USER_ID);
  return data ?? [];
}

async function fetchOnlineCourses(): Promise<any[]> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/godstale/OpenTutorials-Browser/main/courses.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.courses)) return data.courses;
    return [];
  } catch (err) {
    console.warn("온라인 강좌 목록을 가져오는 중 오류가 발생했습니다 (오프라인 모드 전환):", err);
    return [];
  }
}

export default function Courses() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [courses, setCourses] = useState<CoursePackage[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "az" | "za">("newest");
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [onlineCourses, setOnlineCourses] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [enrolling, setEnrollingSlug] = useState<string | null>(null);
  const [installing, setInstallingSlug] = useState<string | null>(null);
  const [showRegisterBanner, setShowRegisterBanner] = useState(() => localStorage.getItem(REGISTER_BANNER_HIDDEN_KEY) !== "true");

  const handleHideRegisterBanner = () => {
    setShowRegisterBanner(false);
    localStorage.setItem(REGISTER_BANNER_HIDDEN_KEY, "true");
  };

  const fetchCoursesAndSubs = async () => {
    const [localCourses, subs] = await Promise.all([fetchLocalCourses(), fetchSubscriptions()]);
    setCourses(localCourses);
    setSubscriptions(subs);
  };

  useEffect(() => {
    fetchCoursesAndSubs();
    setOnlineLoading(true);
    fetchOnlineCourses()
      .then(setOnlineCourses)
      .finally(() => setOnlineLoading(false));
  }, []);

  const handleSubscribe = async (courseId: string) => {
    try {
      const { error: subErr } = await db
        .from("user_package_subscriptions")
        .upsert({ user_id: LOCAL_USER_ID, package_id: courseId });
      if (subErr) throw new Error(subErr.message);

      await db.from("user_progress").upsert({
        user_id: LOCAL_USER_ID,
        course_id: courseId,
        last_card: 0,
        completed: false,
      });

      await fetchCoursesAndSubs();
    } catch (err: any) {
      alert(`수강 신청 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  const isSubscribed = (courseId: string) => subscriptions.some((sub) => sub.package_id === courseId);

  const handleInstallCourse = async (onlineCourse: any) => {
    setInstallingSlug(onlineCourse.slug);
    try {
      let downloadUrl = onlineCourse.downloadUrl;
      if (!downloadUrl) throw new Error(language === "en" ? "This course has no download URL." : "이 강좌에는 다운로드 주소가 없습니다.");
      if (!downloadUrl.startsWith("http://") && !downloadUrl.startsWith("https://")) {
        downloadUrl = `${GITHUB_RAW_BASE}${downloadUrl}`;
      }

      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(language === "en" ? "Failed to download the course ZIP file." : "강좌 ZIP 파일을 다운로드하지 못했습니다.");
      const zipBlob = await res.blob();

      const { data: pkg, error: importErr } = await importCourseBundle(zipBlob, "GITHUB");
      if (importErr) throw new Error(importErr.message);

      await handleSubscribe(pkg.id);
    } catch (err: any) {
      console.error(err);
      alert(
        language === "en"
          ? `An error occurred while installing the course: ${err.message}`
          : `강좌 설치 중 오류가 발생했습니다: ${err.message}`,
      );
    } finally {
      setInstallingSlug(null);
    }
  };

  const filteredOnlineCourses = onlineCourses
    .filter((course) => {
      const query = searchQuery.toLowerCase().trim();
      const authorName = typeof course.author === "string" ? course.author : course.author?.nickname || "";
      return (
        course.title.toLowerCase().includes(query) ||
        (course.description && course.description.toLowerCase().includes(query)) ||
        authorName.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortOrder === "az") return a.title.localeCompare(b.title);
      if (sortOrder === "za") return b.title.localeCompare(a.title);
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

  return (
    <div className="space-y-8 w-full max-w-6xl mx-auto pt-1 pb-8 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t("searchCourses")}</h2>
          <p className="text-muted-foreground mt-2">{t("searchCoursesDesc2")}</p>
        </div>
        {!showRegisterBanner && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0 border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 dark:border-indigo-900/40 dark:text-indigo-400 dark:hover:bg-indigo-950/20"
            onClick={() => window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-3.5" />
            {t("btnRegisterCourse")}
          </Button>
        )}
      </div>

      {showRegisterBanner && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 dark:border-indigo-900/20 dark:bg-indigo-950/5 flex items-start gap-3 w-full relative">
          <Globe className="size-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1 pr-6">
            <h4 className="text-sm font-semibold text-indigo-950 dark:text-indigo-50">{t("infoRegisterCourse")}</h4>
            <p className="text-xs text-indigo-900/80 dark:text-indigo-200/80 leading-relaxed">
              {t("infoRegisterCourseDesc")}
              <br />
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
              >
                <span>{t("visitGithub")}</span>
                <ExternalLink className="size-3" />
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={handleHideRegisterBanner}
            aria-label={t("btnCloseBanner")}
            className="absolute top-3 right-3 p-1 rounded-md text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/60 dark:text-indigo-500 dark:hover:text-indigo-300 dark:hover:bg-indigo-950/30 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-6">
          <ArrowUpDown className="size-3.5 text-muted-foreground mr-0.5" />
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
              {order === "newest" ? t("sortNewest") : order === "az" ? t("sortAZ") : t("sortZA")}
            </Button>
          ))}
        </div>
      </div>

      {onlineLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex flex-col h-[320px] animate-pulse bg-muted/20 border-zinc-200 dark:border-zinc-800" />
          ))}
        </div>
      ) : filteredOnlineCourses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOnlineCourses.map((course) => {
            const localCourse = courses.find((c) => c.slug === course.slug);
            const enrolled = localCourse ? isSubscribed(localCourse.id) : false;
            const isEnrolling = enrolling === course.slug;
            const isInstalling = installing === course.slug;
            const author = course.author ? (typeof course.author === "string" ? course.author : course.author.nickname) : null;

            const footerAction = enrolled
              ? ({ kind: "learn", onClick: () => navigate(`/learn/${course.slug}`) } as const)
              : localCourse
                ? ({ kind: "enroll", loading: isEnrolling, onClick: async () => {
                    setEnrollingSlug(course.slug);
                    await handleSubscribe(localCourse.id);
                    setEnrollingSlug(null);
                  } } as const)
                : ({ kind: "install", loading: isInstalling, onClick: () => handleInstallCourse(course) } as const);

            return (
              <CourseCard
                key={course.slug}
                title={course.title}
                description={course.description || t("noIntroduction")}
                thumbnail={course.thumbnail || "icon:book"}
                category={course.category || null}
                agentName={null}
                author={author}
                progressPercent={null}
                totalChapters={
                  course.toc && course.toc.length > 0
                    ? countChapters(course.toc)
                    : localCourse?.toc
                      ? countChapters(localCourse.toc)
                      : null
                }
                totalCards={
                  localCourse?.cards
                    ? localCourse.cards.length
                    : course.toc && course.toc.length > 0
                      ? countCardsFromToc(course.toc)
                      : localCourse?.toc
                        ? countCardsFromToc(localCourse.toc)
                        : null
                }
                license={course.license || localCourse?.license || null}
                targetAge={course.target_age || localCourse?.target_age || null}
                enrollmentStatus={enrolled ? "enrolled" : null}
                onCardClick={() => {
                  setSelectedCourse(course);
                  setIsDetailOpen(true);
                }}
                footerAction={footerAction}
              />
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center text-muted-foreground bg-muted/20 border border-dashed rounded-2xl flex flex-col items-center justify-center gap-4">
          <BookOpen className="size-12 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">검색 조건에 맞는 온라인 강좌가 없습니다.</p>
            <p className="text-xs">검색어를 변경하여 다시 시도해 보세요.</p>
          </div>
        </div>
      )}

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col p-0 overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          {selectedCourse && (
            <>
              <div className="h-44 w-full relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <CourseIcon
                  thumbnail={selectedCourse.thumbnail || "icon:book"}
                  className="w-full h-full bg-transparent dark:bg-transparent"
                  iconClassName="w-16 h-16 text-indigo-600 dark:text-indigo-400"
                  alt={selectedCourse.title}
                />
                <div className="absolute top-4 left-4">
                  {(() => {
                    const localCourse = courses.find((c) => c.slug === selectedCourse.slug);
                    const enrolled = localCourse ? isSubscribed(localCourse.id) : false;
                    const hasUpdate = enrolled && localCourse && isVersionNewer(localCourse.version || "1.0.0", selectedCourse.version || "1.0.0");
                    if (enrolled) {
                      return (
                        <div className="flex gap-1.5">
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs gap-1 shadow-md">
                            <CheckCircle2 className="size-3" />
                            {t("statusEnrolled")}
                          </Badge>
                          {hasUpdate && <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs gap-1 shadow-md">{t("updateAvailable")}</Badge>}
                        </div>
                      );
                    }
                    if (localCourse) {
                      return (
                        <Badge variant="secondary" className="text-xs shadow-sm">
                          {t("statusWaitEnroll")}
                        </Badge>
                      );
                    }
                    return (
                      <Badge variant="outline" className="bg-white/85 dark:bg-zinc-900/85 text-xs shadow-sm">
                        {t("statusNewCourse")}
                      </Badge>
                    );
                  })()}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {selectedCourse.category && (
                      <Badge className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/50 border-none text-[10px] font-semibold uppercase tracking-wider">
                        {selectedCourse.category}
                      </Badge>
                    )}
                    {selectedCourse.target_age && (
                      <Badge variant="outline" className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {language === "en"
                          ? selectedCourse.target_age === "all"
                            ? "All Ages"
                            : `${selectedCourse.target_age} years old`
                          : selectedCourse.target_age === "all"
                            ? "전연령"
                            : `${selectedCourse.target_age}세`}
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{selectedCourse.title}</h3>

                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1">{selectedCourse.description || t("noIntroduction")}</p>
                </div>

                {selectedCourse.author && (
                  <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800/80">
                    <h4 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2.5">
                      {language === "en" ? "Author Info" : "제작자 정보"}
                    </h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-bold text-sm">
                          {(typeof selectedCourse.author === "string" ? selectedCourse.author : selectedCourse.author.nickname).substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                            {typeof selectedCourse.author === "string" ? selectedCourse.author : selectedCourse.author.nickname}
                          </p>
                          {typeof selectedCourse.author !== "string" && selectedCourse.author.email && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{selectedCourse.author.email}</p>
                          )}
                        </div>
                      </div>
                      {typeof selectedCourse.author !== "string" && (selectedCourse.author.website || selectedCourse.author.email) && (
                        <div className="flex items-center gap-1.5">
                          {selectedCourse.author.website && (
                            <a
                              href={selectedCourse.author.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                            >
                              <Globe className="size-4" />
                            </a>
                          )}
                          {selectedCourse.author.email && (
                            <a
                              href={`mailto:${selectedCourse.author.email}`}
                              className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shadow-sm"
                            >
                              <Mail className="size-4" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(() => {
                  const localCourse = courses.find((c) => c.slug === selectedCourse.slug);
                  const toc = selectedCourse.toc || localCourse?.toc;

                  return toc && toc.length > 0 ? (
                    <div className="space-y-3 border-t pt-4 border-zinc-100 dark:border-zinc-800">
                      <h4 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen className="size-3.5 text-indigo-500" />
                        {t("courseCurriculum")}
                      </h4>
                      <div className="border border-zinc-100 dark:border-zinc-800/80 rounded-lg p-2 bg-zinc-50/30 dark:bg-zinc-900/10">
                        <Accordion type="single" collapsible className="w-full">
                          {toc.map((chapter: any, idx: number) => (
                            <AccordionItem value={`chapter-${idx}`} key={idx} className="border-zinc-100 dark:border-zinc-800">
                              <AccordionTrigger className="hover:no-underline py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-mono text-[9px] uppercase">
                                    Chapter {String(idx + 1).padStart(2, "0")}
                                  </span>
                                  <span className="text-left line-clamp-1">{chapter.title}</span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-2 text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
                                {chapter.description && (
                                  <p className="bg-white dark:bg-zinc-900/50 p-2 rounded text-[11px] text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800/50 leading-relaxed">
                                    {chapter.description}
                                  </p>
                                )}
                                {chapter.children && chapter.children.length > 0 ? (
                                  <ul className="space-y-1.5 pl-1">
                                    {chapter.children.map((section: any, sIdx: number) => (
                                      <li key={sIdx} className="flex flex-col gap-0.5 border-l-2 border-zinc-200 dark:border-zinc-800 pl-3.5 py-0.5">
                                        <span className="font-medium text-zinc-800 dark:text-zinc-200 text-[11px] line-clamp-1">{section.title}</span>
                                        {section.description && (
                                          <span className="text-[10px] text-zinc-500 dark:text-zinc-500 line-clamp-1">{section.description}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  chapter.filename && (
                                    <ul className="space-y-1.5 pl-1">
                                      <li className="flex flex-col gap-0.5 border-l-2 border-zinc-200 dark:border-zinc-800 pl-3.5 py-0.5">
                                        <span className="font-medium text-zinc-800 dark:text-zinc-200 text-[11px] line-clamp-1">{chapter.title}</span>
                                        {chapter.description && (
                                          <span className="text-[10px] text-zinc-500 dark:text-zinc-500 line-clamp-1">{chapter.description}</span>
                                        )}
                                      </li>
                                    </ul>
                                  )
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 border-t pt-4 border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                      <h4 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen className="size-3.5 text-zinc-400" />
                        {t("courseCurriculum")}
                      </h4>
                      <p className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/80 text-center text-zinc-400 dark:text-zinc-500 text-[11px]">
                        {language === "en"
                          ? "This course is not installed locally. Download it to view the detailed table of contents."
                          : "로컬에 설치되지 않은 강좌입니다. 강좌를 다운로드하면 상세 목차를 확인하실 수 있습니다."}
                      </p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <span className="font-medium text-zinc-400 dark:text-zinc-500">{language === "en" ? "Sequence Rule" : "순차 수강 규정"}</span>
                    <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                      {selectedCourse.sequential_play
                        ? language === "en"
                          ? "Sequential required"
                          : "순차 진행 필요"
                        : language === "en"
                          ? "Free exploration"
                          : "자유로운 탐색"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <span className="font-medium text-zinc-400 dark:text-zinc-500">{language === "en" ? "Checkpoint Rule" : "체크포인트 규칙"}</span>
                    <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                      {selectedCourse.force_checkpoint
                        ? language === "en"
                          ? "Checkpoint required"
                          : "체크포인트 필수"
                        : language === "en"
                          ? "Self-guided/Recommended"
                          : "자율 권장"}
                    </p>
                  </div>
                  {selectedCourse.bundler_protocol_version && (
                    <div className="space-y-1.5 col-span-2 border-t pt-3 border-zinc-100 dark:border-zinc-800">
                      <span className="font-medium text-zinc-400 dark:text-zinc-500">{t("bundlerVersion")}</span>
                      <p className="text-zinc-600 dark:text-zinc-400">{selectedCourse.bundler_protocol_version}</p>
                    </div>
                  )}
                  <div className="space-y-1.5 col-span-2 border-t pt-3 border-zinc-100 dark:border-zinc-800">
                    <span className="font-medium text-zinc-400 dark:text-zinc-500">{t("courseLicense")}</span>
                    <p className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 font-medium">
                      {(() => {
                        const licenseKey = selectedCourse.license || "CC-BY-NC-4.0";
                        const licenseInfo = LICENSE_MAP[licenseKey] || { ko: licenseKey, en: licenseKey };
                        const licenseText = language === "en" ? licenseInfo.en : licenseInfo.ko;
                        return (
                          <>
                            <span>{licenseText}</span>
                            {selectedCourse.license_file && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-normal">({selectedCourse.license_file})</span>
                            )}
                          </>
                        );
                      })()}
                    </p>
                  </div>
                  {selectedCourse.tags && selectedCourse.tags.length > 0 && (
                    <div className="col-span-2 space-y-2 border-t pt-3 border-zinc-100 dark:border-zinc-800">
                      <span className="font-medium text-zinc-400 dark:text-zinc-500">{language === "en" ? "Tags" : "태그"}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCourse.tags.map((tag: string) => (
                          <span key={tag} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/20 shrink-0">
                <Button variant="ghost" onClick={() => setIsDetailOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700">
                  {language === "en" ? "Close" : "닫기"}
                </Button>

                {(() => {
                  const localCourse = courses.find((c) => c.slug === selectedCourse.slug);
                  const enrolled = localCourse ? isSubscribed(localCourse.id) : false;
                  const isEnrolling = enrolling === selectedCourse.slug;

                  if (enrolled) {
                    return (
                      <Button
                        className="text-white bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 gap-1.5"
                        onClick={() => {
                          setIsDetailOpen(false);
                          navigate(`/learn/${selectedCourse.slug}`);
                        }}
                      >
                        <BookOpenCheck className="size-4" />
                        <span>{t("startLearning")}</span>
                      </Button>
                    );
                  }
                  if (localCourse) {
                    return (
                      <Button
                        className="text-white bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 gap-1.5"
                        disabled={isEnrolling}
                        onClick={async () => {
                          setEnrollingSlug(selectedCourse.slug);
                          await handleSubscribe(localCourse.id);
                          setEnrollingSlug(null);
                        }}
                      >
                        <span>{language === "en" ? "Enroll" : "수강 신청하기"}</span>
                        <ArrowRight className="size-4" />
                      </Button>
                    );
                  }
                  return (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      disabled={installing === selectedCourse.slug}
                      onClick={() => handleInstallCourse(selectedCourse)}
                    >
                      {installing === selectedCourse.slug ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="size-4" />
                          <span>{language === "en" ? "Install" : "설치"}</span>
                        </>
                      )}
                    </Button>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[350px] h-[350px] bg-emerald-500/10 blur-[120px] rounded-full -z-10 pointer-events-none !mt-0" />
    </div>
  );
}
