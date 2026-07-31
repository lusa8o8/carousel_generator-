import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = await readFile(new URL('../storage.rules', import.meta.url), 'utf8');

test('Firestore rules scope carousel data to workspace membership', () => {
  assert.match(firestoreRules, /match \/workspaces\/\{workspaceId\}/);
  assert.match(firestoreRules, /match \/carousels\/\{carouselId\}/);
  assert.match(firestoreRules, /isWorkspaceMember\(workspaceId\)/);
});

test('Firestore rules reserve billing and usage writes for the server', () => {
  for (const collection of ['entitlements', 'usage', 'subscriptions']) {
    assert.match(firestoreRules, new RegExp(`match \\/${collection}\\/`));
  }
  assert.match(firestoreRules, /match \/paymentEvents\/\{eventId\}[\s\S]*?allow read, write: if false;/);
});

test('legacy carousel documents cannot receive new client writes', () => {
  assert.match(firestoreRules, /match \/carousels\/\{userId\}[\s\S]*?allow create, update: if false;/);
});

test('Storage rules require workspace membership and constrain uploads', () => {
  assert.match(storageRules, /isWorkspaceMember\(workspaceId\)/);
  assert.match(storageRules, /request\.resource\.size <= 10 \* 1024 \* 1024/);
  assert.match(storageRules, /image\/\(jpeg\|png\|gif\|webp\)/);
  assert.match(storageRules, /match \/\{allPaths=\*\*\}[\s\S]*?allow read, write: if false;/);
});
