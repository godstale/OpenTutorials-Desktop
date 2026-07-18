import { useLanguage } from "@/lib/context/LanguageContext";

export default function ComingSoon() {
  const { t } = useLanguage();
  return (
    <div className="text-center py-24 text-muted-foreground">
      <p>{t("comingSoonDesc")}</p>
    </div>
  );
}
