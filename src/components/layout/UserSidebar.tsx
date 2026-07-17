import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Bot, BookOpen, Search, FolderCog, Settings } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants/routes";
import { useLanguage } from "@/lib/context/LanguageContext";

export function UserSidebar() {
  const { pathname } = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { t } = useLanguage();

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader
        className={cn(
          "h-16 flex flex-row items-center border-b transition-all duration-200",
          isCollapsed ? "px-2 justify-center" : "px-4 justify-start",
        )}
      >
        <Link
          to={ROUTES.DASHBOARD}
          className={cn(
            "font-bold text-sm flex items-center gap-2 w-full overflow-hidden whitespace-nowrap",
            isCollapsed ? "justify-center" : "justify-start",
          )}
        >
          <Bot className="size-5 text-primary flex-shrink-0" />
          {!isCollapsed && <span>Open Tutorials</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-8">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === ROUTES.DASHBOARD || pathname.startsWith(ROUTES.DASHBOARD + "/")}
                  tooltip={t("dashboard")}
                >
                  <Link to={ROUTES.DASHBOARD}>
                    <LayoutDashboard className="size-4" />
                    <span>{t("dashboard")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarSeparator className="my-2 mx-2" />

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={
                    pathname === ROUTES.COURSES ||
                    (pathname.startsWith(ROUTES.COURSES + "/") && !pathname.startsWith(ROUTES.COURSES_MANAGE))
                  }
                  tooltip={t("searchCourses")}
                >
                  <Link to={ROUTES.COURSES}>
                    <Search className="size-4" />
                    <span>{t("searchCourses")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === ROUTES.MY_COURSES || pathname.startsWith(ROUTES.MY_COURSES + "/")}
                  tooltip={t("myCourses")}
                >
                  <Link to={ROUTES.MY_COURSES}>
                    <BookOpen className="size-4" />
                    <span>{t("myCourses")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === ROUTES.COURSES_MANAGE || pathname.startsWith(ROUTES.COURSES_MANAGE + "/")}
                  tooltip={t("manageCourses")}
                >
                  <Link to={ROUTES.COURSES_MANAGE}>
                    <FolderCog className="size-4" />
                    <span>{t("manageCourses")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarSeparator className="my-2 mx-2" />

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === ROUTES.MY_AGENTS || pathname.startsWith(ROUTES.MY_AGENTS + "/")}
                  tooltip={t("manageAgents")}
                >
                  <Link to={ROUTES.MY_AGENTS}>
                    <Bot className="size-4" />
                    <span>{t("manageAgents")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarSeparator className="my-2 mx-2" />

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith(ROUTES.SETTINGS)} tooltip={t("settings")}>
                  <Link to={ROUTES.SETTINGS}>
                    <Settings className="size-4" />
                    <span>{t("settings")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
