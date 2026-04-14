import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GroupService } from '../../services/GroupService';
import { GroupMember, GroupRole } from '../../models/GroupMember';

// ---------------------------------------------------------------------------
// Helper: builds a GroupService with injectable repo mocks
// ---------------------------------------------------------------------------
function makeService(memberRepoOverrides: Partial<Record<string, any>> = {}) {
  const memberRepo = {
    findOne: async () => null,
    find: async () => [],
    create: (data: any) => ({ ...data }),
    save: async (x: any) => x,
    delete: async () => ({ affected: 1 }),
    update: async () => {},
    ...memberRepoOverrides,
  };

  const groupRepo = {
    findOne: async () => null,
    find: async () => [],
    create: (data: any) => ({ id: 99, ...data }),
    save: async (x: any) => x,
  };

  const mockDb = {
    getRepository: (Entity: any) => {
      if (Entity === GroupMember) return memberRepo;
      return groupRepo;
    },
  } as any;

  return { service: new GroupService(mockDb), memberRepo };
}

// ---------------------------------------------------------------------------
// isUserMember
// ---------------------------------------------------------------------------
describe('GroupService.isUserMember', () => {
  test('returns false when member not found', async () => {
    const { service } = makeService({ findOne: async () => null });
    assert.equal(await service.isUserMember(1, 10), false);
  });

  test('returns true when member found', async () => {
    const member = { id: 1, user_id: 1, group_id: 10, role: GroupRole.MEMBER };
    const { service } = makeService({ findOne: async () => member });
    assert.equal(await service.isUserMember(1, 10), true);
  });
});

// ---------------------------------------------------------------------------
// isUserAdmin
// ---------------------------------------------------------------------------
describe('GroupService.isUserAdmin', () => {
  test('returns false when member not found', async () => {
    const { service } = makeService({ findOne: async () => null });
    assert.equal(await service.isUserAdmin(1, 10), false);
  });

  test('returns false when member has MEMBER role', async () => {
    const member = { id: 1, user_id: 1, group_id: 10, role: GroupRole.MEMBER };
    const { service } = makeService({ findOne: async () => member });
    assert.equal(await service.isUserAdmin(1, 10), false);
  });

  test('returns true when member has ADMIN role', async () => {
    const member = { id: 1, user_id: 1, group_id: 10, role: GroupRole.ADMIN };
    const { service } = makeService({ findOne: async () => member });
    assert.equal(await service.isUserAdmin(1, 10), true);
  });
});

// ---------------------------------------------------------------------------
// syncChatMembers
// ---------------------------------------------------------------------------
describe('GroupService.syncChatMembers', () => {
  test('calls addMemberToGroup for each userId', async () => {
    const { service } = makeService();
    const called: number[] = [];
    (service as any).addMemberToGroup = async (userId: number) => { called.push(userId); };

    await service.syncChatMembers(10, [1, 2, 3]);

    assert.deepEqual(called, [1, 2, 3]);
  });

  test('silently ignores "already a member" error', async () => {
    const { service } = makeService();
    (service as any).addMemberToGroup = async () => {
      throw new Error('User is already a member of this group');
    };

    // Should not throw
    await assert.doesNotReject(() => service.syncChatMembers(10, [1, 2]));
  });

  test('does nothing for empty list', async () => {
    const { service } = makeService();
    const called: number[] = [];
    (service as any).addMemberToGroup = async (userId: number) => { called.push(userId); };

    await service.syncChatMembers(10, []);

    assert.deepEqual(called, []);
  });
});
