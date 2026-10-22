import { describe, it, expect } from 'vitest';
import { sharedActivity, type CollaborationState, type Resource } from './collaboration';
const owner = 'owner',
  peer = 'peer';
function resource(id: string, ownerId = owner): Resource {
  return {
    id,
    owner_id: ownerId,
    name: id,
    scope: 'project',
    owner_name: ownerId,
    role: ownerId === owner ? 'owner' : 'viewer',
    source: 'ownership',
    updated_at: '2026-10-22T00:00:00Z',
    version: 1,
    team_id: null,
  };
}
function state(): CollaborationState {
  return {
    user_id: owner,
    profile: null,
    resources: [resource('private'), resource('shared'), resource('received', peer)],
    members: [],
    activity: [],
    requests: [],
    invitations: [],
    unread: 0,
    notifications: [],
  };
}
describe('shared activity has actual current collaborators', () => {
  it('hides private saves, self-grants and projects assigned to a team with no peers', () => {
    const s = state();
    s.resources = s.resources.slice(0, 2);
    s.resources[1].team_id = 'empty-team';
    s.members = [
      {
        resource_id: 'shared',
        user_id: owner,
        name: 'Me',
        role: 'editor',
        source: 'team membership',
      },
    ];
    s.activity = s.resources.map((r) => ({
      id: r.id,
      project_id: r.id,
      event: 'revision_saved',
      created_at: r.updated_at,
    }));
    expect(sharedActivity(s)).toEqual([]);
  });
  it('groups same-day repeated revisions only on currently shared projects and hides revoked or unrelated activity', () => {
    const s = state();
    s.members = [
      {
        resource_id: 'shared',
        user_id: peer,
        name: 'Peer',
        role: 'viewer',
        source: 'team membership',
      },
    ];
    s.activity = ['private', 'shared', 'shared', 'received', 'unrelated'].map((id, index) => ({
      id: String(index),
      project_id: id,
      event: 'revision_saved',
      created_at: `2026-10-22T10:0${index}:00Z`,
    }));
    const groups = sharedActivity(s);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.project.id === 'shared')?.count).toBe(2);
    s.members = [];
    expect(sharedActivity(s).map((g) => g.project.id)).toEqual(['received']);
  });
});
