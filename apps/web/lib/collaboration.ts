import { researchRpc } from './research';
export type Role = 'viewer' | 'editor';
export type Scope = 'project' | 'studio' | 'team';
export type Resource = {
  id: string;
  name: string;
  scope: Scope;
  owner_id: string;
  owner_name: string;
  role: Role | 'owner';
  source: string;
  updated_at: string;
  version: number | null;
  team_id: string | null;
};
export type Peer = {
  id: string;
  username: string;
  name: string;
  studio_id: string | null;
  studio_name: string | null;
};
export type Profile = {
  username: string;
  display_name: string;
  discoverable: boolean;
  email_lookup: boolean;
  studio_team_id: string | null;
};
export type Item = {
  id: string;
  initiator_id: string;
  initiator: string;
  recipient_id: string | null;
  recipient: string;
  resource_id: string;
  resource: string;
  scope: Scope;
  kind?: string;
  role: Role;
  granted_role?: Role | null;
  message: string;
  status: string;
  created_at: string;
  expires_at?: string;
};
export type Member = {
  resource_id: string;
  user_id: string;
  name: string;
  role: Role;
  source: string;
};
export type CollaborationState = {
  user_id: string;
  profile: Profile | null;
  resources: Resource[];
  requests: Item[];
  invitations: Item[];
  members: Member[];
  unread: number;
  notifications: {
    id: string;
    event: string;
    item_id: string;
    created_at: string;
    read_at: string | null;
  }[];
  activity: { id: string; project_id: string; event: string; created_at: string }[];
};
export const sections = [
  'Overview',
  'People',
  'Requests & Invitations',
  'Shared with me',
  'Manage access',
] as const;
export type Section = (typeof sections)[number];
export const roleHelp: Record<Role, string> = {
  viewer:
    'Viewers can inspect and export the included projects, revisions and experiment history. They cannot save revisions or start jobs.',
  editor:
    'Editors can also save revisions and run experiments. They cannot grant access, delete projects or transfer ownership.',
};
export const collaborationState = () => researchRpc<CollaborationState>('collaboration_state', {});
export const findPeer = (query: string) =>
  researchRpc<{ limited: boolean; peer: Peer | null }>('find_collaboration_peer', {
    p_query: query,
  });
export function invitationToken(input: string) {
  const value = input.trim();
  const token = value.includes('#')
    ? new URLSearchParams(value.slice(value.indexOf('#') + 1)).get('invite') || ''
    : value;
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Enter a valid invitation URL or token.');
  return token;
}
export function sharedResources(
  state: CollaborationState,
  search = '',
  sort = 'updated',
  owner?: string,
) {
  return state.resources
    .filter(
      (r) =>
        r.owner_id !== state.user_id &&
        (!owner || r.owner_id === owner) &&
        `${r.name} ${r.scope} ${r.owner_name}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
}
export function stamp(value: string) {
  return new Date(value).toLocaleString();
}
export function sharedActivity(state: CollaborationState) {
  // An owned project is shared only when another person currently has access.
  // Team assignment, self-membership and pending invitation links alone do not count.
  const projects = new Map(
    state.resources
      .filter(
        (r) =>
          r.scope === 'project' &&
          (r.owner_id !== state.user_id ||
            state.members.some((m) => m.resource_id === r.id && m.user_id !== state.user_id)),
      )
      .map((r) => [r.id, r]),
  );
  const groups = new Map<
    string,
    { id: string; project: Resource; event: string; createdAt: string; count: number }
  >();
  for (const activity of state.activity) {
    const project = projects.get(activity.project_id),
      at = new Date(activity.created_at);
    if (!project || !Number.isFinite(at.getTime())) continue;
    const day = [at.getFullYear(), at.getMonth(), at.getDate()].join('-');
    const key =
      activity.event === 'revision_saved' ? `${project.id}:${activity.event}:${day}` : activity.id;
    const group = groups.get(key);
    if (group) {
      group.count++;
      if (Date.parse(activity.created_at) > Date.parse(group.createdAt))
        group.createdAt = activity.created_at;
    } else
      groups.set(key, {
        id: key,
        project,
        event: activity.event,
        createdAt: activity.created_at,
        count: 1,
      });
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function eventText(value: string) {
  return value.replaceAll('_', ' ');
}
