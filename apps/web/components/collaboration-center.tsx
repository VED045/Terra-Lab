'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { UsersRound, ArrowLeft, RefreshCw } from 'lucide-react';
import { deserializeProject } from '@terralab/shared';
import { supabase } from '@/lib/persistence';
import { researchRpc, recordRecent } from '@/lib/research';
import { useStudio } from '@/lib/store';
import { useLabView } from '@/lib/lab-view';
import { projectContent } from '@/lib/project-content';
import {
  collaborationState,
  sections,
  roleHelp,
  sharedResources,
  sharedActivity,
  stamp,
  eventText,
  invitationToken,
  type Section,
  type Peer,
  type Item,
  type Resource,
  type Role,
} from '@/lib/collaboration';
import { AccountDialog } from './account-dialog';
import { NetworkLogo } from './network-logo';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { PeerSearch, ProfileForm, RequestDialog, InviteDialog } from './collaboration-forms';

export default function CollaborationCenter() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider>
        <Center />
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
function Center() {
  const theme = useStudio((s) => s.project.canvas.theme),
    router = useRouter(),
    cache = useQueryClient();
  const [uid, setUid] = useState<string | null>(null),
    [checking, setChecking] = useState(true),
    [account, setAccount] = useState(false),
    [section, setSection] = useState<Section>('Overview');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [peer, setPeer] = useState<Peer | null>(null),
    [requestPeer, setRequestPeer] = useState<Peer | null>(null),
    [invite, setInvite] = useState(false);
  const [filter, setFilter] = useState('Received requests'),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('updated'),
    [selectedId, setSelectedId] = useState(''),
    [teamName, setTeamName] = useState(''),
    [assignment, setAssignment] = useState(''),
    [token, setToken] = useState('');
  const [decision, setDecision] = useState<{ item: Item; invitation: boolean; role: Role } | null>(
    null,
  );
  const mutation = useRef(false),
    generation = useRef(0),
    currentUid = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('terralab.active.v1'),
        state = useStudio.getState();
      if (raw && !state.dirty) {
        const saved = deserializeProject(raw);
        if (projectContent(saved) !== projectContent(state.project)) state.load(saved);
      }
    } catch {
      /* Preserve unreadable stored data for the existing editor recovery flow. */
    }
    const params = new URLSearchParams(location.search),
      target = params.get('section');
    if (sections.includes(target as Section)) setSection(target as Section);
    setSelectedId(params.get('resource') || '');
    const incoming = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (incoming) {
      setToken(incoming);
      setSection('Requests & Invitations');
      history.replaceState(null, '', location.pathname + location.search);
    }
    const db = supabase();
    if (!db) {
      setChecking(false);
      return;
    }
    let live = true,
      revision = 0;
    function apply(id: string | null) {
      if (!live) return;
      if (currentUid.current !== id) {
        generation.current++;
        currentUid.current = id;
        cache.clear();
        setUid(id);
        setPeer(null);
        setRequestPeer(null);
        setInvite(false);
        setDecision(null);
        setError('');
        setMessage('');
      }
      setChecking(false);
    }
    const { data } = db.auth.onAuthStateChange((_, session) => {
      revision++;
      apply(session?.user.id || null);
    });
    const initialRevision = revision;
    void db.auth
      .getSession()
      .then(({ data, error }) => {
        if (live && revision === initialRevision) {
          if (error) {
            setError(error.message);
            setChecking(false);
          } else apply(data.session?.user.id || null);
        }
      })
      .catch(() => {
        if (live) {
          setError('Could not check your session. Open Account to reconnect.');
          setChecking(false);
        }
      });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [cache]);
  const query = useQuery({
    queryKey: ['collaboration', uid],
    queryFn: collaborationState,
    enabled: !!uid,
  });
  const data = query.data?.user_id === uid ? query.data : undefined;
  function jump(next: Section, resource = '') {
    setSection(next);
    if (resource) setSelectedId(resource);
    const params = new URLSearchParams({ section: next });
    if (resource) params.set('resource', resource);
    history.replaceState(null, '', '/collaboration?' + params);
  }
  async function action(fn: () => Promise<unknown>, success = 'Saved.') {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const version = generation.current;
    try {
      await fn();
      if (version === generation.current) {
        await cache.invalidateQueries({ queryKey: ['collaboration', uid] });
        setMessage(success);
      }
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : 'Operation failed. Refresh and try again.');
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const owned = data?.resources.filter((r) => r.role === 'owner') || [],
    teams = owned.filter((r) => r.scope !== 'project'),
    selected = owned.find((r) => r.id === selectedId);
  const activity = data ? sharedActivity(data) : [];
  const incomingRequests =
      data?.requests.filter((r) => r.recipient_id === uid && r.status === 'pending') || [],
    incomingInvites =
      data?.invitations.filter((r) => r.recipient_id === uid && r.status === 'pending') || [];
  const sentRequests =
      data?.requests.filter((r) => r.initiator_id === uid && r.status === 'pending') || [],
    shared = data ? sharedResources(data, search, sort) : [];
  useEffect(() => {
    setAssignment(selected?.team_id || '');
  }, [selected?.id, selected?.team_id]);
  const peerRequest = data?.requests.find((r) => r.recipient_id === peer?.id),
    peerMember = data?.resources.some((r) => r.id === peer?.studio_id);
  const filters = [
    'Received requests',
    'Sent requests',
    'Received invitations',
    'Sent invitations',
    'Resolved',
  ];
  const items =
    (filter.includes('invitations')
      ? data?.invitations
      : filter === 'Resolved'
        ? [...(data?.requests || []), ...(data?.invitations || [])]
        : data?.requests) || [];
  const visibleItems = items.filter((i) =>
    filter === 'Resolved'
      ? i.status !== 'pending'
      : i.status === 'pending' &&
        (filter.startsWith('Received') ? i.recipient_id === uid : i.initiator_id === uid),
  );
  async function openResource(resource: Resource) {
    if (resource.scope !== 'project') {
      jump('Shared with me');
      setSearch('');
      setSelectedId(resource.id);
      return;
    }
    await action(async () => {
      if (
        useStudio.getState().dirty &&
        !confirm('Open this project and discard unsaved changes in the studio?')
      )
        return;
      const db = supabase();
      if (!db) throw Error('Sign in required');
      const { data, error } = await db
        .from('projects')
        .select('config')
        .eq('id', resource.id)
        .single();
      if (error || !data) throw Error('Project unavailable. Access may have been revoked.');
      const project = deserializeProject(JSON.stringify(data.config));
      useStudio.getState().load(project);
      useLabView.getState().clear();
      recordRecent(project.id);
      localStorage.setItem('terralab.active.v1', JSON.stringify(project));
      router.push('/studio');
    }, 'Opened project.');
  }
  function renderItem(item: Item, isInvitation: boolean) {
    const canDecide = item.recipient_id === uid && item.status === 'pending',
      canManage = item.initiator_id === uid;
    return (
      <article className="collab-item" key={item.id} id={'item-' + item.id} tabIndex={-1}>
        <div className="collab-row">
          <strong>{item.resource}</strong>
          <span className="collab-status">{item.status}</span>
        </div>
        <p>
          {isInvitation ? 'Invitation' : 'Access request'} · {item.scope} · {item.role}
          {item.granted_role && item.granted_role !== item.role
            ? ` → approved ${item.granted_role}`
            : ''}
        </p>
        <p>
          {item.initiator} → {item.recipient}
        </p>
        <small>
          {stamp(item.created_at)}
          {item.expires_at ? ` · Expires ${stamp(item.expires_at)}` : ''}
        </small>
        {item.message && <blockquote>{item.message}</blockquote>}
        <div className="research-inline">
          {canDecide && (
            <>
              <Button
                disabled={busy}
                onClick={() => setDecision({ item, invitation: isInvitation, role: item.role })}
              >
                Review & accept
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      researchRpc(
                        isInvitation ? 'decide_collaboration_invitation' : 'decide_access_request',
                        isInvitation
                          ? { p_id: item.id, p_action: 'reject' }
                          : { p_id: item.id, p_action: 'rejected' },
                      ),
                    'Rejected. No access granted.',
                  )
                }
              >
                Reject
              </Button>
            </>
          )}
          {!isInvitation && canManage && item.status === 'pending' && (
            <Button
              disabled={busy}
              onClick={() =>
                void action(
                  () =>
                    researchRpc('decide_access_request', { p_id: item.id, p_action: 'withdrawn' }),
                  'Request withdrawn.',
                )
              }
            >
              Withdraw
            </Button>
          )}
          {isInvitation && canManage && ['pending', 'expired'].includes(item.status) && (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      researchRpc('decide_collaboration_invitation', {
                        p_id: item.id,
                        p_action: 'revoke',
                      }),
                    'Invitation revoked. Existing membership is managed separately.',
                  )
                }
              >
                Revoke
              </Button>
              {item.recipient_id && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () =>
                        researchRpc('decide_collaboration_invitation', {
                          p_id: item.id,
                          p_action: 'renew',
                        }),
                      'Invitation renewed in-app for seven days. No email was sent.',
                    )
                  }
                >
                  {item.status === 'expired' ? 'Renew' : 'Resend'}
                </Button>
              )}
            </>
          )}
        </div>
      </article>
    );
  }
  return (
    <main className={`collab-page theme-${theme}`}>
      <a className="dashboard-skip" href="#collaboration-content">
        Skip to collaboration
      </a>
      <header className="collab-header">
        <Link className="collab-brand" href="/projects">
          <NetworkLogo size={30} />
          <span>TERRALAB</span>
        </Link>
        <div className="research-inline">
          <Link href="/projects">
            <ArrowLeft size={14} /> Projects
          </Link>
          <Button onClick={() => setAccount(true)}>Account</Button>
        </div>
      </header>
      <div className="collab-layout">
        <aside className="collab-sidebar">
          <h1>
            <UsersRound size={23} />
            Collaboration
          </h1>
          <p>People, shared research and access.</p>
          <nav aria-label="Collaboration sections">
            {sections.map((s) => (
              <button
                key={s}
                aria-current={section === s ? 'page' : undefined}
                onClick={() => jump(s)}
              >
                {s}
                {s === 'Requests & Invitations' &&
                  !!(incomingRequests.length + incomingInvites.length) && (
                    <span>{incomingRequests.length + incomingInvites.length}</span>
                  )}
              </button>
            ))}
          </nav>
          <p className="collab-scope-note">
            Studio membership covers assigned projects. Project access covers one project and its
            history.
          </p>
        </aside>
        <section className="collab-content" id="collaboration-content" tabIndex={-1}>
          <div className="collab-row">
            <h2>{section}</h2>
            {uid && (
              <div className="research-inline">
                <Button disabled={query.isFetching || busy} onClick={() => void query.refetch()}>
                  <RefreshCw size={14} /> Refresh
                </Button>
                <Button disabled={busy || !owned.length} onClick={() => setInvite(true)}>
                  Invite people
                </Button>
              </div>
            )}
          </div>
          {(error || query.error) && (
            <div className="collab-error" role="alert">
              {error || query.error?.message}
              <p>
                Check your session and permissions. If this is a missing-function error, the
                collaboration migration must be installed by the database administrator.
              </p>
            </div>
          )}
          {message && (
            <p role="status" className="collab-success">
              {message}
            </p>
          )}
          {checking || (uid && query.isPending) ? (
            <p role="status">Loading collaboration…</p>
          ) : !uid ? (
            <div className="collab-empty">
              <h3>
                {supabase() ? 'Sign in to collaborate' : 'Cloud collaboration is not configured'}
              </h3>
              <p>
                {supabase()
                  ? 'Use your TerraLab account to find peers and manage shared research.'
                  : 'Configure the existing Supabase service and install the documented migrations to use collaboration. Local scientific editing remains available.'}
              </p>
              {supabase() && <Button onClick={() => setAccount(true)}>Sign in</Button>}
              <Link href="/studio">Open studio</Link>
            </div>
          ) : (
            data && (
              <>
                {section === 'Overview' && (
                  <>
                    <div className="collab-stats">
                      {[
                        ['Incoming requests', incomingRequests.length],
                        ['Incoming invitations', incomingInvites.length],
                        ['Requests sent', sentRequests.length],
                        ['Unread notifications', data.unread],
                      ].map(([name, count]) => (
                        <div key={name}>
                          <strong>{count}</strong>
                          <span>{name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="research-inline">
                      <Button onClick={() => jump('People')}>Find a peer / Request access</Button>
                      <Button onClick={() => jump('Requests & Invitations')}>
                        Review requests
                      </Button>
                    </div>
                    <h3>Recently shared with you</h3>
                    {data.resources
                      .filter((r) => r.owner_id !== uid)
                      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
                      .slice(0, 5)
                      .map((r) => (
                        <div className="collab-row collab-item" key={r.id}>
                          <span>
                            <b>{r.name}</b>
                            <small>
                              {r.scope} · {r.owner_name} · {r.role}
                            </small>
                          </span>
                          <Button onClick={() => void openResource(r)}>Open</Button>
                        </div>
                      ))}
                    {!data.resources.some((r) => r.owner_id !== uid) && (
                      <p className="collab-empty">
                        No shared resources yet. Accepted access appears here.
                      </p>
                    )}
                    <div className="collab-row">
                      <h3>Notifications ({data.unread} unread)</h3>
                      <Button
                        disabled={busy || !data.unread}
                        onClick={() =>
                          void action(
                            () => researchRpc('mark_collaboration_read', {}),
                            'Notifications marked as read.',
                          )
                        }
                      >
                        Mark all as read
                      </Button>
                    </div>
                    <p>
                      Previews contain event types only. Open the relevant item to see currently
                      authorized details. Showing the latest 100 notifications.
                    </p>
                    {data.notifications.map((n) => (
                      <div
                        className={'collab-item' + (!n.read_at ? ' collab-unread' : '')}
                        key={n.id}
                      >
                        <div className="collab-row">
                          <span>
                            <b>{eventText(n.event)}</b>
                            <small>
                              {!n.read_at ? 'Unread · ' : ''}
                              {stamp(n.created_at)}
                            </small>
                          </span>
                          <div className="research-inline">
                            <Button
                              onClick={() => {
                                const request = data.requests.find((i) => i.id === n.item_id),
                                  invitation = data.invitations.find((i) => i.id === n.item_id);
                                if (request || invitation) {
                                  const item = request || invitation!;
                                  setFilter(
                                    item.status !== 'pending'
                                      ? 'Resolved'
                                      : `${item.recipient_id === uid ? 'Received' : 'Sent'} ${request ? 'requests' : 'invitations'}`,
                                  );
                                  jump('Requests & Invitations');
                                  requestAnimationFrame(() =>
                                    document.getElementById('item-' + n.item_id)?.focus(),
                                  );
                                } else {
                                  const resource = data.resources.find((r) => r.id === n.item_id);
                                  if (resource?.role === 'owner')
                                    jump('Manage access', resource.id);
                                  else {
                                    jump('Shared with me', n.item_id);
                                    setSearch(resource?.name || '');
                                  }
                                }
                                if (!n.read_at)
                                  void action(
                                    () => researchRpc('mark_collaboration_read', { p_id: n.id }),
                                    'Notification read.',
                                  );
                              }}
                            >
                              Open item
                            </Button>
                            {!n.read_at && (
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void action(
                                    () => researchRpc('mark_collaboration_read', { p_id: n.id }),
                                    'Notification read.',
                                  )
                                }
                              >
                                Mark as read
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!data.notifications.length && (
                      <p className="collab-empty">No notifications yet.</p>
                    )}
                    <h3>Recent shared-project activity</h3>
                    <p className="collab-activity-note">
                      Projects with current collaborators only. Recent saves are grouped by project
                      and day.
                    </p>
                    <ul className="collab-activity" aria-label="Shared-project activity">
                      {activity.map((a) => (
                        <li key={a.id}>
                          <div>
                            <strong>{a.project.name}</strong>
                            <span>
                              {a.event === 'revision_saved'
                                ? a.count === 1
                                  ? 'Revision saved'
                                  : `${a.count} revisions saved`
                                : eventText(a.event)}
                            </span>
                          </div>
                          <time dateTime={a.createdAt} title={stamp(a.createdAt)}>
                            {stamp(a.createdAt)}
                          </time>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void openResource(a.project)}
                          >
                            Open project
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {!activity.length && (
                      <p className="collab-empty">
                        No shared-project activity yet. Private saves stay in each project’s
                        history. Activity will appear here after another person has access.
                      </p>
                    )}
                  </>
                )}
                {section === 'People' && (
                  <>
                    <p>
                      Find an opted-in peer by their exact unique username or verified email.
                      Partial searches and private profiles are unavailable.
                    </p>
                    <PeerSearch onPeer={setPeer} disabled={busy} />
                    {peer && (
                      <article className="collab-item" aria-label="Peer profile">
                        <h3>{peer.name}</h3>
                        <p>@{peer.username}</p>
                        <p>
                          {peer.studio_name
                            ? `Studio: ${peer.studio_name}`
                            : 'This peer has not offered a studio.'}
                        </p>
                        {peerRequest && (
                          <p>
                            Latest studio request: {peerRequest.status} · requested{' '}
                            {peerRequest.role}
                            {peerRequest.granted_role
                              ? ` · approved ${peerRequest.granted_role}`
                              : ''}
                          </p>
                        )}
                        <Button
                          disabled={
                            busy ||
                            !peer.studio_id ||
                            peerMember ||
                            peerRequest?.status === 'pending'
                          }
                          onClick={() => setRequestPeer(peer)}
                        >
                          {peerMember ? 'Already a studio member' : 'Request studio access'}
                        </Button>
                        <h4>Explicitly shared with you</h4>
                        {sharedResources(data, '', 'name', peer.id).map((r) => (
                          <div className="collab-row" key={r.id}>
                            <span>
                              {r.name} · {r.scope} · {r.role}
                            </span>
                            <Button onClick={() => void openResource(r)}>Open</Button>
                          </div>
                        ))}
                        {!sharedResources(data, '', 'name', peer.id).length && (
                          <p>No resources from this peer are currently shared with you.</p>
                        )}
                      </article>
                    )}
                    <ProfileForm
                      key={JSON.stringify(data.profile)}
                      profile={data.profile}
                      teams={teams}
                      save={action}
                      busy={busy}
                    />
                  </>
                )}
                {section === 'Requests & Invitations' && (
                  <>
                    <nav className="collab-filters" aria-label="Request filters">
                      {filters.map((f) => (
                        <button
                          key={f}
                          aria-current={filter === f ? 'true' : undefined}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </nav>
                    <p>
                      Requests ask for access. Invitations offer access and require the recipient’s
                      acceptance.
                    </p>
                    {visibleItems.map((i) =>
                      renderItem(
                        i,
                        data.invitations.some((x) => x.id === i.id),
                      ),
                    )}
                    {!visibleItems.length && (
                      <p className="collab-empty">No {filter.toLowerCase()}.</p>
                    )}
                    <details className="collab-item" open={token ? true : undefined}>
                      <summary>Accept an invitation link</summary>
                      <form
                        className="research-inline"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(async () => {
                            await researchRpc('redeem_research_share', {
                              p_token: invitationToken(token),
                            });
                            setToken('');
                          }, 'Invitation accepted. See Shared with me.');
                        }}
                      >
                        <label className="collab-field">
                          Invitation URL or token
                          <input
                            aria-label="Invitation URL or token"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                          />
                        </label>
                        <Button type="submit" disabled={busy || !token.trim()}>
                          Accept link
                        </Button>
                      </form>
                      <p>
                        Legacy links can be reused until expiry or revocation and grant project
                        access with its full history. Do not accept an untrusted link.
                      </p>
                    </details>
                  </>
                )}
                {section === 'Shared with me' && (
                  <>
                    <div className="research-inline">
                      <label className="collab-field">
                        Search shared resources
                        <input value={search} onChange={(e) => setSearch(e.target.value)} />
                      </label>
                      <label>
                        Sort by
                        <select value={sort} onChange={(e) => setSort(e.target.value)}>
                          <option value="updated">Last updated</option>
                          <option value="name">Name</option>
                        </select>
                      </label>
                    </div>
                    {shared.map((r) => (
                      <article className="collab-item" key={r.id}>
                        <div className="collab-row">
                          <h3>{r.name}</h3>
                          <Button disabled={busy} onClick={() => void openResource(r)}>
                            {r.scope === 'project' ? 'Open' : 'Open workspace'}
                          </Button>
                        </div>
                        <p>
                          {r.scope} · Owner: {r.owner_name} · Effective role: {r.role}
                        </p>
                        <p>Access: {r.source}</p>
                        <small>
                          {r.scope === 'project' ? 'Updated' : 'Created'} {stamp(r.updated_at)}
                        </small>
                        {r.scope !== 'project' && selectedId === r.id && (
                          <>
                            <h4>Included projects</h4>
                            {data.resources
                              .filter((p) => p.scope === 'project' && p.team_id === r.id)
                              .map((p) => (
                                <div className="collab-row" key={p.id}>
                                  <span>
                                    {p.name} · {p.role}
                                  </span>
                                  <Button onClick={() => void openResource(p)}>Open</Button>
                                </div>
                              ))}
                            {!data.resources.some((p) => p.team_id === r.id) && (
                              <p>No projects are assigned to this workspace.</p>
                            )}
                          </>
                        )}
                      </article>
                    ))}
                    {!shared.length && (
                      <p className="collab-empty">
                        No matching shared resources. A pending request or invitation does not grant
                        access.
                      </p>
                    )}
                  </>
                )}
                {section === 'Manage access' && (
                  <>
                    <p>
                      Only resource owners manage grants. Studio/team membership includes assigned
                      projects, including future assignments. A project grant includes only that
                      project and its history. Independent grants can preserve access after another
                      grant is removed.
                    </p>
                    <form
                      className="research-inline"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () => {
                          await researchRpc('create_research_team', { p_name: teamName });
                          setTeamName('');
                        }, 'Workspace created. Designate it as your studio in People → Your peer profile.');
                      }}
                    >
                      <label className="collab-field">
                        New workspace name
                        <input
                          required
                          maxLength={80}
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        />
                      </label>
                      <Button type="submit" disabled={busy || !teamName.trim()}>
                        Create workspace
                      </Button>
                    </form>
                    <label>
                      Resource to manage
                      <select
                        value={selectedId}
                        onChange={(e) => {
                          setSelectedId(e.target.value);
                          setAssignment('');
                        }}
                      >
                        <option value="">Choose an owned resource</option>
                        {owned.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} · {r.scope}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selected ? (
                      <>
                        <h3>{selected.name}</h3>
                        <p>Owner: {selected.owner_name} · Ownership is protected.</p>
                        {data.members
                          .filter((m) => m.resource_id === selected.id)
                          .map((m, index) => (
                            <div className="collab-row collab-item" key={m.user_id + index}>
                              <span>
                                <b>{m.name}</b>
                                <small>
                                  {m.role} · {m.source}
                                </small>
                              </span>
                              {!m.source.startsWith('team:') &&
                              !m.source.startsWith('team owner:') &&
                              m.user_id !== uid ? (
                                <div className="research-inline">
                                  <label>
                                    Role for {m.name}
                                    <select
                                      disabled={busy}
                                      value={m.role}
                                      onChange={(e) => {
                                        const role = e.target.value;
                                        if (
                                          confirm(
                                            `Change ${m.name} to ${role} for ${selected.name} (${selected.scope})?`,
                                          )
                                        )
                                          void action(
                                            () =>
                                              researchRpc(
                                                selected.scope === 'project'
                                                  ? 'manage_project_member'
                                                  : 'manage_team_member',
                                                {
                                                  [selected.scope === 'project'
                                                    ? 'p_id'
                                                    : 'p_team']: selected.id,
                                                  p_user: m.user_id,
                                                  p_role: role,
                                                },
                                              ),
                                            'Role updated.',
                                          );
                                      }}
                                    >
                                      <option value="viewer">Viewer</option>
                                      <option value="editor">Editor</option>
                                    </select>
                                  </label>
                                  <Button
                                    disabled={busy}
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `Remove ${m.name} from ${selected.name}? Independent grants may still provide access.`,
                                        )
                                      )
                                        void action(
                                          () =>
                                            researchRpc(
                                              selected.scope === 'project'
                                                ? 'manage_project_member'
                                                : 'manage_team_member',
                                              {
                                                [selected.scope === 'project' ? 'p_id' : 'p_team']:
                                                  selected.id,
                                                p_user: m.user_id,
                                                p_role: null,
                                              },
                                            ),
                                          'Membership removed. Future reads use remaining grants only.',
                                        );
                                    }}
                                  >
                                    Remove access
                                  </Button>
                                </div>
                              ) : (
                                <small>Manage at the source team.</small>
                              )}
                            </div>
                          ))}
                        {!data.members.some((m) => m.resource_id === selected.id) && (
                          <p>No members have access. Invite a peer to offer access.</p>
                        )}
                        <h4>Pending requests and invitations</h4>
                        {data.requests
                          .filter((i) => i.resource_id === selected.id && i.status === 'pending')
                          .map((i) => renderItem(i, false))}
                        {data.invitations
                          .filter((i) => i.resource_id === selected.id && i.status === 'pending')
                          .map((i) => renderItem(i, true))}
                        {selected.scope === 'project' && (
                          <>
                            <h4>Workspace assignment</h4>
                            <p>
                              Current workspace:{' '}
                              {data.resources.find((r) => r.id === selected.team_id)?.name ||
                                'None'}
                              . Assignment shares this project with every member of the selected
                              workspace.
                            </p>
                            <div className="research-inline">
                              <label>
                                Assign to workspace
                                <select
                                  value={assignment}
                                  onChange={(e) => setAssignment(e.target.value)}
                                >
                                  <option value="">Private (no workspace)</option>
                                  {teams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <Button
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    confirm(
                                      'Apply workspace assignment? This changes inherited access to the project.',
                                    )
                                  )
                                    void action(
                                      () =>
                                        researchRpc('assign_project_team', {
                                          p_id: selected.id,
                                          p_team: assignment || null,
                                          p_expected: selected.version,
                                        }),
                                      'Workspace assignment updated. Reload before the next project edit.',
                                    );
                                }}
                              >
                                Apply assignment
                              </Button>
                            </div>
                            <LegacyLinks project={selected} busy={busy} action={action} />
                          </>
                        )}
                      </>
                    ) : (
                      <p className="collab-empty">
                        Select an owned resource to inspect access. Resources you can only view or
                        edit cannot be managed here.
                      </p>
                    )}
                    <p>
                      Revocation blocks future authorized requests. Previously downloaded exports,
                      browser snapshots and offline copies cannot be recalled. Revoke
                      pending/reusable invitation links separately to prevent new grants.
                    </p>
                  </>
                )}
              </>
            )
          )}
        </section>
      </div>
      <AccountDialog
        open={account}
        onOpenChange={setAccount}
        onSession={() => void query.refetch()}
      />
      {requestPeer && (
        <RequestDialog
          key={requestPeer.id}
          peer={requestPeer}
          onClose={() => setRequestPeer(null)}
          busy={busy}
          submit={(p, role, text) =>
            action(async () => {
              await researchRpc('request_studio_access', {
                p_peer: p.id,
                p_role: role,
                p_message: text,
              });
              setRequestPeer(null);
            }, 'Request sent. No access is granted until approval.')
          }
        />
      )}
      {invite && (
        <InviteDialog
          resources={owned}
          onClose={() => setInvite(false)}
          busy={busy}
          submit={(r, peers, role, text) =>
            action(async () => {
              await researchRpc('invite_collaboration_peers', {
                p_scope: r.scope,
                p_resource: r.id,
                p_peers: peers.map((p) => p.id),
                p_role: role,
                p_message: text,
              });
              setInvite(false);
            }, 'In-app invitations are available in Sent invitations. No email was sent.')
          }
        />
      )}
      <Dialog
        open={!!decision}
        onOpenChange={(v) => {
          if (!v && !busy) setDecision(null);
        }}
        title={decision?.invitation ? 'Accept invitation' : 'Approve access request'}
        description="Confirm the exact resource, role and scope before granting access."
      >
        {decision && (
          <div className="collab-form">
            <p>
              {decision.item.initiator} → {decision.item.recipient}
            </p>
            <p>
              {decision.item.resource} · {decision.item.scope}
            </p>
            {!decision.invitation && (
              <label>
                Approved role
                <select
                  value={decision.role}
                  onChange={(e) => setDecision({ ...decision, role: e.target.value as Role })}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </label>
            )}
            <p>{roleHelp[decision.role]}</p>
            <p>
              {decision.item.scope === 'project'
                ? 'This project and its complete history only.'
                : 'Projects explicitly assigned to this workspace, including future assignments.'}
            </p>
            {decision.role !== decision.item.role && (
              <p className="collab-review">
                The requested role was {decision.item.role}. You explicitly selected {decision.role}
                .
              </p>
            )}
            <Button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await researchRpc(
                    decision.invitation
                      ? 'decide_collaboration_invitation'
                      : 'decide_access_request',
                    decision.invitation
                      ? { p_id: decision.item.id, p_action: 'accept' }
                      : { p_id: decision.item.id, p_action: 'accepted', p_role: decision.role },
                  );
                  setDecision(null);
                }, 'Accepted. The approved grant is active.')
              }
            >
              Confirm {decision.role} access
            </Button>
          </div>
        )}
      </Dialog>
    </main>
  );
}
function LegacyLinks({
  project,
  busy,
  action,
}: {
  project: Resource;
  busy: boolean;
  action: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [kind, setKind] = useState('project'),
    [role, setRole] = useState<Role>('viewer'),
    [target, setTarget] = useState(''),
    [url, setUrl] = useState(''),
    [expanded, setExpanded] = useState(false);
  const targets = useQuery({
    queryKey: ['collaboration-link-targets', project.id, kind],
    enabled: expanded && ['template', 'experiment', 'report'].includes(kind),
    queryFn: async () => {
      const db = supabase()!;
      const { data, error } = await db
        .from(kind === 'template' ? 'network_templates' : 'experiment_runs')
        .select(kind === 'template' ? 'id,name' : 'id,created_at,status')
        .eq('project_id', project.id)
        .limit(200);
      if (error) throw Error(error.message);
      return data as unknown as {
        id: string;
        name?: string;
        created_at?: string;
        status?: string;
      }[];
    },
  });
  return (
    <details className="collab-item" onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>Reusable project and research invitation links</summary>
      <p>
        These existing links grant project access with its full history. A configuration, template,
        experiment or report link is read-only. Revoking a link stops new acceptance; remove
        membership separately.
      </p>
      <div className="research-inline">
        <label>
          Link kind
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setRole('viewer');
              setTarget('');
              setUrl('');
            }}
          >
            {['project', 'template', 'configuration', 'experiment', 'report'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Link role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="viewer">Viewer</option>
            {kind === 'project' && <option value="editor">Editor</option>}
          </select>
        </label>
        {['template', 'experiment', 'report'].includes(kind) && (
          <label>
            Saved resource
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose saved resource</option>
              {targets.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || `${t.created_at} ${t.status}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          disabled={busy || (['template', 'experiment', 'report'].includes(kind) && !target)}
          onClick={() =>
            void action(async () => {
              const token = await researchRpc<string>('create_research_share', {
                p_id: project.id,
                p_kind: kind,
                p_role: role,
                p_target: target || null,
              });
              setUrl(`${location.origin}/collaboration#invite=${token}`);
            }, 'Invitation link created. Copy it to share; no email was sent.')
          }
        >
          Create invitation link
        </Button>
      </div>
      {targets.isFetching && <p role="status">Loading saved resources…</p>}
      {targets.error && <p role="alert">{targets.error.message}</p>}
      {url && (
        <label>
          Copy invitation URL
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </details>
  );
}
