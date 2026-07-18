import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { BookOpen } from "lucide-react";
import { useLanguage } from "@/lib/context/LanguageContext";

const BYPASS_CHECKPOINT_KEY = "open-tutorials-bypass-checkpoint";

export default function SettingsCourse() {
  const [bypassCheckpoint, setBypassCheckpoint] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    setBypassCheckpoint(localStorage.getItem(BYPASS_CHECKPOINT_KEY) === "true");
  }, []);

  const handleToggle = (checked: boolean) => {
    setBypassCheckpoint(checked);
    localStorage.setItem(BYPASS_CHECKPOINT_KEY, checked ? "true" : "false");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-md">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <BookOpen className="size-5" />
            <CardTitle className="text-xl">{t("courseSettings")}</CardTitle>
          </div>
          <CardDescription>
            {t("courseSettingsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="space-y-1">
              <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 block">
                {t("bypassCheckpoint")}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("bypassCheckpointDesc")}
              </p>
            </div>
            <Switch checked={bypassCheckpoint} onCheckedChange={handleToggle} className="mt-1 shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
