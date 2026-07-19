import { useEffect, useState } from "react";
import { Bot, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/context/LanguageContext";

const MAX_TOKENS_KEY = "open-tutorials-agent-max-tokens";
const COMPRESSION_THRESHOLD_KEY = "open-tutorials-agent-compression-threshold";

export default function SettingsAgent() {
  const { t } = useLanguage();
  const [maxTokens, setMaxTokens] = useState("16k");
  const [compressionThreshold, setCompressionThreshold] = useState(70);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const savedMaxTokens = localStorage.getItem(MAX_TOKENS_KEY);
    if (savedMaxTokens) setMaxTokens(savedMaxTokens);
    const savedThreshold = localStorage.getItem(COMPRESSION_THRESHOLD_KEY);
    if (savedThreshold) setCompressionThreshold(parseInt(savedThreshold, 10));
  }, []);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(""), 2000);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  const handleMaxTokensChange = (value: string) => {
    setMaxTokens(value);
    localStorage.setItem(MAX_TOKENS_KEY, value);
    setSavedMessage(t("lblMaxTokensChanged").replace("{value}", value));
  };

  const handleThresholdChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    setCompressionThreshold(parsed);
    localStorage.setItem(COMPRESSION_THRESHOLD_KEY, String(parsed));
    setSavedMessage(t("lblThresholdChanged").replace("{parsed}", String(parsed)));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-md transition-all duration-300 hover:shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Bot className="size-5" />
            <CardTitle className="text-xl">{t("agentSettings")}</CardTitle>
          </div>
          <CardDescription>
            {t("agentDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {savedMessage && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-950/50 text-sm">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{savedMessage}</span>
            </div>
          )}

          <div className="space-y-3">
            <Label htmlFor="max-tokens" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {t("maxTokens")}
            </Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Select value={maxTokens} onValueChange={handleMaxTokensChange}>
                <SelectTrigger id="max-tokens" className="w-[180px] bg-popover">
                  <SelectValue placeholder={t("lblSelectTokens")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4k">4k (4,096 tokens)</SelectItem>
                  <SelectItem value="8k">8k (8,192 tokens)</SelectItem>
                  <SelectItem value="16k">16k (16,384 tokens)</SelectItem>
                  <SelectItem value="32k">32k (32,768 tokens)</SelectItem>
                  <SelectItem value="64k">64k (65,536 tokens)</SelectItem>
                  <SelectItem value="128k">128k (131,072 tokens)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("maxTokensDesc")}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <Label htmlFor="compression-threshold" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {t("compressionThreshold")}
            </Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Select value={compressionThreshold.toString()} onValueChange={handleThresholdChange}>
                <SelectTrigger id="compression-threshold" className="w-[180px] bg-popover">
                  <SelectValue placeholder={t("lblSelectThreshold")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50%</SelectItem>
                  <SelectItem value="55">55%</SelectItem>
                  <SelectItem value="60">60%</SelectItem>
                  <SelectItem value="65">65%</SelectItem>
                  <SelectItem value="70">70%</SelectItem>
                  <SelectItem value="75">75%</SelectItem>
                  <SelectItem value="80">80%</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("compressionThresholdDesc")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
