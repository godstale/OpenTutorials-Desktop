import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Globe, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { db, LOCAL_USER_ID } from "@/lib/db/client";
import { useLanguage } from "@/lib/context/LanguageContext";

export default function SettingsProfile() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: profile, error } = await db
          .from("user_profiles")
          .select("*")
          .eq("id", LOCAL_USER_ID)
          .maybeSingle();

        if (error) throw new Error(error.message);

        if (profile) {
          setNickname(profile.nickname || "");
          setEmail(profile.email || "");
          setHomepageUrl(profile.homepage_url || "");
        } else {
          setNickname("Local User");
          setEmail("user@opentutor.local");
          setHomepageUrl("");
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
        setError(t("errProfileLoadFailed"));
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [t]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!nickname.trim()) {
      setError(t("errNicknameRequired"));
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("errEmailInvalid"));
      return;
    }

    if (homepageUrl.trim()) {
      const url = homepageUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        setError(t("errHomepageUrlPrefix"));
        return;
      }
      try {
        new URL(url);
      } catch {
        setError(t("errHomepageUrlInvalid"));
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await db.from("user_profiles").upsert({
        id: LOCAL_USER_ID,
        nickname: nickname.trim(),
        email: email.trim() || null,
        homepage_url: homepageUrl.trim() || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw new Error(error.message);

      setSuccess(t("lblProfileSaved"));
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err: any) {
      console.error("Failed to save user profile:", err);
      setError(err.message || t("errProfileSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-md">
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              {t("lblLoadingProfile")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <form onSubmit={handleSave}>
        <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <User className="size-5" />
              <CardTitle className="text-xl">{t("profileSettings")}</CardTitle>
            </div>
            <CardDescription>
              {t("lblProfileSettingsDesc")}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-950/50 text-sm">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-950/50 text-sm">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="nickname" className="text-sm font-semibold flex items-center gap-1.5">
                {t("nickname")} <span className="text-rose-500 font-bold">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t("lblNicknamePlaceholder")}
                  className="pl-9"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("lblNicknameDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">
                {t("email")}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("lblEmailDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="homepageUrl" className="text-sm font-semibold">
                {t("lblHomepageUrl")}
              </Label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="homepageUrl"
                  type="text"
                  value={homepageUrl}
                  onChange={(e) => setHomepageUrl(e.target.value)}
                  placeholder="https://myblog.com"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("lblHomepageUrlDesc")}
              </p>
            </div>
          </CardContent>

          <CardFooter className="border-t border-zinc-100 dark:border-zinc-800/80 pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="text-white bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700 px-6 gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("saveBtn")
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
