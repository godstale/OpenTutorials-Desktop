import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "@/lib/context/LanguageContext";

const BYPASS_CHECKPOINT_KEY = "open-tutorials-bypass-checkpoint";

export default function SettingsCourse() {
  const [bypassCheckpoint, setBypassCheckpoint] = useState(false);
  const { language } = useLanguage();

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
            <ShieldAlert className="size-5" />
            <CardTitle className="text-xl">{language === "en" ? "Course Learning Settings" : "강좌 학습 설정"}</CardTitle>
          </div>
          <CardDescription>
            {language === "en" ? "Configure course learning behavior and limitations." : "강좌 학습 진행 방식 및 제한 사항을 구성합니다."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <div className="space-y-1">
              <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 block">
                {language === "en" ? "Bypass Checkpoints" : "체크포인트 강제 건너뛰기"}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {language === "en"
                  ? "When enabled, allows you to bypass all checkpoint QnA locks set in the course and proceed to the next learning card directly."
                  : "활성화 시, 강좌에 설정된 모든 체크포인트 QnA 단계에서 잠금을 강제로 우회하고 다음 학습 카드로 진행할 수 있습니다. (체크포인트 통과 여부에 관계없이 바로 통과 가능)"}
              </p>
            </div>
            <Switch checked={bypassCheckpoint} onCheckedChange={handleToggle} className="mt-1 shrink-0" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
