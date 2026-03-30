import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/AppError';

// ─── Module mocks (hoisted before imports) ───────────────────

vi.mock('../../../prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    contact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contactList: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    contactListMember: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../analytics/analytics.service', () => ({ logServerEvent: vi.fn() }));
vi.mock('../../users/users.service', () => ({ findUserByNormalizedPhone: vi.fn() }));
vi.mock('../../shared/utils/phone.utils', () => ({
  normalizePhoneToCanonical: vi.fn((phone: string) => phone.replace(/\D/g, '')),
}));

import { prisma } from '../../../prisma';
import {
  updateContact,
  reorderListMembers,
  addMemberToList,
  removeMemberFromList,
  listContactLists,
} from '../contacts.service';

// ─── Fixtures ─────────────────────────────────────────────────

const OWNER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const LIST_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';
const CONT_ID  = 'cccccccc-0000-0000-0000-000000000001';

const now = new Date('2026-01-01T00:00:00Z');

const baseContact = {
  id: CONT_ID,
  ownerUserId: OWNER_ID,
  name: 'Alice',
  phone: '+34612345678',
  socioNumbers: {},
  linkedUserId: null,
  linkedUser: null,
  importSource: 'manual',
  communicationLanguage: 'es',
  externalId: null,
  createdAt: now,
  updatedAt: now,
};

const baseList = {
  id: LIST_ID,
  ownerUserId: OWNER_ID,
  name: 'Test List',
  createdAt: now,
  members: [],
};

// Helper: build a list with nested member shape expected by toListDTO
function listWithMembers(contacts: typeof baseContact[]) {
  return {
    ...baseList,
    members: contacts.map((c) => ({ contact: c })),
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── updateContact ────────────────────────────────────────────

describe('updateContact', () => {
  it('updates communicationLanguage when provided', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({ ...baseContact, communicationLanguage: 'en' } as any);

    await updateContact(CONT_ID, OWNER_ID, { communicationLanguage: 'en' });

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ communicationLanguage: 'en' }) }),
    );
  });

  it('does not include communicationLanguage in patch when not provided', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({ ...baseContact, name: 'Bob' } as any);

    await updateContact(CONT_ID, OWNER_ID, { name: 'Bob' });

    const updateData = vi.mocked(prisma.contact.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty('communicationLanguage');
    expect(updateData.name).toBe('Bob');
  });

  it('can update name and language in one call', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({ ...baseContact, name: 'Bob', communicationLanguage: 'en' } as any);

    await updateContact(CONT_ID, OWNER_ID, { name: 'Bob', communicationLanguage: 'en' });

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Bob', communicationLanguage: 'en' }),
      }),
    );
  });

  it('throws 404 when contact does not exist', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null);

    await expect(updateContact(CONT_ID, OWNER_ID, { name: 'X' })).rejects.toThrow(AppError);
  });

  it('throws 403 when contact belongs to a different owner', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ ...baseContact, ownerUserId: OTHER_ID } as any);

    await expect(updateContact(CONT_ID, OWNER_ID, { name: 'X' })).rejects.toThrow(AppError);
  });
});

// ─── reorderListMembers ───────────────────────────────────────

describe('reorderListMembers', () => {
  const orderedIds = [CONT_ID, 'id-2', 'id-3'];

  beforeEach(() => {
    // $transaction executes the array of promises
    vi.mocked(prisma.$transaction).mockImplementation((ops: any) => Promise.all(ops));
    vi.mocked(prisma.contactListMember.updateMany).mockResolvedValue({ count: 1 } as any);
  });

  it('calls updateMany for each contactId with the correct position', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(baseList as any);

    await reorderListMembers(LIST_ID, OWNER_ID, orderedIds);

    expect(prisma.contactListMember.updateMany).toHaveBeenCalledTimes(3);
    expect(prisma.contactListMember.updateMany).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ where: { contactListId: LIST_ID, contactId: CONT_ID }, data: { position: 0 } }),
    );
    expect(prisma.contactListMember.updateMany).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ where: { contactListId: LIST_ID, contactId: 'id-2' }, data: { position: 1 } }),
    );
    expect(prisma.contactListMember.updateMany).toHaveBeenNthCalledWith(3,
      expect.objectContaining({ where: { contactListId: LIST_ID, contactId: 'id-3' }, data: { position: 2 } }),
    );
  });

  it('wraps all updates in a single $transaction call', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(baseList as any);

    await reorderListMembers(LIST_ID, OWNER_ID, orderedIds);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txArg = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown[];
    expect(txArg).toHaveLength(3);
  });

  it('throws 404 when list does not exist', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(null);

    await expect(reorderListMembers(LIST_ID, OWNER_ID, orderedIds)).rejects.toThrow(AppError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws 403 when list belongs to a different owner', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue({ ...baseList, ownerUserId: OTHER_ID } as any);

    await expect(reorderListMembers(LIST_ID, OWNER_ID, orderedIds)).rejects.toThrow(AppError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── addMemberToList ──────────────────────────────────────────

describe('addMemberToList', () => {
  beforeEach(() => {
    vi.mocked(prisma.contactListMember.upsert).mockResolvedValue({} as any);
  });

  it('assigns position = max_position + 1 when members already exist', async () => {
    vi.mocked(prisma.contactList.findUnique)
      .mockResolvedValueOnce(baseList as any)           // ownership check
      .mockResolvedValueOnce(listWithMembers([baseContact]) as any); // listContactListById
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);
    vi.mocked(prisma.contactListMember.aggregate).mockResolvedValue({ _max: { position: 4 } } as any);

    await addMemberToList(LIST_ID, CONT_ID, OWNER_ID);

    expect(prisma.contactListMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ position: 5 }) }),
    );
  });

  it('assigns position 0 when the list is empty (null max)', async () => {
    vi.mocked(prisma.contactList.findUnique)
      .mockResolvedValueOnce(baseList as any)
      .mockResolvedValueOnce(listWithMembers([]) as any);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);
    vi.mocked(prisma.contactListMember.aggregate).mockResolvedValue({ _max: { position: null } } as any);

    await addMemberToList(LIST_ID, CONT_ID, OWNER_ID);

    expect(prisma.contactListMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ position: 0 }) }),
    );
  });

  it('throws 404 when list does not exist', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);

    await expect(addMemberToList(LIST_ID, CONT_ID, OWNER_ID)).rejects.toThrow(AppError);
    expect(prisma.contactListMember.upsert).not.toHaveBeenCalled();
  });

  it('throws 403 when list belongs to a different owner', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue({ ...baseList, ownerUserId: OTHER_ID } as any);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(baseContact as any);

    await expect(addMemberToList(LIST_ID, CONT_ID, OWNER_ID)).rejects.toThrow(AppError);
    expect(prisma.contactListMember.upsert).not.toHaveBeenCalled();
  });

  it('throws 404 when contact does not exist', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(baseList as any);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null);

    await expect(addMemberToList(LIST_ID, CONT_ID, OWNER_ID)).rejects.toThrow(AppError);
  });
});

// ─── removeMemberFromList ─────────────────────────────────────

describe('removeMemberFromList', () => {
  it('deletes the correct membership record', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(baseList as any);
    vi.mocked(prisma.contactListMember.deleteMany).mockResolvedValue({ count: 1 } as any);

    await removeMemberFromList(LIST_ID, CONT_ID, OWNER_ID);

    expect(prisma.contactListMember.deleteMany).toHaveBeenCalledWith({
      where: { contactListId: LIST_ID, contactId: CONT_ID },
    });
  });

  it('throws 404 when list does not exist', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue(null);

    await expect(removeMemberFromList(LIST_ID, CONT_ID, OWNER_ID)).rejects.toThrow(AppError);
    expect(prisma.contactListMember.deleteMany).not.toHaveBeenCalled();
  });

  it('throws 403 when list belongs to a different owner', async () => {
    vi.mocked(prisma.contactList.findUnique).mockResolvedValue({ ...baseList, ownerUserId: OTHER_ID } as any);

    await expect(removeMemberFromList(LIST_ID, CONT_ID, OWNER_ID)).rejects.toThrow(AppError);
    expect(prisma.contactListMember.deleteMany).not.toHaveBeenCalled();
  });
});

// ─── listContactLists — ordering query ───────────────────────

describe('listContactLists', () => {
  it('queries members with [position ASC, addedAt ASC] ordering', async () => {
    vi.mocked(prisma.contactList.findMany).mockResolvedValue([]);

    await listContactLists(OWNER_ID);

    expect(prisma.contactList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          members: expect.objectContaining({
            orderBy: [{ position: 'asc' }, { addedAt: 'asc' }],
          }),
        }),
      }),
    );
  });

  it('returns empty array when user has no lists', async () => {
    vi.mocked(prisma.contactList.findMany).mockResolvedValue([]);

    const result = await listContactLists(OWNER_ID);

    expect(result).toEqual([]);
  });

  it('maps list members into ContactDTO shape', async () => {
    vi.mocked(prisma.contactList.findMany).mockResolvedValue([
      listWithMembers([baseContact]) as any,
    ]);

    const [list] = await listContactLists(OWNER_ID);

    expect(list.members).toHaveLength(1);
    expect(list.members[0]).toMatchObject({
      id: CONT_ID,
      name: 'Alice',
      communicationLanguage: 'es',
    });
  });
});
