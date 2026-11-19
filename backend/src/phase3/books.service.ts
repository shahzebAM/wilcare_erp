import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import * as v from '../importation/importation.validation';
import { financialReport, type ReportQuery } from './books.reports';
import { reportPeriod } from './books.reports';
import {
  cashAccounts,
  designateCashAccount,
  classifyCashEntry,
} from './cash-flow';
import {
  assertNotProductInventoryAccount,
  POSTING_ROLES,
  postingAccounts,
} from './posting-accounts';
import { inventoryReconciliation } from './inventory-reconciliation';
import {
  getProductPostingAccounts,
  saveProductPostingAccounts,
} from './product-posting-accounts';
import {
  Actor,
  assertApproval,
  audit,
  DEFAULT_ACCOUNTS,
  hasAccess,
  initializeAccounts,
  journalEntryMemo,
  money,
  nextNumber,
  postJournal,
  Tx,
} from './phase3.shared';

const accountTypes = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const;
const accountLevels = 5;
const accountUsageInclude = {
  _count: {
    select: {
      entries: true,
      mappings: true,
      reconciliations: true,
      children: true,
    },
  },
  children: { where: { active: true }, select: { id: true }, take: 1 },
} as const;
type AccountUsage = Prisma.LedgerAccountGetPayload<{
  include: typeof accountUsageInclude;
}>;

function accountDeleteAction(
  { _count, children }: Pick<AccountUsage, '_count' | 'children'>,
  isMappingSource: boolean,
): 'DELETE' | 'ARCHIVE' | 'BLOCKED' {
  if (children.length) return 'BLOCKED';
  return _count.entries ||
    _count.mappings ||
    _count.reconciliations ||
    _count.children ||
    isMappingSource
    ? 'ARCHIVE'
    : 'DELETE';
}
const journalInclude = {
  entries: {
    include: {
      account: true,
      statementLine: { select: { id: true, reconciliationId: true } },
    },
  },
} as const;
const reconciliationInclude = {
  account: true,
  lines: {
    include: { ledgerEntry: { include: { journal: true } } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.BankReconciliationInclude;

@Injectable()
export class BooksService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  report(company: string, kind: string, query: ReportQuery) {
    return financialReport(this.prisma, company, kind, query);
  }

  inventoryReconciliation(company: string, actor: Actor) {
    if (!hasAccess(actor, 'books') || !hasAccess(actor, 'finance'))
      throw new ForbiddenException(
        'Books and Finance read access are required for inventory reconciliation.',
      );
    return this.prisma.$transaction(
      (tx) => inventoryReconciliation(tx, company),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async cashFlowEntries(company: string, query: ReportQuery) {
    const period = reportPeriod(query);
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 50);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !Number.isSafeInteger((page - 1) * limit)
    )
      throw new BadRequestException('Invalid cash entry pagination.');
    return this.prisma.$transaction(
      async (tx) => {
        const accounts = await cashAccounts(tx, company);
        const ids = accounts
          .filter((account) => account.cash)
          .map((account) => account.id);
        const where = {
          accountId: { in: ids },
          journal: {
            company,
            status: 'POSTED',
            date: { gte: period.from, lt: period.end },
          },
        };
        const [entries, count] = await Promise.all([
          tx.ledgerEntry.findMany({
            where,
            include: {
              journal: true,
              cashClassifications: {
                where: { company },
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
            orderBy: [
              { journal: { date: 'asc' } },
              { journalId: 'asc' },
              { id: 'asc' },
            ],
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.ledgerEntry.count({ where }),
        ]);
        return {
          accounts,
          entries: entries.map((entry) => ({
            id: entry.id,
            accountId: entry.accountId,
            journal: entry.journal.number,
            date: entry.journal.date.toISOString(),
            amount: entry.debit.minus(entry.credit).toFixed(2),
            classification: entry.cashClassifications[0] ?? null,
          })),
          pagination: {
            page,
            count,
            pages: Math.max(1, Math.ceil(count / limit)),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  setCashAccount(company: string, actor: Actor, body: unknown) {
    return this.transaction(company, actor, (tx) =>
      designateCashAccount(tx, company, actor, body),
    );
  }

  classifyCash(company: string, actor: Actor, body: unknown) {
    return this.transaction(company, actor, (tx) =>
      classifyCashEntry(tx, company, actor, body),
    );
  }

  private async transaction<T>(
    company: string,
    actor: Actor,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    if (!hasAccess(actor, 'books', true))
      throw new ForbiddenException('Books write access is required.');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            if (
              !(await tx.company.findUnique({
                where: { name: company },
                select: { id: true },
              }))
            )
              throw new NotFoundException('This workspace is unavailable.');
            return work(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 20000,
          },
        );
      } catch (error: unknown) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : undefined;
        if (code === 'P2034' && attempt < 2) continue;
        if (code === 'P2034' || code === 'P2002')
          throw new ConflictException(
            'This accounting record changed or its reference is already used. Refresh and try again.',
          );
        throw error;
      }
    }
    throw new ConflictException(`Could not safely update Books in ${company}.`);
  }

  private async account(tx: Tx, company: string, id: string) {
    const account = await tx.ledgerAccount.findFirst({
      where: { id, company, active: true },
    });
    if (!account)
      throw new NotFoundException(
        'Active account not found in this workspace.',
      );
    return account;
  }

  private async validateAccountParent(
    tx: Tx,
    company: string,
    type: string,
    parentAccountId: string,
    accountId?: string,
  ) {
    const seen = new Set(accountId ? [accountId] : []);
    let ancestorId: string | null = parentAccountId;
    let parent: { code: string; name: string } | undefined;
    let parentDepth = 0;
    while (ancestorId !== null) {
      if (seen.has(ancestorId))
        throw new BadRequestException(
          'An account cannot be a subaccount of itself or one of its own subaccounts.',
        );
      seen.add(ancestorId);
      const ancestor: {
        code: string;
        name: string;
        active: boolean;
        type: string;
        parentAccountId: string | null;
      } | null = await tx.ledgerAccount.findFirst({
        where: { id: ancestorId, company },
        select: {
          code: true,
          name: true,
          active: true,
          type: true,
          parentAccountId: true,
        },
      });
      if (!ancestor || !ancestor.active)
        throw new BadRequestException(
          'The parent account and its parents must be active in this workspace.',
        );
      if (ancestor.type !== type)
        throw new BadRequestException(
          'A subaccount must have the same account type as its parent.',
        );
      parent ??= { code: ancestor.code, name: ancestor.name };
      ancestorId = ancestor.parentAccountId;
      parentDepth++;
      if (parentDepth >= accountLevels)
        throw new BadRequestException(
          'Accounts can be nested up to five levels.',
        );
    }

    if (accountId) {
      let levelIds = [accountId];
      for (
        let level = parentDepth + 1;
        level <= accountLevels && levelIds.length;
        level++
      ) {
        const children = await tx.ledgerAccount.findMany({
          where: { company, parentAccountId: { in: levelIds } },
          select: { id: true },
        });
        levelIds = children.map(({ id }) => id);
      }
      if (levelIds.length)
        throw new BadRequestException(
          'Moving this account would place its subaccounts beyond five levels.',
        );
    }
    return parent;
  }

  async overview(company: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const [
          accounts,
          journals,
          mappings,
          reconciliations,
          balances,
          products,
          customers,
          suppliers,
          accountSources,
        ] = await Promise.all([
          tx.ledgerAccount.findMany({
            where: { company },
            include: accountUsageInclude,
            orderBy: { code: 'asc' },
          }),
          tx.accountingJournal.findMany({
            where: { company },
            include: journalInclude,
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            take: 100,
          }),
          tx.accountingMapping.findMany({
            where: { company },
            include: { account: true },
            orderBy: [{ kind: 'asc' }, { sourceId: 'asc' }],
            take: 1000,
          }),
          tx.bankReconciliation.findMany({
            where: { company },
            include: reconciliationInclude,
            orderBy: { statementDate: 'desc' },
            take: 100,
          }),
          tx.ledgerEntry.groupBy({
            by: ['accountId'],
            where: {
              account: { company },
              journal: { company, status: 'POSTED' },
            },
            _sum: { debit: true, credit: true },
          }),
          tx.product.findMany({
            where: { company },
            select: { id: true, name: true, sku: true },
            orderBy: { name: 'asc' },
            take: 1000,
          }),
          tx.customer.findMany({
            where: { company },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 1000,
          }),
          tx.supplier.findMany({
            where: { company },
            select: { id: true, legalName: true },
            orderBy: { legalName: 'asc' },
            take: 1000,
          }),
          tx.accountingMapping.findMany({
            where: { company, kind: 'ACCOUNT' },
            select: { sourceId: true },
          }),
        ]);
        const sums = new Map(balances.map((row) => [row.accountId, row._sum]));
        const mappingSources = new Set(
          accountSources.map((row) => row.sourceId),
        );
        return {
          accounts: accounts.map(({ _count, children, ...account }) => ({
            ...account,
            deleteAction: accountDeleteAction(
              { _count, children },
              mappingSources.has(account.id),
            ),
          })),
          journals,
          mappings,
          reconciliations,
          mappingSources: {
            ITEM: products,
            CUSTOMER: customers,
            SUPPLIER: suppliers.map((supplier) => ({
              id: supplier.id,
              name: supplier.legalName,
            })),
            ACCOUNT: accounts
              .filter((account) => account.active)
              .map((account) => ({
                id: account.id,
                code: account.code,
                name: account.name,
              })),
            POSTING_ROLE: POSTING_ROLES.map(([id, code, type]) => ({
              id,
              code,
              name: `${id} · ${type} · default ${code}`,
            })),
          },
          trialBalance: accounts.map((account) => {
            const totals = sums.get(account.id);
            const debit = totals?.debit ?? new Prisma.Decimal(0);
            const credit = totals?.credit ?? new Prisma.Decimal(0);
            return {
              accountId: account.id,
              code: account.code,
              name: account.name,
              type: account.type,
              debit: debit.toFixed(2),
              credit: credit.toFixed(2),
              balance: debit.sub(credit).toFixed(2),
            };
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async initialize(company: string, actor: Actor) {
    return this.transaction(company, actor, async (tx) => {
      const accounts = await initializeAccounts(tx, company, actor);
      await audit(tx, company, actor, 'INITIALIZE', 'Books', company, {
        accountCodes: accounts.map((account) => account.code),
      });
      return { accounts };
    });
  }

  async unmatchedEntries(
    company: string,
    accountId: string,
    cursor?: string,
    requestedLimit?: string,
  ) {
    if (!accountId || typeof accountId !== 'string')
      throw new BadRequestException('A bank account ID is required.');
    const limit = requestedLimit === undefined ? 50 : Number(requestedLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException(
        'Ledger page size must be between 1 and 100.',
      );
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { company, id: accountId, active: true },
    });
    if (!account || account.type !== 'ASSET')
      throw new NotFoundException('Bank account not found in this workspace.');
    const where = {
      accountId,
      account: { company },
      journal: { company, status: 'POSTED' },
      statementLine: null,
    };
    if (
      cursor &&
      !(await this.prisma.ledgerEntry.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Invalid or already matched ledger cursor. Refresh this list.',
      );
    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      include: { journal: true, account: true },
      orderBy: [{ journal: { date: 'desc' } }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      entries: entries.slice(0, limit),
      nextCursor: entries.length > limit ? entries[limit - 1].id : null,
    };
  }

  async createAccount(company: string, actor: Actor, body: unknown) {
    const input = v.object(body);
    const code = v.text(input.code, 'Account code', true, 30)!;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(code))
      throw new BadRequestException(
        'Account code may contain letters, digits, dots, underscores, and hyphens.',
      );
    const name = v.text(input.name, 'Account name', true, 200)!;
    const type = v.choice(input.type, accountTypes, 'account type');
    const parentAccountId = v.text(
      input.parentAccountId,
      'Parent account',
      false,
      100,
    );
    const description = v.text(input.description, 'Description', false);
    const note = v.text(input.note, 'Note', false);
    const reserved = DEFAULT_ACCOUNTS.find(
      ([systemCode]) => systemCode === code,
    );
    if (reserved && reserved[2] !== type)
      throw new BadRequestException(
        `System account ${code} requires the ${reserved[2]} account type.`,
      );
    return this.transaction(company, actor, async (tx) => {
      if (
        await tx.ledgerAccount.findUnique({
          where: { company_code: { company, code } },
        })
      )
        throw new ConflictException(
          'This account code already exists in the workspace.',
        );
      const parent = parentAccountId
        ? await this.validateAccountParent(tx, company, type, parentAccountId)
        : undefined;
      const account = await tx.ledgerAccount.create({
        data: {
          company,
          code,
          name,
          type,
          ...(parentAccountId ? { parentAccountId } : {}),
          ...(description ? { description } : {}),
          ...(note ? { note } : {}),
        },
      });
      await audit(tx, company, actor, 'CREATE', 'LedgerAccount', account.id, {
        code,
        name,
        type,
        ...(parent
          ? {
              parentAccountId,
              parentAccount: `${parent.code} · ${parent.name}`,
            }
          : {}),
        ...(description ? { description } : {}),
        ...(note ? { note } : {}),
      });
      return account;
    });
  }

  async updateAccount(
    company: string,
    actor: Actor,
    id: string,
    body: unknown,
  ) {
    const accountId = v.text(id, 'Account ID', true, 100)!;
    const input = v.object(body);
    if ('code' in input || 'type' in input)
      throw new BadRequestException(
        'An existing account code and type are fixed.',
      );
    const edits = {
      name:
        input.name === undefined
          ? undefined
          : v.text(input.name, 'Account name', true, 200),
      parentAccountId:
        input.parentAccountId === undefined
          ? undefined
          : (v.text(input.parentAccountId, 'Parent account', false, 100) ??
            null),
      description:
        input.description === undefined
          ? undefined
          : (v.text(input.description, 'Description', false) ?? null),
      note:
        input.note === undefined
          ? undefined
          : (v.text(input.note, 'Note', false) ?? null),
    };
    return this.transaction(company, actor, async (tx) => {
      const account = await this.account(tx, company, accountId);
      const data = Object.fromEntries(
        Object.entries(edits).filter(
          ([key, value]) =>
            value !== undefined && value !== account[key as keyof typeof edits],
        ),
      ) as Partial<{
        name: string;
        parentAccountId: string | null;
        description: string | null;
        note: string | null;
      }>;
      if (!Object.keys(data).length) return account;
      const parent = data.parentAccountId
        ? await this.validateAccountParent(
            tx,
            company,
            account.type,
            data.parentAccountId,
            account.id,
          )
        : undefined;
      const updated = await tx.ledgerAccount.update({
        where: { id: account.id },
        data,
      });
      await audit(tx, company, actor, 'UPDATE', 'LedgerAccount', account.id, {
        code: account.code,
        type: account.type,
        ...data,
        ...(data.parentAccountId !== undefined
          ? {
              previousParentAccountId: account.parentAccountId,
              parentAccount: parent
                ? `${parent.code} · ${parent.name}`
                : 'Top-level account',
            }
          : {}),
      });
      return updated;
    });
  }

  async deleteAccount(company: string, actor: Actor, id: string) {
    if (actor.role !== 'Super Admin')
      throw new ForbiddenException(
        'Only a Super Admin can delete ledger accounts.',
      );
    const accountId = v.text(id, 'Account ID', true, 100)!;
    try {
      return await this.transaction(company, actor, async (tx) => {
        const account = await tx.ledgerAccount.findFirst({
          where: { id: accountId, company },
          include: accountUsageInclude,
        });
        if (!account)
          throw new NotFoundException('Account not found in this workspace.');
        if (!account.active)
          return { id: account.id, deleted: false, archived: true };
        if (account.children.length)
          throw new ConflictException(
            'Move or archive the active subaccounts before removing this parent account.',
          );
        const sourceMapping = await tx.accountingMapping.findFirst({
          where: { company, kind: 'ACCOUNT', sourceId: accountId },
          select: { id: true },
        });
        if (accountDeleteAction(account, !!sourceMapping) === 'ARCHIVE') {
          await tx.ledgerAccount.update({
            where: { id: account.id },
            data: { active: false },
          });
          await audit(
            tx,
            company,
            actor,
            'ARCHIVE',
            'LedgerAccount',
            account.id,
            {
              code: account.code,
              name: account.name,
              type: account.type,
              previousActive: true,
              active: false,
            },
          );
          return { id: account.id, deleted: false, archived: true };
        }
        await tx.ledgerAccount.delete({ where: { id: account.id } });
        await audit(tx, company, actor, 'DELETE', 'LedgerAccount', account.id, {
          code: account.code,
          name: account.name,
          type: account.type,
        });
        return { id: account.id, deleted: true };
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2003'
      )
        throw new ConflictException(
          'This account is now in use and cannot be deleted. Refresh the chart of accounts.',
        );
      throw error;
    }
  }

  async restoreAccount(company: string, actor: Actor, id: string) {
    if (actor.role !== 'Super Admin')
      throw new ForbiddenException(
        'Only a Super Admin can restore ledger accounts.',
      );
    const accountId = v.text(id, 'Account ID', true, 100)!;
    return this.transaction(company, actor, async (tx) => {
      const account = await tx.ledgerAccount.findFirst({
        where: { id: accountId, company },
      });
      if (!account)
        throw new NotFoundException('Account not found in this workspace.');
      if (account.active) return { id: account.id, active: true };
      if (account.parentAccountId)
        await this.validateAccountParent(
          tx,
          company,
          account.type,
          account.parentAccountId,
        );
      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: { active: true },
      });
      await audit(tx, company, actor, 'RESTORE', 'LedgerAccount', account.id, {
        code: account.code,
        name: account.name,
        type: account.type,
        previousActive: false,
        active: true,
      });
      return { id: account.id, active: true };
    });
  }

  async createJournal(company: string, actor: Actor, body: unknown) {
    const input = v.object(body);
    const date = v.date(input.date, 'Journal date');
    if (!date) throw new BadRequestException('Journal date is required.');
    const submissionKey = v.text(
      input.submissionKey ?? input.reference,
      'Journal submission key',
      true,
      150,
    )!;
    const memo = v.text(input.memo, 'Journal description', true, 2000)!;
    const lines = v.rows(input.lines).map((line) => ({
      code: v.text(line.code, 'Account code', true, 30)!,
      debit: money(line.debit, 'Debit').toFixed(2),
      credit: money(line.credit, 'Credit').toFixed(2),
      memo: journalEntryMemo(line.memo),
    }));
    return this.transaction(company, actor, (tx) =>
      postJournal(tx, company, actor, {
        sourceKey: `MANUAL:${submissionKey}`,
        sourceType: 'MANUAL',
        sourceId: submissionKey,
        date,
        memo,
        lines,
      }),
    );
  }

  async setMapping(company: string, actor: Actor, body: unknown) {
    const input = v.object(body);
    const kind = v.choice(
      input.kind,
      ['ITEM', 'CUSTOMER', 'SUPPLIER', 'ACCOUNT', 'POSTING_ROLE'],
      'mapping kind',
    );
    const sourceId = v.text(input.sourceId, 'Source ID', true, 200)!;
    const accountId = v.text(input.accountId, 'Account ID', true, 100)!;
    return this.transaction(company, actor, async (tx) => {
      const account = await this.account(tx, company, accountId);
      const role = POSTING_ROLES.find(([name]) => name === sourceId);
      if (kind === 'POSTING_ROLE' && (!role || account.type !== role[2]))
        throw new BadRequestException(
          'Select a valid posting role and an account with its required type.',
        );
      if (
        kind === 'POSTING_ROLE' &&
        role?.[2] === 'ASSET' &&
        role[1] !== '1200'
      )
        await assertNotProductInventoryAccount(tx, company, account.code);
      const source =
        kind === 'POSTING_ROLE'
          ? { id: sourceId }
          : kind === 'ITEM'
            ? /^[1-9]\d*$/.test(sourceId) &&
              Number.isSafeInteger(Number(sourceId))
              ? await tx.product.findFirst({
                  where: { id: Number(sourceId), company },
                  select: { id: true },
                })
              : null
            : kind === 'CUSTOMER'
              ? await tx.customer.findFirst({
                  where: { id: sourceId, company },
                  select: { id: true },
                })
              : kind === 'SUPPLIER'
                ? await tx.supplier.findFirst({
                    where: { id: sourceId, company },
                    select: { id: true },
                  })
                : await tx.ledgerAccount.findFirst({
                    where: { id: sourceId, company, active: true },
                    select: { id: true },
                  });
      if (!source)
        throw new NotFoundException(
          'Mapping source not found in this workspace.',
        );
      const previous = await tx.accountingMapping.findUnique({
        where: { company_kind_sourceId: { company, kind, sourceId } },
      });
      const mapping = await tx.accountingMapping.upsert({
        where: { company_kind_sourceId: { company, kind, sourceId } },
        create: { company, kind, sourceId, accountId },
        update: { accountId },
      });
      if (kind === 'POSTING_ROLE') {
        await postingAccounts(tx, company);
        if (sourceId === 'BANK_CASH') {
          const setting = (await cashAccounts(tx, company)).find(
            (row) => row.id === accountId,
          )!;
          if (!setting.cash)
            await designateCashAccount(tx, company, actor, {
              accountId,
              active: true,
              expectedVersion: setting.version,
            });
        }
      }
      await audit(
        tx,
        company,
        actor,
        previous ? 'UPDATE' : 'CREATE',
        'AccountingMapping',
        mapping.id,
        {
          kind,
          sourceId,
          accountId,
          previousAccountId: previous?.accountId ?? null,
        },
      );
      return mapping;
    });
  }

  productPostingAccounts(company: string, id: number) {
    return this.prisma.$transaction(
      (tx) => getProductPostingAccounts(tx, company, id),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  updateProductPostingAccounts(
    company: string,
    actor: Actor,
    id: number,
    body: unknown,
  ) {
    return this.transaction(company, actor, (tx) =>
      saveProductPostingAccounts(tx, company, actor, id, body),
    );
  }

  async createReconciliation(company: string, actor: Actor, body: unknown) {
    const input = v.object(body);
    const accountId = v.text(input.accountId, 'Bank account', true, 100)!;
    const statementDate = v.date(input.statementDate, 'Statement date');
    if (!statementDate)
      throw new BadRequestException('Statement date is required.');
    const openingBalance = money(input.openingBalance, 'Opening balance', true);
    const closingBalance = money(input.closingBalance, 'Closing balance', true);
    const lines = v.rows(input.lines).map((line) => {
      const date = v.date(line.date, 'Statement line date');
      if (!date || v.manilaDay(date) > v.manilaDay(statementDate))
        throw new BadRequestException(
          'Statement lines require dates on or before the statement date.',
        );
      const amount = money(line.amount, 'Statement amount', true);
      if (amount.eq(0))
        throw new BadRequestException(
          'Statement lines cannot have zero amounts.',
        );
      return {
        date,
        reference: v.text(line.reference, 'Line reference', true, 200)!,
        description: v.text(line.description, 'Description', true, 2000)!,
        amount,
      };
    });
    const keys = lines.map(
      (line) =>
        `${line.date.toISOString()}:${line.reference}:${line.amount.toFixed(2)}`,
    );
    v.unique(keys);
    if (
      !lines
        .reduce((sum, line) => sum.add(line.amount), openingBalance)
        .eq(closingBalance)
    )
      throw new BadRequestException(
        'Opening balance plus statement transactions must equal the closing balance.',
      );
    return this.transaction(company, actor, async (tx) => {
      const account = await this.account(tx, company, accountId);
      if (account.type !== 'ASSET')
        throw new BadRequestException(
          'Reconcile a bank or cash asset account.',
        );
      const previous = await tx.bankReconciliation.findFirst({
        where: { company, accountId, status: 'COMPLETED' },
        orderBy: { statementDate: 'desc' },
      });
      if (
        previous &&
        (!previous.closingBalance.eq(openingBalance) ||
          statementDate <= previous.statementDate)
      )
        throw new BadRequestException(
          'The next statement must follow the completed statement and use its closing balance as the opening balance.',
        );
      const reconciliation = await tx.bankReconciliation.create({
        data: {
          company,
          number: await nextNumber(tx, company, 'REC'),
          accountId,
          statementDate,
          openingBalance,
          closingBalance,
          createdBy: actor.username,
          lines: { create: lines },
        },
        include: reconciliationInclude,
      });
      await audit(
        tx,
        company,
        actor,
        'CREATE',
        'BankReconciliation',
        reconciliation.id,
        {
          accountId,
          openingBalance: openingBalance.toFixed(2),
          closingBalance: closingBalance.toFixed(2),
          lineCount: lines.length,
        },
      );
      return reconciliation;
    });
  }

  async matchStatementLine(
    company: string,
    actor: Actor,
    id: string,
    body: unknown,
  ) {
    const input = v.object(body);
    const lineId = v.text(input.lineId, 'Statement line ID', true, 100)!;
    const ledgerEntryId = v.text(
      input.ledgerEntryId,
      'Ledger entry ID',
      true,
      100,
    )!;
    return this.transaction(company, actor, async (tx) => {
      const reconciliation = await tx.bankReconciliation.findFirst({
        where: { id, company },
        include: { lines: true },
      });
      if (!reconciliation)
        throw new NotFoundException(
          'Reconciliation not found in this workspace.',
        );
      if (reconciliation.status !== 'DRAFT')
        throw new BadRequestException(
          'Completed reconciliations cannot be changed.',
        );
      const line = reconciliation.lines.find((row) => row.id === lineId);
      if (!line)
        throw new NotFoundException(
          'Statement line is not part of this reconciliation.',
        );
      if (line.ledgerEntryId) {
        if (line.ledgerEntryId === ledgerEntryId) return line;
        throw new ConflictException('This statement line is already matched.');
      }
      const entry = await tx.ledgerEntry.findFirst({
        where: {
          id: ledgerEntryId,
          accountId: reconciliation.accountId,
          account: { company },
          journal: { company, status: 'POSTED' },
        },
        include: { journal: true, statementLine: true },
      });
      if (!entry || !entry.debit.sub(entry.credit).eq(line.amount))
        throw new BadRequestException(
          'The ledger entry must have the same workspace, bank account, and signed amount.',
        );
      if (
        v.manilaDay(entry.journal.date) >
        v.manilaDay(reconciliation.statementDate)
      )
        throw new BadRequestException(
          'The ledger entry occurs after the statement date.',
        );
      if (entry.statementLine)
        throw new ConflictException(
          'This ledger entry is already matched to another statement line.',
        );
      const matched = await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { ledgerEntryId },
      });
      await audit(tx, company, actor, 'MATCH', 'BankReconciliation', id, {
        lineId,
        ledgerEntryId,
        amount: line.amount.toFixed(2),
      });
      return matched;
    });
  }

  async completeReconciliation(company: string, actor: Actor, id: string) {
    return this.transaction(company, actor, async (tx) => {
      const reconciliation = await tx.bankReconciliation.findFirst({
        where: { id, company },
        include: {
          lines: {
            include: {
              ledgerEntry: { include: { journal: true, account: true } },
            },
          },
        },
      });
      if (!reconciliation)
        throw new NotFoundException(
          'Reconciliation not found in this workspace.',
        );
      if (reconciliation.status !== 'DRAFT')
        throw new BadRequestException(
          'This reconciliation is already completed.',
        );
      if (
        !reconciliation.lines.length ||
        reconciliation.lines.some(
          (line) =>
            !line.ledgerEntry ||
            line.ledgerEntry.accountId !== reconciliation.accountId ||
            line.ledgerEntry.account.company !== company ||
            line.ledgerEntry.journal.company !== company ||
            line.ledgerEntry.journal.status !== 'POSTED' ||
            !line.ledgerEntry.debit
              .sub(line.ledgerEntry.credit)
              .eq(line.amount),
        )
      )
        throw new BadRequestException(
          'Every statement line must match a valid posted ledger entry.',
        );
      const statementClosing = reconciliation.lines.reduce(
        (sum, line) => sum.add(line.amount),
        reconciliation.openingBalance,
      );
      const endOfStatement = new Date(
        `${v.manilaDay(reconciliation.statementDate)}T00:00:00+08:00`,
      );
      endOfStatement.setUTCDate(endOfStatement.getUTCDate() + 1);
      const totals = await tx.ledgerEntry.aggregate({
        where: {
          accountId: reconciliation.accountId,
          account: { company },
          journal: { company, status: 'POSTED', date: { lt: endOfStatement } },
        },
        _sum: { debit: true, credit: true },
      });
      const ledgerClosing = (totals._sum.debit ?? new Prisma.Decimal(0)).sub(
        totals._sum.credit ?? 0,
      );
      if (
        !statementClosing.eq(reconciliation.closingBalance) ||
        !ledgerClosing.eq(reconciliation.closingBalance)
      )
        throw new BadRequestException(
          'Reconciliation difference must be zero against both the statement and the posted ledger balance.',
        );
      const statementVolume = reconciliation.lines.reduce(
        (sum, line) => sum.add(line.amount.abs()),
        new Prisma.Decimal(0),
      );
      assertApproval(
        actor,
        company,
        Prisma.Decimal.max(
          statementVolume,
          reconciliation.closingBalance.abs(),
        ),
      );
      const completed = await tx.bankReconciliation.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedBy: actor.username,
          completedAt: new Date(),
        },
        include: reconciliationInclude,
      });
      await audit(tx, company, actor, 'COMPLETE', 'BankReconciliation', id, {
        closingBalance: reconciliation.closingBalance.toFixed(2),
        ledgerClosing: ledgerClosing.toFixed(2),
        difference: '0.00',
      });
      return completed;
    });
  }

  async auditLog(company: string, cursor?: string, requestedLimit?: string) {
    const limit = requestedLimit === undefined ? 50 : Number(requestedLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException(
        'Audit page size must be between 1 and 100.',
      );
    if (
      cursor &&
      !(await this.prisma.erpAuditLog.findFirst({
        where: { id: cursor, company },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Invalid audit cursor for this workspace.');
    const records = await this.prisma.erpAuditLog.findMany({
      where: { company },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      records: records.slice(0, limit),
      nextCursor: records.length > limit ? records[limit - 1].id : null,
    };
  }
}
