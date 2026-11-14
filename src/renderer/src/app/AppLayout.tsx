import { useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { Button, IconButton } from '@renderer/components/Button';
import { Toaster } from '@renderer/components/Toaster';
import { cx } from '@renderer/lib/cx';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';
import { ROUTE_PATTERNS, routes } from './routes';
import { SettingsDialog } from './SettingsDialog';
import { useTheme } from './useTheme';
import styles from './AppLayout.module.css';

/** The frame around every screen: brand, primary navigation, theme and settings. */
export function AppLayout() {
  const { settings } = useLibrary();
  const updateSettings = useLibraryStore((state) => state.updateSettings);
  const theme = useTheme(settings.theme);
  const navigate = useNavigate();
  const isImporting = useMatch(ROUTE_PATTERNS.import) !== null;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const toggleTheme = (): void => {
    void updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }).catch(reportError);
  };

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <Link to={routes.library()} className={styles.brand} aria-label="VOD Reviewer, home">
          VOD<span>{'//'}</span>Reviewer
        </Link>

        <nav aria-label="Primary">
          <NavLink
            to={routes.library()}
            end
            className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
          >
            Library
          </NavLink>
          <NavLink
            to={routes.sessionNotes()}
            className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
          >
            Session notes
          </NavLink>
        </nav>

        <div className={styles.tools}>
          <Button variant="primary" icon="plus" disabled={isImporting} onClick={() => void navigate(routes.import())}>
            Add video
          </Button>
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          />
          <IconButton icon="settings" label="Settings" onClick={() => setIsSettingsOpen(true)} />
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      {isSettingsOpen && <SettingsDialog onClose={() => setIsSettingsOpen(false)} />}
      <Toaster />
    </div>
  );
}
