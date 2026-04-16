import { defineRlsPolicy } from './generator';

// sessions テーブルは RLS 無効（Auth.js アダプタの鶏卵問題のため）
// ここでは RLS が有効なテーブルのポリシーのみ定義する

export const policies = [
  defineRlsPolicy({
    table: 'journal_entries',
    policyName: 'journal_entry_owner_all',
    operation: 'ALL',
    rules: [
      { role: 'system_admin', access: 'all' },
      { role: 'school_admin', access: 'tenant' },
      { role: 'teacher', access: 'tenant', ownerColumn: 'user_id' },
    ],
  }),

  defineRlsPolicy({
    table: 'journal_entries',
    policyName: 'journal_entry_public_read',
    operation: 'SELECT',
    rules: [
      { role: 'system_admin', access: 'all' },
      { role: 'school_admin', access: 'tenant_read', condition: 'is_public = true' },
      { role: 'teacher', access: 'tenant_read', condition: 'is_public = true' },
    ],
  }),

  defineRlsPolicy({
    table: 'journal_entry_tags',
    policyName: 'journal_entry_tags_tenant',
    operation: 'ALL',
    rules: [
      { role: 'system_admin', access: 'all' },
      { role: 'school_admin', access: 'tenant' },
      { role: 'teacher', access: 'tenant' },
    ],
  }),

  defineRlsPolicy({
    table: 'tags',
    policyName: 'tags_tenant_read',
    operation: 'SELECT',
    rules: [
      { role: 'system_admin', access: 'all' },
      { role: 'school_admin', access: 'tenant' },
      { role: 'teacher', access: 'tenant' },
    ],
  }),

  defineRlsPolicy({
    table: 'tags',
    policyName: 'tags_tenant_write',
    operation: 'ALL',
    rules: [
      { role: 'system_admin', access: 'all' },
      { role: 'school_admin', access: 'tenant' },
      { role: 'teacher', access: 'tenant' },
    ],
  }),

  defineRlsPolicy({
    table: 'user_tenant_roles',
    policyName: 'user_tenant_roles_access',
    operation: 'ALL',
    rules: [
      { role: 'system_admin', access: 'all' },
      { role: 'school_admin', access: 'tenant' },
      { role: 'teacher', access: 'tenant' },
    ],
  }),

  defineRlsPolicy({
    table: 'user_tenant_roles',
    policyName: 'user_tenant_roles_bootstrap',
    operation: 'SELECT',
    rules: [
      { role: 'bootstrap', access: 'self_only', ownerColumn: 'user_id' },
    ],
  }),
];
