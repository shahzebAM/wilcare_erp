export const BUILT_IN_COMPANY = 'Wilcare';

const legacyCompanies = new Set(['olten', 'surgicom', 'ordent']);

export function isBuiltInCompany(name: string) {
  return name.trim().toLowerCase() === BUILT_IN_COMPANY.toLowerCase();
}

export function isLegacyCompany(name: string) {
  return legacyCompanies.has(name.trim().toLowerCase());
}

export function visibleCompanies(names: unknown[]): string[] {
  const companies = [BUILT_IN_COMPANY];
  const seen = new Set([BUILT_IN_COMPANY.toLowerCase()]);
  for (const value of names) {
    if (typeof value !== 'string') continue;
    const name = value.trim();
    const key = name.toLowerCase();
    if (!name || legacyCompanies.has(key) || seen.has(key)) continue;
    seen.add(key);
    companies.push(name);
  }
  return companies;
}
