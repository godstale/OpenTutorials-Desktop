import { useEffect, useState } from "react";
import { Cpu, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/context/LanguageContext";

const MAX_TOKENS_KEY = "open-tutorials-agent-max-tokens";
const COMPRESSION_THRESHOLD_KEY = "open-tutorials-agent-compression-threshold";

export default function SettingsAgent() {
  const { language } = useLanguage();
  const [maxTokens, setMaxTokens] = useState("32k");
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
    setSavedMessage(
      language === "en" ? `Max tokens of default agent changed to ${value}.` : `기본 에이전트의 최대 토큰 수가 ${value}으로 변경되었습니다.`,
    );
  };

  const handleThresholdChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    setCompressionThreshold(parsed);
    localStorage.setItem(COMPRESSION_THRESHOLD_KEY, String(parsed));
    setSavedMessage(
      language === "en" ? `Auto-compression threshold changed to ${parsed}%.` : `자동 압축 시작 임계값이 ${parsed}%로 변경되었습니다.`,
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-zinc-200/80 dark:border-zinc-800 shadow-md transition-all duration-300 hover:shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Cpu className="size-5" />
            <CardTitle className="text-xl">{language === "en" ? "Default Agent Settings" : "기본 에이전트 설정"}</CardTitle>
          </div>
          <CardDescription>
            {language === "en"
              ? "Configure performance parameters for the default agent and model."
              : "기본으로 사용할 에이전트 및 모델의 성능 매개변수를 설정합니다."}
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
              {language === "en" ? "Max Tokens" : "최대 토큰 수 (Max Tokens)"}
            </Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Select value={maxTokens} onValueChange={handleMaxTokensChange}>
                <SelectTrigger id="max-tokens" className="w-[180px] bg-popover">
                  <SelectValue placeholder={language === "en" ? "Select Tokens" : "토큰 선택"} />
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
                {language === "en"
                  ? "Limits the maximum tokens the agent uses for generating responses or parsing context. Choose a recommended value based on your model."
                  : "에이전트가 응답 생성이나 문맥 파싱에 사용할 최대 토큰을 제한합니다. 모델과 요금 정책에 맞춰 권장 값을 선택하십시오."}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-zinc-800">
            <Label htmlFor="compression-threshold" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {language === "en" ? "Compression Threshold" : "자동 압축 시작 임계값 (Compression Threshold)"}
            </Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Select value={compressionThreshold.toString()} onValueChange={handleThresholdChange}>
                <SelectTrigger id="compression-threshold" className="w-[180px] bg-popover">
                  <SelectValue placeholder={language === "en" ? "Select Threshold" : "임계값 선택"} />
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
                {language === "en"
                  ? "Triggers automatic summarization/compression of chat history when the estimated prompt size exceeds the set percentage of max tokens (range 50% - 80%)."
                  : "대화방의 예상 프롬프트 크기가 최대 토큰 수 대비 설정 비율을 초과할 때, 이전 대화 기록을 자동으로 요약/압축하도록 트리거합니다. (50% ~ 80% 범위)"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
