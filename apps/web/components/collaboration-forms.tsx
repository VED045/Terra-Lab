'use client';
import { useRef, useState } from 'react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { researchRpc } from '@/lib/research';
import {
  findPeer,
  roleHelp,
  type Peer,
  type Profile,
  type Resource,
  type Role,
} from '@/lib/collaboration';
export function PeerSearch({
  onPeer,
  disabled = false,
}: {
  onPeer: (peer: Peer | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const lookupVersion = useRef(0),
    inFlight = useRef(false);
  return (
    <form
      className="research-inline"
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current || disabled) return;
        inFlight.current = true;
        const version = ++lookupVersion.current;
        setBusy(true);
        setMessage('');
        onPeer(null);
        try {
          const r = await findPeer(query);
          if (version !== lookupVersion.current) return;
          onPeer(r.peer);
          setMessage(
            r.limited
              ? 'Lookup limit reached. Try again in an hour.'
              : r.peer
                ? ''
                : 'No discoverable peer matches that exact identity.',
          );
        } catch (e) {
          if (version === lookupVersion.current)
            setMessage(e instanceof Error ? e.message : 'Lookup failed');
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <label className="collab-field">
        Exact username or email
        <input
          required
          aria-label="Exact username or email"
          maxLength={254}
          value={query}
          onChange={(e) => {
            lookupVersion.current++;
            setQuery(e.target.value);
            onPeer(null);
            setMessage('');
          }}
          autoComplete="off"
          placeholder="username or peer@example.org"
        />
      </label>
      <Button type="submit" disabled={disabled || busy || query.trim().length < 3}>
        {busy ? 'Finding…' : 'Find peer'}
      </Button>
      {message && (
        <p role="status" className="collab-full">
          {message}
        </p>
      )}
    </form>
  );
}
export function ProfileForm({
  profile,
  teams,
  save,
  busy,
}: {
  profile: Profile | null;
  teams: Resource[];
  save: (fn: () => Promise<unknown>, message: string) => Promise<void>;
  busy: boolean;
}) {
  const [username, setUsername] = useState(profile?.username || ''),
    [name, setName] = useState(profile?.display_name || ''),
    [visible, setVisible] = useState(profile?.discoverable || false),
    [email, setEmail] = useState(profile?.email_lookup || false),
    [studio, setStudio] = useState(profile?.studio_team_id || '');
  return (
    <form
      className="collab-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          () =>
            researchRpc('save_peer_profile', {
              p_username: username,
              p_name: name,
              p_discoverable: visible,
              p_email_lookup: email,
              p_studio: studio || null,
            }),
          'Profile saved.',
        );
      }}
    >
      <h3>Your peer profile</h3>
      <p>
        Discovery is optional. Only your chosen name, username and studio are returned for an exact
        match. Your email is never returned.
      </p>
      <label>
        Unique username
        <input
          required
          pattern="[a-z][a-z0-9_]{2,31}"
          maxLength={32}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="3–32 lowercase letters, numbers or underscores"
        />
      </label>
      <label>
        Profile name
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="collab-check">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Allow exact username discovery
      </label>
      <label className="collab-check">
        <input
          type="checkbox"
          checked={email}
          onChange={(e) => setEmail(e.target.checked)}
          disabled={!visible}
        />
        Also allow exact verified email lookup
      </label>
      <label>
        Your studio workspace
        <select value={studio} onChange={(e) => setStudio(e.target.value)}>
          <option value="">No studio offered</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        A studio uses team membership. Only projects explicitly assigned to that workspace are
        included. Create a workspace in Manage access first.
      </p>
      <Button type="submit" disabled={busy}>
        Save profile
      </Button>
    </form>
  );
}
export function RequestDialog({
  peer,
  onClose,
  submit,
  busy,
}: {
  peer: Peer | null;
  onClose: () => void;
  submit: (peer: Peer, role: Role, message: string) => Promise<void>;
  busy: boolean;
}) {
  const [role, setRole] = useState<Role>('viewer'),
    [message, setMessage] = useState(''),
    [review, setReview] = useState(false);
  return (
    <Dialog
      open={!!peer}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="Request studio access"
      description="A request grants nothing until the studio owner accepts it."
    >
      {peer && (
        <form
          className="collab-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!review) setReview(true);
            else void submit(peer, role, message);
          }}
        >
          <p>
            <b>{peer.name}</b> · @{peer.username}
            <br />
            Studio: {peer.studio_name}
          </p>
          {!review ? (
            <>
              <label>
                Requested role
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </label>
              <label>
                Message (optional)
                <textarea
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
            </>
          ) : (
            <p className="collab-review">
              Send to {peer.name}, for studio {peer.studio_name}, as {role}. Scope: all projects
              explicitly assigned to this studio, including future assignments.
            </p>
          )}
          <p>{roleHelp[role]}</p>
          {review && message && <blockquote>{message}</blockquote>}
          <div className="research-inline">
            {review && (
              <Button type="button" disabled={busy} onClick={() => setReview(false)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {review ? 'Send request' : 'Review request'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
export function InviteDialog({
  resources,
  onClose,
  submit,
  busy,
}: {
  resources: Resource[];
  onClose: () => void;
  submit: (resource: Resource, peers: Peer[], role: Role, message: string) => Promise<void>;
  busy: boolean;
}) {
  const [resourceId, setResourceId] = useState(resources[0]?.id || ''),
    [peers, setPeers] = useState<Peer[]>([]),
    [found, setFound] = useState<Peer | null>(null),
    [role, setRole] = useState<Role>('viewer'),
    [message, setMessage] = useState(''),
    [review, setReview] = useState(false);
  const resource = resources.find((r) => r.id === resourceId);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="Invite people"
      description="Send a private in-app offer. No email is sent."
    >
      <div className="collab-form">
        {!review ? (
          <>
            <label>
              Destination
              <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                <option value="" disabled>
                  Select an owned resource
                </option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.scope}
                  </option>
                ))}
              </select>
            </label>
            <PeerSearch onPeer={setFound} disabled={busy || peers.length >= 20} />
            {found && (
              <div className="collab-row">
                <span>
                  {found.name} · @{found.username}
                </span>
                <Button
                  disabled={busy || peers.some((p) => p.id === found.id) || peers.length >= 20}
                  onClick={() => {
                    setPeers((p) => [...p, found]);
                    setFound(null);
                  }}
                >
                  Add peer
                </Button>
              </div>
            )}
            {peers.map((p) => (
              <div className="collab-row" key={p.id}>
                <span>
                  {p.name} · @{p.username}
                </span>
                <Button onClick={() => setPeers(peers.filter((x) => x.id !== p.id))}>Remove</Button>
              </div>
            ))}
            <label>
              Offered role
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </label>
            <label>
              Message (optional)
              <textarea
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
          </>
        ) : (
          <div className="collab-review">
            <p>
              Offer <b>{role}</b> access to <b>{resource?.name}</b> ({resource?.scope}) to:
            </p>
            <ul>
              {peers.map((p) => (
                <li key={p.id}>
                  {p.name} · @{p.username}
                </li>
              ))}
            </ul>
            <p>
              {resource?.scope === 'project'
                ? 'Only this project and its full history are included.'
                : 'Only projects assigned to this workspace, including future assignments, are included.'}
            </p>
            {message && <blockquote>{message}</blockquote>}
            <p>Expires in seven days. Each recipient must explicitly accept.</p>
          </div>
        )}
        <p>{roleHelp[role]}</p>
        <div className="research-inline">
          {review && (
            <Button disabled={busy} onClick={() => setReview(false)}>
              Back
            </Button>
          )}
          <Button
            disabled={busy || !resource || !peers.length}
            onClick={() => {
              if (!review) setReview(true);
              else if (resource) void submit(resource, peers, role, message);
            }}
          >
            {review ? 'Send invitations' : 'Review invitations'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
