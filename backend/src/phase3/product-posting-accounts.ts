import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as v from '../importation/importation.validation';
import { audit, type Actor, type Tx } from './phase3.shared';
import { POSTING_ROLES } from './posting-accounts';

export const PRODUCT_POSTING_ROLES = [
  ['salesAccountId', 'ITEM_SALES', '4000', 'REVENUE'],
  ['cogsAccountId', 'ITEM_COGS', '5100', 'EXPENSE'],
  ['inventoryAccountId', 'ITEM_INVENTORY', '1200', 'ASSET'],
] as const;

const accountLabels = {
  salesAccountId: 'Sales income account',
  cogsAccountId: 'Cost of goods sold account',
  inventoryAccountId: 'Inventory asset account',
};
const reservedAssetRoles = POSTING_ROLES.filter(
  ([, code, type]) => type === 'ASSET' && code !== '1200',
);

async function productPostingSettings(
  tx: Tx,
  company: string,
  productId: number,
) {
  v.integer(productId, 'Product ID', 1);
  const product = await tx.product.findFirst({
    where: { id: productId, company },
    select: { sku: true, name: true },
  });
  if (!product)
    throw new NotFoundException('Product not found in this workspace.');

  const sourceId = String(productId);
  const [mappings, ledger, reservedMappings, pastControls, cashSettings] =
    await Promise.all([
      tx.accountingMapping.findMany({
        where: {
          company,
          sourceId,
          kind: { in: PRODUCT_POSTING_ROLES.map(([, kind]) => kind) },
        },
        select: { kind: true, accountId: true },
      }),
      tx.ledgerAccount.findMany({
        where: {
          company,
          type: { in: PRODUCT_POSTING_ROLES.map(([, , , type]) => type) },
        },
        select: { id: true, code: true, name: true, type: true, active: true },
        orderBy: { code: 'asc' },
      }),
      tx.accountingMapping.findMany({
        where: {
          company,
          kind: 'POSTING_ROLE',
          sourceId: { in: reservedAssetRoles.map(([role]) => role) },
        },
        select: { accountId: true },
      }),
      tx.$queryRaw<{ code: string }[]>`
      SELECT DISTINCT p.code FROM "FinanceDocument" d
      CROSS JOIN LATERAL (VALUES (d.data->'postingAccounts'->>'1000'),
        (d.data->'postingAccounts'->>'1300'), (d.data->'postingAccounts'->>'1400')) p(code)
      WHERE d.company=${company} AND d.status='POSTED' AND d.direction IN ('AR','AP') AND p.code IS NOT NULL`,
      tx.cashAccountSetting.findMany({
        where: { company, active: true },
        select: { accountId: true },
        distinct: ['accountId'],
      }),
    ]);
  const reservedCodes = new Set<string>([
    ...reservedAssetRoles.map(([, code]) => code),
    ...pastControls.map(({ code }) => code),
  ]);
  const reservedIds = new Set(
    [...reservedMappings, ...cashSettings].map(({ accountId }) => accountId),
  );
  const selectedIds = new Set(mappings.map(({ accountId }) => accountId));
  const accounts = ledger
    .map((account) => ({
      ...account,
      eligible:
        account.active &&
        (account.type !== 'ASSET' ||
          (!reservedCodes.has(account.code) && !reservedIds.has(account.id))),
    }))
    .filter(({ eligible, id }) => eligible || selectedIds.has(id));
  const selections = Object.fromEntries(
    PRODUCT_POSTING_ROLES.map(([field, kind]) => [
      field,
      mappings.find((mapping) => mapping.kind === kind)?.accountId ?? null,
    ]),
  ) as Record<keyof typeof accountLabels, string | null>;
  return { accounts, selections, product };
}

export async function getProductPostingAccounts(
  tx: Tx,
  company: string,
  productId: number,
) {
  const { accounts, selections } = await productPostingSettings(
    tx,
    company,
    productId,
  );
  return { accounts, selections };
}

export async function saveProductPostingAccounts(
  tx: Tx,
  company: string,
  actor: Actor,
  productId: number,
  body: unknown,
) {
  const input = v.object(body);
  const sourceId = String(productId);
  const { product, selections, accounts } = await productPostingSettings(
    tx,
    company,
    productId,
  );
  const changes = PRODUCT_POSTING_ROLES.map(([field, kind, , type]) => {
    const accountId =
      input[field] === null
        ? null
        : v.text(input[field], accountLabels[field], true, 100)!;
    const account = accounts.find(({ id }) => id === accountId);
    if (accountId !== null && (!account?.eligible || account.type !== type)) {
      throw new BadRequestException(
        `Select an eligible active ${type.toLowerCase()} account in this workspace for ${accountLabels[field].toLowerCase()}.`,
      );
    }
    return { field, kind, accountId };
  }).filter(({ field, accountId }) => selections[field] !== accountId);

  if (changes.length) {
    const changeDetails: Record<
      string,
      { previousAccount: string; account: string }
    > = {};
    const accountName = (id: string | null) => {
      if (!id) return 'Company default';
      const account = accounts.find((row) => row.id === id);
      return account ? `${account.code} · ${account.name}` : id;
    };
    for (const { field, kind, accountId } of changes) {
      const key = { company, kind, sourceId };
      const where = { company_kind_sourceId: key };
      if (accountId === null) await tx.accountingMapping.delete({ where });
      else
        await tx.accountingMapping.upsert({
          where,
          create: { ...key, accountId },
          update: { accountId },
        });
      changeDetails[accountLabels[field]] = {
        previousAccount: accountName(selections[field]),
        account: accountName(accountId),
      };
      selections[field] = accountId;
    }
    await audit(
      tx,
      company,
      actor,
      'UPDATE',
      'ProductPostingAccounts',
      sourceId,
      {
        sku: product.sku,
        product: product.name,
        ...changeDetails,
      },
    );
  }
  return { selections };
}
