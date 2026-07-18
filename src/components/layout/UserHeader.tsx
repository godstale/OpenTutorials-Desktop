import { Link, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ROUTES } from "@/lib/constants/routes";
import { useLearnLayout } from "@/lib/context/LearnLayoutContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Columns3, Columns2, Layout, User } from "lucide-react";
import { useLanguage } from "@/lib/context/LanguageContext";

export function UserHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isLearnPage = pathname.includes("/learn/");
  const { layout, setLayout } = useLearnLayout();
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center border-b bg-background px-6">
      <div className="flex-1 flex items-center justify-start">
        {!isLearnPage && <SidebarTrigger className="-ml-2" />}
      </div>

      <div className="flex-none flex items-center justify-center">
        {isLearnPage && (
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border text-xs">
            <Button
              variant={layout === "3-layout" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setLayout("3-layout")}
              className="h-8 px-2.5 gap-1.5 text-xs font-medium transition-all duration-200"
            >
              <Columns3 className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">{t("layout3Col")}</span>
            </Button>
            <Button
              variant={layout === "content-tutor" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setLayout("content-tutor")}
              className="h-8 px-2.5 gap-1.5 text-xs font-medium transition-all duration-200"
            >
              <Columns2 className="h-4 w-4 text-muted-foreground rotate-180" />
              <span className="hidden sm:inline">{t("layoutContentTutor")}</span>
            </Button>
            <Button
              variant={layout === "toc-content" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setLayout("toc-content")}
              className="h-8 px-2.5 gap-1.5 text-xs font-medium transition-all duration-200"
            >
              <Columns2 className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">{t("layoutTocContent")}</span>
            </Button>
            <Button
              variant={layout === "content-only" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setLayout("content-only")}
              className="h-8 px-2.5 gap-1.5 text-xs font-medium transition-all duration-200"
            >
              <Layout className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">{t("layoutContentOnly")}</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center justify-end gap-4">
        {isLearnPage ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("btnBack")}
          </Button>
        ) : (
          // Desktop app is single-user — no auth, so just a static profile link.
          <Link to={ROUTES.SETTINGS_PROFILE}>
            <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
      </div>
    </header>
  );
}
