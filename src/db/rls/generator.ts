import type { RlsPolicy, RlsRule } from './types';

export function defineRlsPolicy(policy: RlsPolicy): RlsPolicy {
  const hasSystemAdmin = policy.rules.some((r) => r.role === 'system_admin');
  if (!hasSystemAdmin) {
    const isBootstrapOnly = policy.rules.every((r) => r.role === 'bootstrap');
    if (!isBootstrapOnly) {
      throw new Error(`${policy.table}/${policy.policyName}: system_admin ルールが必須です`);
    }
  }
  return policy;
}

function ruleToWhen(rule: RlsRule): string {
  switch (rule.role) {
    case 'system_admin':
      return `WHEN app_role() = 'system_admin'  THEN true`;

    case 'school_admin':
      if (rule.access === 'tenant_read' && 'condition' in rule) {
        return `WHEN app_role() = 'school_admin'  THEN ${rule.condition} AND tenant_id = app_tenant_id()`;
      }
      if ('ownerColumn' in rule && rule.ownerColumn) {
        return `WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND ${rule.ownerColumn} = app_user_id()`;
      }
      return `WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()`;

    case 'teacher':
      if (rule.access === 'tenant_read' && 'condition' in rule) {
        return `WHEN app_role() = 'teacher'       THEN ${rule.condition} AND tenant_id = app_tenant_id()`;
      }
      if ('ownerColumn' in rule && rule.ownerColumn) {
        return `WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND ${rule.ownerColumn} = app_user_id()`;
      }
      return `WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()`;

    case 'bootstrap':
      return `WHEN app_role() = 'bootstrap' THEN ${rule.ownerColumn} = app_user_id()`;
  }
}

function buildCaseExpr(rules: RlsRule[], indent: string): string {
  const whenClauses = rules.map(ruleToWhen);

  const isBootstrapOnly = rules.every((r) => r.role === 'bootstrap');
  if (!isBootstrapOnly) {
    whenClauses.push(`WHEN app_role() IS NULL           THEN false`);
  }
  whenClauses.push(`ELSE false`);

  const body = whenClauses.map((w) => `${indent}  ${w}`).join('\n');
  return `CASE\n${body}\n${indent}END`;
}

export function generatePolicySql(policy: RlsPolicy): string {
  const indent = '    ';
  const caseExpr = buildCaseExpr(policy.rules, indent);

  const needsWithCheck =
    policy.withCheck !== false && policy.operation !== 'SELECT';

  let sql = `CREATE POLICY ${policy.policyName} ON ${policy.table}\n`;
  sql += `  FOR ${policy.operation}\n`;
  sql += `  USING (\n${indent}${caseExpr}\n  )`;

  if (needsWithCheck) {
    sql += `\n  WITH CHECK (\n${indent}${caseExpr}\n  )`;
  }

  sql += ';';
  return sql;
}

export function generateDropSql(policy: RlsPolicy): string {
  return `DROP POLICY IF EXISTS ${policy.policyName} ON ${policy.table};`;
}

export function generateAllSql(policies: RlsPolicy[]): string {
  const drops = policies.map(generateDropSql).join('\n');
  const creates = policies.map(generatePolicySql).join('\n\n');
  return `${drops}\n\n${creates}\n`;
}
