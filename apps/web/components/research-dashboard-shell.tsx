'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ArrowRight,
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  FlaskConical,
  Folder,
  Home,
  Menu,
  Network,
  Palette,
  Search,
  Star,
  Upload,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { workspaceThemes, type WorkspaceTheme, templates } from '@terralab/shared';
import { useStudio } from '@/lib/store';
import { NetworkLogo } from './network-logo';
import { CollaborationLink } from './collaboration-link';
import { Button } from './ui/button';
import type { View } from './research-dashboard';

const sections = [
  { label: 'Projects', view: 'My Projects', icon: Folder },
  { label: 'Experiments', view: 'Recent Experiments', icon: FlaskConical },
  { label: 'Shared with me', view: 'Shared With Me', icon: Users },
  { label: 'Team Projects', view: 'Team Projects', icon: UsersRound },
  { label: 'Templates', view: 'Saved Network Templates', icon: FileText },
  { label: 'Starred', view: 'Starred Projects', icon: Star },
  { label: 'Archived', view: 'Archived Projects', icon: Archive },
  { label: 'Teams', view: 'Teams', icon: UsersRound },
] as const;

export function ResearchDashboardShell({
  view,
  onView,
  onAccount,
  onStudio,
  onCreate,
  onImport,
  onExport,
  onTemplate,
  authText,
  email,
  stats,
  demo,
  children,
}: {
  view: View;
  onView: (view: View) => void;
  onAccount?: () => void;
  onStudio: () => void;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
  onTemplate: (id: string) => void;
  authText: string;
  email?: string | null;
  stats: { projects: number; experiments: number; running: number; shared: number; team: number };
  demo: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const theme = useStudio((s) => s.project.canvas.theme);
  const edit = useStudio((s) => s.edit);
  function navigate(next: View) {
    onView(next);
    setMenuOpen(false);
    if (menuOpen) menuButton.current?.focus();
  }
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k' &&
        !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Search research workspace"]')
          ?.focus();
      }
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [menuOpen]);
  // Keep collapsed navigation out of the keyboard order on small screens.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    function sync() {
      if (navRef.current) navRef.current.inert = media.matches && !menuOpen;
    }
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [menuOpen]);
  const cards = [
    {
      label: 'My Projects',
      value: stats.projects,
      caption: 'saved projects',
      icon: Folder,
      tone: 'teal',
      view: 'My Projects',
    },
    {
      label: 'Experiments',
      value: stats.experiments,
      caption: stats.running + ' running',
      icon: FlaskConical,
      tone: 'blue',
      view: 'Recent Experiments',
    },
    {
      label: 'Shared With Me',
      value: stats.shared,
      caption: 'accessible projects',
      icon: Users,
      tone: 'purple',
      view: 'Shared With Me',
    },
    {
      label: 'Team Projects',
      value: stats.team,
      caption: 'in team workspaces',
      icon: UsersRound,
      tone: 'amber',
      view: 'Team Projects',
    },
  ] as const;
  return (
    <div className="dashboard-shell">
      <a className="dashboard-skip" href="#workspace-content">
        Skip to workspace
      </a>
      {menuOpen && (
        <button
          className="dashboard-nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={navRef}
        id="dashboard-navigation"
        className={'dashboard-sidebar' + (menuOpen ? ' is-open' : '')}
      >
        <button className="dashboard-brand" onClick={() => navigate('Home')}>
          <NetworkLogo size={34} />
          <span>TERRALAB</span>
        </button>
        <nav aria-label="Research navigation">
          <CollaborationLink />
          <button
            className={view === 'Home' ? 'active' : ''}
            aria-current={view === 'Home' ? 'page' : undefined}
            onClick={() => navigate('Home')}
          >
            <Home size={18} />
            Home
          </button>
          {sections.map(({ label, view: next, icon: Icon }) => (
            <button
              key={next}
              aria-label={next}
              aria-current={view === next ? 'page' : undefined}
              className={view === next ? 'active' : ''}
              onClick={() => navigate(next)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="dashboard-settings">
          <p>Settings</p>
          <button onClick={onAccount} disabled={!onAccount}>
            <Users size={17} />
            Account
          </button>
          <button onClick={onStudio}>
            <Network size={17} />
            Open studio
            <ArrowRight size={13} />
          </button>
          <label className="dashboard-theme">
            <Palette size={17} />
            <span className="sr-only">Workspace theme</span>
            <select
              aria-label="Workspace theme"
              value={theme}
              onChange={(e) =>
                edit((p) => {
                  p.canvas.theme = e.target.value as WorkspaceTheme;
                })
              }
            >
              {workspaceThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="dashboard-sidebar-note">
          A space for better
          <br />
          positioning research.
        </p>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <button
            ref={menuButton}
            className="dashboard-menu-toggle"
            aria-label={menuOpen ? 'Hide navigation' : 'Show navigation'}
            aria-expanded={menuOpen}
            aria-controls="dashboard-navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <button
            className="dashboard-search-shortcut"
            aria-label="Focus workspace search"
            onClick={() =>
              document
                .querySelector<HTMLInputElement>('[aria-label="Search research workspace"]')
                ?.focus()
            }
          >
            <Search size={17} />
            <span>Search projects and experiments…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <Button onClick={onStudio}>
            <Network size={16} />
            Network studio
          </Button>
          <button
            className="dashboard-account"
            aria-label="Open account settings"
            onClick={onAccount}
            disabled={!onAccount}
          >
            <span className="dashboard-avatar">{email?.[0]?.toUpperCase() || 'T'}</span>
            <span>{email?.split('@')[0] || 'Local workspace'}</span>
            <ChevronRight size={14} />
          </button>
        </header>
        <div className="dashboard-layout" id="workspace-content" tabIndex={-1}>
          <div className="dashboard-main">
            <div className="dashboard-hero">
              <div>
                <h1>{view === 'My Projects' ? 'Project library' : 'Research workspace'}</h1>
                <p>Your projects, experiments, teams and shared research.</p>
              </div>
              <span className="dashboard-wordmark">
                TERRALAB<small>SIMULATE · ANALYZE · COLLABORATE</small>
              </span>
            </div>
            {view === 'Home' && demo}
            <div className="dashboard-stats">
              {cards.map(({ label, value, caption, icon: Icon, tone, view: next }) => (
                <button
                  key={label}
                  className={'dashboard-stat ' + tone}
                  onClick={() => navigate(next)}
                  aria-label={'View ' + label}
                >
                  <span className="dashboard-stat-icon">
                    <Icon size={25} />
                  </span>
                  <span>
                    <span className="dashboard-stat-label">{label}</span>
                    <strong>{value}</strong>
                    <small>
                      <i />
                      {caption}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {children}
            <footer className="dashboard-footer">
              <span>{authText}</span>
              <span>Counts reflect the loaded workspace index.</span>
            </footer>
          </div>
          <aside className="dashboard-right" aria-label="Workspace quick actions">
            <section className="dashboard-card">
              <h2>Quick Actions</h2>
              <p>Common tasks to get you started.</p>
              <div className="dashboard-quick-actions">
                {[
                  {
                    name: 'New Project',
                    description: 'Create a new research project',
                    icon: Folder,
                    action: onCreate,
                  },
                  {
                    name: 'Import Project',
                    description: 'Import from a JSON file',
                    icon: Upload,
                    action: onImport,
                  },
                  {
                    name: 'Export Project',
                    description: 'Export your current project',
                    icon: Download,
                    action: onExport,
                  },
                  {
                    name: 'Create from Template',
                    description: 'Start with a template',
                    icon: FilePlus2,
                    action: () => document.getElementById('dashboard-starters')?.focus(),
                  },
                ].map(({ name, description, icon: Icon, action }) => (
                  <button key={name} aria-label={name} onClick={action}>
                    <span className="dashboard-action-icon">
                      <Icon size={22} />
                    </span>
                    <span>
                      <b>{name}</b>
                      <small>{description}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            </section>
            <section
              className="dashboard-card dashboard-starters"
              id="dashboard-starters"
              tabIndex={-1}
            >
              <h2>Starter Networks</h2>
              <p>Browse example environments.</p>
              {templates.map((t) => (
                <button key={t.id} onClick={() => onTemplate(t.id)}>
                  <span className="dashboard-action-icon">
                    <Network size={21} />
                  </span>
                  <span>
                    <b>{t.name}</b>
                    <small>{t.description}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
