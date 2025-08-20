import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  const updateSW = registerSW({
    onRegistered(r: any) {
      console.log('Service Worker registered:', r);
    },
    onRegisterError(error: any) {
      console.error('Service Worker registration error:', error);
    },
    onNeedRefresh() {
      // New content available, prompt user to refresh
      if (confirm('New content available! Click OK to refresh.')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    }
  });

  return updateSW;
}