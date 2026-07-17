import { Link, Outlet, useLocation } from "react-router-dom";
import { User, Bot, BookOpen, Palette, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/context/LanguageContext";
import { ROUTES } from "@/lib/constants/routes";

const SETTINGS_NAV = [
  { key: "tabProfile", href: ROUTES.SETTINGS_PROFILE, icon: User },
  { key: "tabAgent", href: ROUTES.SETTINGS_AGENT, icon: Bot },
  { key: "tabCourse", href: ROUTES.SETTINGS_COURSE, icon: BookOpen },
  { key: "tabUI", href: ROUTES.SETTINGS_UI, icon: Palette },
] as const;

export function SettingsLayout() {
  const { pathname } = useLocation();
  const { t } = useLanguage();

  const handleResetAll = () => {
    const ok = window.confirm(t("resetAllConfirm"));
    if (!ok) return;

    localStorage.removeItem("font-preference");
    localStorage.removeItem("open-tutorials-toc-width");
    localStorage.removeItem("open-tutorials-tutor-width");
    localStorage.removeItem("open-tutorials-agent-max-tokens");
    localStorage.removeItem("open-tutorials-agent-compression-threshold");
    localStorage.removeItem("open-tutorials-bypass-checkpoint");
    localStorage.removeItem("open-tutorials-language-preference");
    localStorage.removeItem("open-tutorials-learn-layout");
    localStorage.removeItem("open-tutorials-hide-register-banner");

    document.documentElement.classList.remove("font-noto-sans-active");

    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settings")}</h1>
          <p className="text-muted-foreground mt-2">{t("settingsDesc")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetAll}
          className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-200 border-zinc-200 dark:border-zinc-800"
        >
          <RotateCcw className="size-4" />
          <span>{t("resetAll")}</span>
        </Button>
      </div>

      <div className="flex gap-8 items-start">
        <nav className="w-48 shrink-0 flex flex-col gap-1">
          {SETTINGS_NAV.map(({ key, href, icon: Icon }) => (
            <Link
              key={href}
              to={href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                pathname === href || pathname.startsWith(href + "/")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
