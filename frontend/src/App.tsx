import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '@/components/layout/navbar';
import { Projects } from '@/pages/projects';
import { ProjectTasks } from '@/pages/project-tasks';

import { Settings } from '@/pages/Settings';
import { McpServers } from '@/pages/McpServers';
import { DisclaimerDialog } from '@/components/DisclaimerDialog';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { PrivacyOptInDialog } from '@/components/PrivacyOptInDialog';
import { ConfigProvider, useConfig } from '@/components/config-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { ArchiveProvider } from '@/contexts/ArchiveContext';
import type { EditorType, ExecutorConfig } from 'shared/types';
import { configApi } from '@/lib/api';
import * as Sentry from '@sentry/react';
import { Loader } from '@/components/ui/loader';
import { GitHubLoginDialog } from '@/components/GitHubLoginDialog';
import { GlitterTrail } from '@/components/GlitterTrail';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { offlineStorage } from '@/lib/offline-storage';
import { cachedApi } from '@/lib/cached-api';
import { registerSW } from 'virtual:pwa-register';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

function AppContent() {
  const { config, updateConfig, loading } = useConfig();
  const [localPixieMode, setLocalPixieMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('vibe-kanban-pixie-mode');
    return stored === 'true';
  });
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPrivacyOptIn, setShowPrivacyOptIn] = useState(false);
  const [showGitHubLogin, setShowGitHubLogin] = useState(false);
  const showNavbar = true;
  const { isOnline } = useOfflineStatus();

  // Initialize offline storage
  useEffect(() => {
    offlineStorage.initialize().catch(console.error);
  }, []);

  // Register service worker (only on HTTPS or localhost)
  useEffect(() => {
    const isSecureContext = window.isSecureContext;
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '[::1]';
    
    if (isSecureContext || isLocalhost) {
      const updateSW = registerSW({
        onNeedRefresh() {
          // Optionally show a prompt to reload
          console.log('New content available, please refresh');
        },
        onOfflineReady() {
          console.log('App ready for offline use');
        },
        onRegisterError(error) {
          console.warn('Service worker registration failed:', error);
        },
      });

      return () => {
        updateSW();
      };
    } else {
      console.info('Service worker disabled: requires HTTPS or localhost');
    }
  }, []);

  // Handle page visibility changes and sync data
  usePageVisibility(
    async () => {
      // Page became visible - sync offline changes
      if (isOnline) {
        try {
          await cachedApi.syncOfflineChanges();
        } catch (error) {
          console.error('Failed to sync offline changes:', error);
        }
      }
    },
    () => {
      // Page is being hidden - could save state here if needed
    }
  );

  // Sync offline changes when coming back online
  useEffect(() => {
    if (isOnline) {
      cachedApi.syncOfflineChanges().catch(console.error);
    }
  }, [isOnline]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'vibe-kanban-pixie-mode') {
        setLocalPixieMode(e.newValue === 'true');
      }
    };

    const handleCustomEvent = () => {
      const stored = localStorage.getItem('vibe-kanban-pixie-mode');
      setLocalPixieMode(stored === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('pixie-mode-changed', handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('pixie-mode-changed', handleCustomEvent);
    };
  }, []);

  useEffect(() => {
    if (config) {
      setShowDisclaimer(!config.disclaimer_acknowledged);
      if (config.disclaimer_acknowledged) {
        setShowOnboarding(!config.onboarding_acknowledged);
        if (config.onboarding_acknowledged) {
          if (!config.github_login_acknowledged) {
            setShowGitHubLogin(true);
          } else if (!config.telemetry_acknowledged) {
            setShowPrivacyOptIn(true);
          }
        }
      }
    }
  }, [config]);

  const handleDisclaimerAccept = async () => {
    if (!config) return;

    updateConfig({ disclaimer_acknowledged: true });

    try {
      await configApi.saveConfig({ ...config, disclaimer_acknowledged: true });
      setShowDisclaimer(false);
      setShowOnboarding(!config.onboarding_acknowledged);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleOnboardingComplete = async (onboardingConfig: {
    executor: ExecutorConfig;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      onboarding_acknowledged: true,
      executor: onboardingConfig.executor,
      editor: onboardingConfig.editor,
    };

    updateConfig(updatedConfig);

    try {
      await configApi.saveConfig(updatedConfig);
      setShowOnboarding(false);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handlePrivacyOptInComplete = async (telemetryEnabled: boolean) => {
    if (!config) return;

    const updatedConfig = {
      ...config,
      telemetry_acknowledged: true,
      analytics_enabled: telemetryEnabled,
    };

    updateConfig(updatedConfig);

    try {
      await configApi.saveConfig(updatedConfig);
      setShowPrivacyOptIn(false);
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleGitHubLoginComplete = async () => {
    try {
      // Refresh the config to get the latest GitHub authentication state
      const latestConfig = await configApi.getConfig();
      updateConfig(latestConfig);
      setShowGitHubLogin(false);

      // If user skipped (no GitHub token), we need to manually set the acknowledgment

      const updatedConfig = {
        ...latestConfig,
        github_login_acknowledged: true,
      };
      updateConfig(updatedConfig);
      await configApi.saveConfig(updatedConfig);
    } catch (err) {
      console.error('Error refreshing config:', err);
    } finally {
      if (!config?.telemetry_acknowledged) {
        setShowPrivacyOptIn(true);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  return (
    <ThemeProvider initialTheme={config?.theme || 'system'}>
      <div className="h-screen flex flex-col bg-background">
        <OfflineIndicator />
        {localPixieMode && <GlitterTrail />}
        <GitHubLoginDialog
          open={showGitHubLogin}
          onOpenChange={handleGitHubLoginComplete}
        />
        <DisclaimerDialog
          open={showDisclaimer}
          onAccept={handleDisclaimerAccept}
        />
        <OnboardingDialog
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
        />
        <PrivacyOptInDialog
          open={showPrivacyOptIn}
          onComplete={handlePrivacyOptInComplete}
        />
        {showNavbar && <Navbar />}
        <div className="flex-1 overflow-y-scroll">
          <SentryRoutes>
            <Route path="/" element={<Projects />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<Projects />} />
            <Route
              path="/projects/:projectId/tasks"
              element={<ProjectTasks />}
            />
            <Route
              path="/projects/:projectId/tasks/:taskId"
              element={<ProjectTasks />}
            />

            <Route path="/settings" element={<Settings />} />
            <Route path="/mcp-servers" element={<McpServers />} />
          </SentryRoutes>
        </div>
      </div>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider>
        <ArchiveProvider>
          <AppContent />
        </ArchiveProvider>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
