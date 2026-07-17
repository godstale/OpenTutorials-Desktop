# Wiki Lint Report — 2026-07-17

Scanned 117 pages.

## Structural Issues

### Orphan Pages (no inbound links)
- `wiki\concepts\AITutorExclusivePersonaSetup.md`
- `wiki\concepts\AuthenticationTroubleshooting.md`
- `wiki\concepts\CourseCreatorAgent.md`
- `wiki\concepts\EmailVerificationTroubleshooting.md`
- `wiki\concepts\HermesDashboardAPI.md`
- `wiki\concepts\HiddenMessageParsing.md`
- `wiki\concepts\IframeSecurityTrilemma.md`
- `wiki\concepts\NextJs15CacheIssue.md`
- `wiki\concepts\OpenTutorLocalArchitecture.md`
- `wiki\concepts\SSOBypassSupabaseStorage.md`
- `wiki\concepts\VercelPreviewOAuthTroubleshooting.md`
- `wiki\concepts\VivoAcademyMigration.md`
- `wiki\concepts\WindowsZipPathHandling.md`
- `wiki\originals\hermes-agent.md`
- `wiki\originals\hermes-api-server.md`
- `wiki\originals\hermes-architecture.md`
- `wiki\originals\hermes-dashboard-api.md`
- `wiki\originals\hermes-guide-pytorch-kr.md`
- `wiki\originals\hermes-messaging.md`
- `wiki\originals\hermes-quickstart.md`
- `wiki\sources\2026-06-21-pennypress-phase3.md`
- `wiki\sources\2026-06-22-pennypress-phase3-detailed.md`
- `wiki\sources\2026-06-23-auth-redirect-bugfix.md`
- `wiki\sources\2026-06-28-ai-tutor-hidden-message.md`
- `wiki\sources\2026-06-28-ai-tutor-integration.md`
- `wiki\sources\2026-06-28-ai-tutor-url-clickable.md`
- `wiki\sources\2026-06-28-sidebar-settings-overhaul.md`
- `wiki\sources\2026-06-28-sso-bypass-supabase-storage.md`
- `wiki\sources\2026-06-30-admin-package-card-background-fix.md`
- `wiki\sources\2026-06-30-admin-package-layout-improvements.md`
- `wiki\sources\2026-06-30-course-package-improvements.md`
- `wiki\sources\2026-06-30-course-package-preview-and-naming-improvements.md`
- `wiki\sources\2026-06-30-course-package-thumbnail-and-dashboard-improvements.md`
- `wiki\sources\2026-06-30-dashboard-course-count-fix.md`
- `wiki\sources\2026-06-30-dashboard-package-progress-and-admin-edit-manifest.md`
- `wiki\sources\2026-06-30-my-courses-filtering-and-naming-improvements.md`
- `wiki\sources\2026-07-01-admin-course-deletion-recursion-fix.md`
- `wiki\sources\2026-07-01-admin-course-upload-schema-cache-fallback.md`
- `wiki\sources\2026-07-01-admin-orphaned-courses-cleanup.md`
- `wiki\sources\2026-07-01-course-detail-layout-and-versioning-improvements.md`
- `wiki\sources\2026-07-01-integrated-courses-manifest-and-rules.md`
- `wiki\sources\2026-07-01-my-courses-and-course-detail-layout-fixes.md`
- `wiki\sources\2026-07-01-user-admin-dashboard-ui-improvements.md`
- `wiki\sources\2026-07-04-opentutor-local-desktop-refactoring.md`
- `wiki\sources\2026-07-04-unified-course-bundle-upload-refactoring.md`
- `wiki\sources\2026-07-05-agent-advanced-metadata-and-model-management.md`
- `wiki\sources\2026-07-05-agent-stats-real-duration.md`
- `wiki\sources\2026-07-05-agent-ui-cleanup-and-chat-logger.md`
- `wiki\sources\2026-07-05-course-enrollment-and-agent-stats-chart.md`
- `wiki\sources\2026-07-05-harness-agent-model-view-improvement.md`
- `wiki\sources\2026-07-05-react-player-v3-api-migration-fix.md`
- `wiki\sources\2026-07-05-release-preparation-archiving-documentation.md`
- `wiki\sources\2026-07-05-video-card-content-not-rendering-fix.md`
- `wiki\sources\2026-07-05-video-playback-and-sidebar-hydration-fix.md`
- `wiki\sources\2026-07-11-course-search-error-and-ui-cleanup.md`
- `wiki\sources\2026-07-12-cors-preflight-bugfix.md`
- `wiki\sources\2026-07-12-course-list-cache-bugfix.md`
- `wiki\sources\2026-07-12-neural-network-course-missing-fix.md`
- `wiki\sources\admin-api-500-error.md`
- `wiki\sources\admin-api-build-error-fix.md`
- `wiki\sources\admin-course-upload-bugfix.md`
- `wiki\sources\admin-course-upload-improvements.md`
- `wiki\sources\admin-ui-fixes.md`
- `wiki\sources\database-schema.md`
- `wiki\sources\design-system.md`
- `wiki\sources\external-agent-kanban-integration.md`
- `wiki\sources\external-hermes-agent-integration.md`
- `wiki\sources\hermes-agent-security-architecture.md`
- `wiki\sources\hermes-agent.md`
- `wiki\sources\hermes-api-server.md`
- `wiki\sources\hermes-architecture.md`
- `wiki\sources\hermes-dashboard-api.md`
- `wiki\sources\hermes-guide-pytorch-kr.md`
- `wiki\sources\hermes-messaging.md`
- `wiki\sources\hermes-quickstart.md`
- `wiki\sources\install-actual-hermes-wsl2.md`
- `wiki\sources\loading-empty-states.md`
- `wiki\sources\my-courses-detail-and-unsubscription.md`
- `wiki\sources\pennypress-service-plan.md`
- `wiki\sources\pennypress-service-spec.md`
- `wiki\sources\sidebar-unimplemented-menus-update.md`
- `wiki\sources\supabase-setup.md`
- `wiki\sources\windows-zip-path-bugfix.md`

## Graph-Aware Issues

### Hub Pages with Insufficient Content (0 pages)
No hub stubs detected — all high-degree nodes have sufficient content.

### Fragile Bridges (1 community pairs)
These community connections rely on a single edge — one broken link isolates them:
- Community 8 ↔ Community 73 via `sources/external-agent-kanban-integration` → `concepts/ExternalHermesAgent`

### Isolated Communities (7 communities)
These communities have zero external connections — knowledge silos:

| Community | Nodes | Members |
|---|---|---|
| 2 | 2 | concepts/CourseCreatorAgent, sources/vivo-lecture-guidelines |
| 4 | 5 | concepts/HermesWorkerAPI, concepts/Phase2Plan, concepts/SSEUpdates, concepts/SupabaseSchema, sources/2026-06-12-pennypress-phase2 |
| 12 | 2 | concepts/VivoAcademyMigration, sources/2026-06-26-ai-agent-course-integration |
| 14 | 2 | originals/admin-ui-fixes-20260623, sources/admin-ui-fixes |
| 61 | 3 | concepts/NextJs15CacheIssue, sources/admin-course-preview-bugfix, sources/course-learn-page-bugfix |
| 69 | 5 | concepts/HermesArchitecture, concepts/HermesCron, concepts/HermesSecurity, concepts/HermesSkills, sources/hermes-guide |
| 72 | 2 | concepts/HydraAgentGuideline, sources/hydra-agent-guideline |
