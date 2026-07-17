import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/lib/context/LanguageContext";
import { UserLayout } from "@/components/layout/UserLayout";
import { SettingsLayout } from "@/components/layout/SettingsLayout";
import Dashboard from "@/pages/Dashboard";
import MyCourses from "@/pages/MyCourses";
import Courses from "@/pages/Courses";
import CourseDetail from "@/pages/CourseDetail";
import CoursesManage from "@/pages/CoursesManage";
import Agents from "@/pages/Agents";
import AgentDetail from "@/pages/AgentDetail";
import SettingsProfile from "@/pages/SettingsProfile";
import SettingsAgent from "@/pages/SettingsAgent";
import SettingsCourse from "@/pages/SettingsCourse";
import SettingsUI from "@/pages/SettingsUI";
import Learn from "@/pages/Learn";
import ComingSoon from "@/pages/ComingSoon";
import { ROUTES } from "@/lib/constants/routes";

// HashRouter (not BrowserRouter): Tauri's bundled asset protocol serves exact
// file paths with no SPA fallback, so a path-based history route 404s on
// refresh/deep-link once the app is packaged.
function App() {
  return (
    <LanguageProvider>
      <HashRouter>
        <Routes>
          <Route element={<UserLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/manage" element={<CoursesManage />} />
            <Route path="/courses/:slug" element={<CourseDetail />} />
            <Route path="/my-courses" element={<MyCourses />} />
            <Route path={ROUTES.MY_AGENTS} element={<Agents />} />
            <Route path={`${ROUTES.MY_AGENTS}/:id`} element={<AgentDetail />} />
            <Route path={ROUTES.SETTINGS} element={<Navigate to={ROUTES.SETTINGS_AGENT} replace />} />
            <Route element={<SettingsLayout />}>
              <Route path={ROUTES.SETTINGS_PROFILE} element={<SettingsProfile />} />
              <Route path={ROUTES.SETTINGS_AGENT} element={<SettingsAgent />} />
              <Route path={ROUTES.SETTINGS_COURSE} element={<SettingsCourse />} />
              <Route path={ROUTES.SETTINGS_UI} element={<SettingsUI />} />
            </Route>
            <Route path="/learn/:slug" element={<Learn />} />
            <Route path="*" element={<ComingSoon />} />
          </Route>
        </Routes>
      </HashRouter>
    </LanguageProvider>
  );
}

export default App;
