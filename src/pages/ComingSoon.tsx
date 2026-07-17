import { useLanguage } from "@/lib/context/LanguageContext";

export default function ComingSoon() {
  const { language } = useLanguage();
  return (
    <div className="text-center py-24 text-muted-foreground">
      <p>{language === "en" ? "This page isn't built yet." : "아직 준비되지 않은 페이지입니다."}</p>
    </div>
  );
}
