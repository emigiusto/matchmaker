import { describe, it, expect } from 'vitest';
import {
  createContactSchema,
  updateContactSchema,
  reorderListMembersSchema,
  addListMemberSchema,
} from '../contacts.validators';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const UUID2 = '123e4567-e89b-12d3-a456-426614174001';

// ─── createContactSchema ─────────────────────────────────────

describe('createContactSchema', () => {
  it('accepts valid input', () => {
    const result = createContactSchema.safeParse({
      ownerUserId: UUID,
      name: 'Test User',
      phone: '+34612345678',
    });
    expect(result.success).toBe(true);
  });

  it('normalizes phone by stripping non-digits and adding + prefix', () => {
    const result = createContactSchema.safeParse({
      ownerUserId: UUID,
      name: 'Test',
      phone: '34612345678',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+34612345678');
  });

  it('rejects missing name', () => {
    const result = createContactSchema.safeParse({ ownerUserId: UUID, phone: '+34612345678' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createContactSchema.safeParse({ ownerUserId: UUID, name: '', phone: '+34612345678' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ownerUserId', () => {
    const result = createContactSchema.safeParse({ ownerUserId: 'not-a-uuid', name: 'Test', phone: '+34612345678' });
    expect(result.success).toBe(false);
  });

  it('rejects phone with fewer than 8 digits', () => {
    const result = createContactSchema.safeParse({ ownerUserId: UUID, name: 'Test', phone: '+34123' });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = createContactSchema.safeParse({
      ownerUserId: UUID,
      name: 'Test',
      phone: '+34612345678',
      importSource: 'csv',
      externalId: 'ext-123',
    });
    expect(result.success).toBe(true);
  });
});

// ─── updateContactSchema ─────────────────────────────────────

describe('updateContactSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = updateContactSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts name update', () => {
    const result = updateContactSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('New Name');
  });

  it('rejects empty string name', () => {
    const result = updateContactSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts communicationLanguage "es"', () => {
    const result = updateContactSchema.safeParse({ communicationLanguage: 'es' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.communicationLanguage).toBe('es');
  });

  it('accepts communicationLanguage "en"', () => {
    const result = updateContactSchema.safeParse({ communicationLanguage: 'en' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.communicationLanguage).toBe('en');
  });

  it('rejects unsupported language code', () => {
    const result = updateContactSchema.safeParse({ communicationLanguage: 'fr' });
    expect(result.success).toBe(false);
  });

  it('rejects arbitrary string as language', () => {
    const result = updateContactSchema.safeParse({ communicationLanguage: 'spanish' });
    expect(result.success).toBe(false);
  });

  it('accepts combined name + language update', () => {
    const result = updateContactSchema.safeParse({ name: 'Alice', communicationLanguage: 'en' });
    expect(result.success).toBe(true);
  });

  it('accepts socioNumbers record', () => {
    const result = updateContactSchema.safeParse({ socioNumbers: { 'club-laieta': '1234' } });
    expect(result.success).toBe(true);
  });
});

// ─── reorderListMembersSchema ─────────────────────────────────

describe('reorderListMembersSchema', () => {
  it('accepts array with single UUID', () => {
    const result = reorderListMembersSchema.safeParse({ contactIds: [UUID] });
    expect(result.success).toBe(true);
  });

  it('accepts array with multiple UUIDs', () => {
    const result = reorderListMembersSchema.safeParse({ contactIds: [UUID, UUID2] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contactIds).toHaveLength(2);
  });

  it('rejects empty array', () => {
    const result = reorderListMembersSchema.safeParse({ contactIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    const result = reorderListMembersSchema.safeParse({ contactIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('rejects missing contactIds', () => {
    const result = reorderListMembersSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ─── addListMemberSchema ──────────────────────────────────────

describe('addListMemberSchema', () => {
  it('accepts valid contactId UUID', () => {
    const result = addListMemberSchema.safeParse({ contactId: UUID });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID contactId', () => {
    const result = addListMemberSchema.safeParse({ contactId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing contactId', () => {
    const result = addListMemberSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
