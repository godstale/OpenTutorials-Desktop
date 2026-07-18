import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { UploadCloud, FileArchive, CheckCircle2, XCircle, Loader2, BookOpen } from "lucide-react";

import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { validateCourseBundle, importCourseBundle, type BundlePreview } from "@/lib/bundle/client";
import { getExternalAgents } from "@/lib/api/external-agents";
import type { UserExternalAgent } from "@/lib/types";
import type { TocNode } from "@/lib/types/course";
import { useLanguage } from "@/lib/context/LanguageContext";
import { countChapters } from "@/lib/utils/course";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CourseCard } from "@/components/features/CourseCard";

interface CoursePackageRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  version: string;
  source?: string;
  license?: string;
  category?: string | null;
  target_age?: string | null;
  cards?: string[];
  toc?: TocNode[];
  author_nickname?: string;
  agent_id?: string | null;
  created_at: string;
}

async function fetchLocalCourses(): Promise<CoursePackageRow[]> {
  const { data } = await db.from("course_packages").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export default function CoursesManage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [courses, setCourses] = useState<CoursePackageRow[]>([]);
  const [agents, setAgents] = useState<UserExternalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    fetchLocalCourses()
      .then(setCourses)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    getExternalAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  const resetUploadState = () => {
    setPendingFile(null);
    setPreview(null);
    setValidationError(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setValidationError(t("errUnsupportedFileType"));
      return;
    }
    setPendingFile(file);
    setPreview(null);
    setValidationError(null);
    setImportError(null);
    setValidating(true);
    try {
      const { data, error } = await validateCourseBundle(file);
      if (error) {
        setValidationError(error.message);
      } else {
        setPreview(data);
      }
    } catch (err: any) {
      setValidationError(err.message || String(err));
    } finally {
      setValidating(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleConfirmImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const { data: pkg, error } = await importCourseBundle(pendingFile, "LOCAL");
      if (error) {
        setImportError(error.message);
        return;
      }
      await db.from("user_package_subscriptions").upsert({ user_id: LOCAL_USER_ID, package_id: pkg.id });
      await db.from("user_progress").upsert({ user_id: LOCAL_USER_ID, course_id: pkg.id, last_card: 0, completed: false });
      resetUploadState();
      refresh();
    } catch (err: any) {
      setImportError(err.message || String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (courseItem: CoursePackageRow) => {
    const confirmMsg = t("confirmDeleteCourse").replace("{title}", courseItem.title);
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(courseItem.id);
    try {
      const first = await invoke<any>("delete_course_package", { id: courseItem.id, force: false });
      if (first.error?.code === "subscribers_exist") {
        const forceMsg = t("confirmForceDeleteProgress").replace("{message}", first.error.message);
        if (!window.confirm(forceMsg)) return;
        const forced = await invoke<any>("delete_course_package", { id: courseItem.id, force: true });
        if (forced.error) throw new Error(forced.error.message);
      } else if (first.error) {
        throw new Error(first.error.message);
      }
      refresh();
    } catch (err: any) {
      alert(t("errDeleteFailed") + (err.message || String(err)));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("manageCourses")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("manageCoursesDesc")}
        </p>
      </div>

      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-10 border-2 border-dashed cursor-pointer text-center transition-colors ${
          dragActive ? "border-primary bg-primary/5" : "border-zinc-300 dark:border-zinc-700 hover:border-primary/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <UploadCloud className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">{t("lblUploadCourseFile")}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("lblDropBundleDesc")}
        </p>
      </Card>

      {pendingFile && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileArchive className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{pendingFile.name}</span>
          </div>

          {validating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("lblValidatingBundle")}
            </div>
          )}

          {validationError && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t("lblBundleValid")}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("title")}: </span>
                  <span className="font-medium">{preview.title}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("slug")}: </span>
                  <span className="font-medium">{preview.slug}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("author")}: </span>
                  <span className="font-medium">{preview.author?.nickname}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("category")}: </span>
                  <span className="font-medium">{preview.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("card_count")}: </span>
                  <span className="font-medium">{preview.card_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("courseLicense")}: </span>
                  <span className="font-medium">{preview.license}</span>
                </div>
              </div>

              {importError && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetUploadState} disabled={importing}>
                  {t("lblCancel")}
                </Button>
                <Button onClick={handleConfirmImport} disabled={importing}>
                  {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("lblConfirmRegister")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-4">
          {t("lblRegisteredCourses").replace("{count}", String(courses.length))}
        </h2>

        {loading ? (
          <div className="text-sm text-muted-foreground">{t("loading")}</div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p>{t("lblNoCourses")}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((courseItem) => {
              const tutorAgent = agents.find((a) => a.id === courseItem.agent_id);
              const chapterCount = countChapters(courseItem.toc);
              const cardCount = courseItem.cards?.length ?? 0;
              return (
                <CourseCard
                  key={courseItem.id}
                  title={courseItem.title}
                  description={courseItem.description}
                  thumbnail={courseItem.thumbnail}
                  category={courseItem.category || null}
                  agentName={tutorAgent?.name || null}
                  author={courseItem.author_nickname || null}
                  totalChapters={chapterCount || null}
                  totalCards={cardCount || null}
                  license={courseItem.license || null}
                  targetAge={courseItem.target_age || null}
                  enrollmentStatus={null}
                  onCardClick={() => navigate(`/courses/${courseItem.slug}`)}
                  footerAction={{ kind: "delete", loading: deletingId === courseItem.id, onClick: () => handleDelete(courseItem) }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
