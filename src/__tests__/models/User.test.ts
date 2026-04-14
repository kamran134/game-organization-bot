import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../../models/User';

function makeUser(fields: Partial<Pick<User, 'first_name' | 'last_name' | 'username'>>): User {
  const u = new User();
  u.first_name = fields.first_name;
  u.last_name = fields.last_name;
  u.username = fields.username;
  return u;
}

describe('User.fullName', () => {
  test('combines first and last name', () => {
    const u = makeUser({ first_name: 'Ivan', last_name: 'Petrov' });
    assert.equal(u.fullName, 'Ivan Petrov');
  });

  test('returns only first name when last name is missing', () => {
    const u = makeUser({ first_name: 'Ivan' });
    assert.equal(u.fullName, 'Ivan');
  });

  test('falls back to username when no name provided', () => {
    const u = makeUser({ username: 'ivanpetrov' });
    assert.equal(u.fullName, 'ivanpetrov');
  });

  test('falls back to "User" when nothing is provided', () => {
    const u = makeUser({});
    assert.equal(u.fullName, 'User');
  });
});

describe('User.mention', () => {
  test('returns @username when username is set', () => {
    const u = makeUser({ username: 'ivanpetrov', first_name: 'Ivan' });
    assert.equal(u.mention, '@ivanpetrov');
  });

  test('returns fullName when no username', () => {
    const u = makeUser({ first_name: 'Ivan', last_name: 'Petrov' });
    assert.equal(u.mention, 'Ivan Petrov');
  });
});
