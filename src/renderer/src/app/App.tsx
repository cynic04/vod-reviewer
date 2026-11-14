import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '@renderer/components/Button';
import { EmptyState } from '@renderer/components/EmptyState';
import { FocusPage } from '@renderer/features/focus/FocusPage';
import { ImportPage } from '@renderer/features/import/ImportPage';
import { FolderPage } from '@renderer/features/library/FolderPage';
import { LibraryPage } from '@renderer/features/library/LibraryPage';
import { ReviewPage } from '@renderer/features/review/ReviewPage';
import { SessionNotesPage } from '@renderer/features/session-notes/SessionNotesPage';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { AppLayout } from './AppLayout';
import { ErrorBoundary } from './ErrorBoundary';
import { ROUTE_PATTERNS, routes } from './routes';

/** Loads the library once and holds the rest of the app back until it is available. */
function LibraryGate({ children }: { children: ReactNode }) {
  const isLoaded = useLibraryStore((state) => state.library !== null);
  const loadError = useLibraryStore((state) => state.loadError);
  const load = useLibraryStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError !== null) {
    return (
      <EmptyState
        icon="folder"
        title="Your library could not be loaded"
        action={
          <Button variant="primary" onClick={() => void load()}>
            Try again
          </Button>
        }
      >
        {loadError}
      </EmptyState>
    );
  }

  return isLoaded ? children : null;
}

export function App() {
  return (
    <ErrorBoundary>
      <LibraryGate>
        {/* Hash routing, because a packaged Electron app is served from a file:// URL. */}
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path={ROUTE_PATTERNS.library} element={<LibraryPage />} />
              <Route path={ROUTE_PATTERNS.folder} element={<FolderPage />} />
              <Route path={ROUTE_PATTERNS.import} element={<ImportPage />} />
              <Route path={ROUTE_PATTERNS.focus} element={<FocusPage />} />
              <Route path={ROUTE_PATTERNS.review} element={<ReviewPage />} />
              <Route path={ROUTE_PATTERNS.sessionNotes} element={<SessionNotesPage />} />
              <Route path={ROUTE_PATTERNS.folderSessionNotes} element={<SessionNotesPage />} />
              <Route path="*" element={<Navigate to={routes.library()} replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </LibraryGate>
    </ErrorBoundary>
  );
}
