import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GroupMember, GroupRole } from '../../models/GroupMember';

function makeMember(role: GroupRole): GroupMember {
  const m = new GroupMember();
  m.role = role;
  return m;
}

describe('GroupMember.isAdmin', () => {
  test('returns true for ADMIN role', () => {
    assert.equal(makeMember(GroupRole.ADMIN).isAdmin(), true);
  });

  test('returns false for MEMBER role', () => {
    assert.equal(makeMember(GroupRole.MEMBER).isAdmin(), false);
  });
});
