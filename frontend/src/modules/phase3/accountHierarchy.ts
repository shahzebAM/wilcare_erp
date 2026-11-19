type AccountNode = {
  id: string;
  name: string;
  parentAccountId?: string | null;
};

export function accountHierarchy<T extends AccountNode>(accounts: readonly T[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const children = new Map<string | null, T[]>();
  for (const account of accounts) {
    const parent = account.parentAccountId && byId.has(account.parentAccountId)
      ? account.parentAccountId
      : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(account);
    children.set(parent, siblings);
  }

  const rows: (T & { depth: number; accountPath: string; ancestorIds: string[] })[] = [];
  const visited = new Set<string>();
  const visit = (account: T, ancestorIds: string[], parentPath: string) => {
    if (visited.has(account.id)) return;
    visited.add(account.id);
    const accountPath = parentPath ? `${parentPath} › ${account.name}` : account.name;
    rows.push({ ...account, depth: ancestorIds.length, accountPath, ancestorIds });
    for (const child of children.get(account.id) ?? []) {
      visit(child, [...ancestorIds, account.id], accountPath);
    }
  };
  for (const account of children.get(null) ?? []) visit(account, [], '');
  for (const account of accounts) visit(account, [], '');
  return rows;
}
