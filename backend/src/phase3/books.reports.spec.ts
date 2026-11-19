import { BadRequestException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { financialReport, reportPeriod } from './books.reports';
const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);

describe('Approved ledger report calendar rules', () => {
  it('uses inclusive Manila days with an exclusive next-midnight boundary', () => {
    expect(reportPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      from: new Date('2026-09-30T16:00:00Z'),
      end: new Date('2026-10-31T16:00:00Z'),
      fromDay: '2026-10-01',
      toDay: '2026-10-31',
    });
  });
  it('handles leap-day and year-end cutoffs without local host timezone assumptions', () => {
    expect(reportPeriod({ asOf: '2028-02-29' }).end.toISOString()).toBe(
      '2028-02-29T16:00:00.000Z',
    );
    expect(
      reportPeriod({ from: '2026-12-31', to: '2026-12-31' }).end.toISOString(),
    ).toBe('2026-12-31T16:00:00.000Z');
  });
  it.each([
    {},
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-10-02', to: '2026-10-01' },
    { from: '0000-01-01', to: '2026-10-01' },
    { from: '2026-10-01T03:00:00Z', to: '2026-10-01' },
  ])('rejects malformed, missing or reversed dates: %j', (input) => {
    expect(() => reportPeriod(input)).toThrow(BadRequestException);
  });
});

describe('General-ledger entry memo reporting', () => {
  it.each(['false', 'true'])(
    'uses individual entry memos and falls back to the journal summary for legacy entries (export=%s)',
    async (exportValue) => {
      const amount = (value: string) => new Prisma.Decimal(value);
      const account = {
        id: 'cash',
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        active: true,
        parentAccountId: 'bank-group',
      };
      const parent = {
        ...account,
        id: 'bank-group',
        code: '0900',
        parentAccountId: null,
      };
      const entries = ['Snacks', 'Delivery charge', null].map(
        (memo, index) => ({
          id: `entry-${index}`,
          accountId: account.id,
          journalId: 'journal-1',
          memo,
          debit: amount('10.00'),
          credit: amount('0.00'),
          journal: {
            date: new Date('2026-11-12T00:00:00Z'),
            number: 'JRN-1',
            memo: 'Petty cash summary',
          },
        }),
      );
      const tx = {
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([parent, account]),
        },
        ledgerEntry: {
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                accountId: account.id,
                _sum: { debit: amount('30'), credit: amount('0') },
              },
            ]),
          findMany: jest.fn().mockResolvedValue(entries),
          count: jest.fn().mockResolvedValue(entries.length),
        },
      };
      const db = {
        $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
          work(tx),
        ),
      } as unknown as PrismaClient;
      const result = await financialReport(db, 'Wilcare', 'general-ledger', {
        from: '2026-11-01',
        to: '2026-11-30',
        accountId: account.id,
        export: exportValue,
      });
      expect(result).toMatchObject({
        rows: [
          { memo: 'Snacks', debit: '10.00', balance: '10.00' },
          { memo: 'Delivery charge', debit: '10.00', balance: '20.00' },
          { memo: 'Petty cash summary', debit: '10.00', balance: '30.00' },
        ],
      });
      expect(tx.ledgerEntry.findMany).toHaveBeenCalledWith(
        containing({
          where: containing({
            accountId: account.id,
            account: { company: 'Wilcare' },
            journal: containing({
              company: 'Wilcare',
              status: 'POSTED',
            }),
          }),
        }),
      );
    },
  );
});

describe('Financial report account hierarchy', () => {
  const account = (
    id: string,
    code: string,
    name: string,
    type: string,
    parentAccountId: string | null = null,
    active = true,
  ) => ({ id, code, name, type, parentAccountId, active });
  const accounts = [
    account('cash', '1000', 'Cash', 'ASSET'),
    account('capital', '3000', 'Capital', 'EQUITY'),
    account('sales', '4000', 'Sales', 'REVENUE'),
    account('operations', '5000', 'Operations', 'EXPENSE'),
    account('shipping', '5100', 'Shipping', 'EXPENSE'),
    account('utilities', '7100', 'Utilities', 'EXPENSE', 'operations', false),
    account('power', '7110', 'Power', 'EXPENSE', 'utilities', false),
    account('petty', '8000', 'Petty cash', 'ASSET', 'cash'),
  ];
  const sums = (accountId: string, debit: string, credit: string) => ({
    accountId,
    _sum: {
      debit: new Prisma.Decimal(debit),
      credit: new Prisma.Decimal(credit),
    },
  });
  const opening = [
    sums('cash', '80.00', '0.00'),
    sums('petty', '20.00', '0.00'),
    sums('capital', '0.00', '100.00'),
  ];
  const movement = [
    sums('cash', '0.00', '10.10'),
    sums('petty', '120.23', '0.00'),
    sums('sales', '0.00', '120.23'),
    sums('operations', '0.01', '0.00'),
    sums('utilities', '10.02', '0.00'),
    sums('power', '0.03', '0.00'),
    sums('shipping', '0.04', '0.00'),
  ];
  const report = (kind: string, fixture = accounts) => {
    const tx = {
      ledgerAccount: { findMany: jest.fn().mockResolvedValue(fixture) },
      ledgerEntry: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce(opening)
          .mockResolvedValueOnce(movement),
      },
    };
    const db = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaClient;
    return financialReport(db, 'Wilcare', kind, {
      from: '2026-11-01',
      to: '2026-11-30',
    });
  };

  it('groups nested and archived expenses while counting direct balances once in profit and loss', async () => {
    expect(await report('profit-loss')).toMatchObject({
      rows: [
        { accountId: 'sales', depth: 0, amount: '120.23' },
        { accountId: 'operations', depth: 0, amount: '0.01' },
        { accountId: 'utilities', depth: 1, amount: '10.02', active: false },
        {
          accountId: 'power',
          parentAccountId: 'utilities',
          accountPath: 'Operations › Utilities › Power',
          depth: 2,
          amount: '0.03',
        },
        { accountId: 'shipping', depth: 0, amount: '0.04' },
      ],
      accountSubtotals: [
        { accountId: 'operations', amount: '10.06' },
        { accountId: 'utilities', amount: '10.05' },
      ],
      totals: { revenue: '120.23', expenses: '10.10', profit: '110.13' },
    });
  });

  it('includes opening and current movements at exact cents in Balance Sheet and Trial Balance', async () => {
    expect(await report('balance-sheet')).toMatchObject({
      rows: [
        { accountId: 'cash', amount: '69.90' },
        { accountId: 'petty', parentAccountId: 'cash', amount: '140.23' },
        { accountId: 'capital', amount: '100.00' },
        { name: 'Unclosed ledger earnings', amount: '110.13' },
      ],
      accountSubtotals: [{ accountId: 'cash', amount: '210.13' }],
      totals: { assets: '210.13', equity: '210.13', difference: '0.00' },
    });
    expect(await report('trial-balance')).toMatchObject({
      accountSubtotals: [
        {
          accountId: 'cash',
          openingDebit: '100.00',
          openingCredit: '0.00',
          debit: '120.23',
          credit: '10.10',
          closingDebit: '210.13',
          closingCredit: '0.00',
        },
        { accountId: 'operations', debit: '10.06' },
        { accountId: 'utilities', debit: '10.05' },
      ],
      totals: {
        openingDebit: '100.00',
        openingCredit: '100.00',
        debit: '130.33',
        credit: '130.33',
        closingDebit: '220.23',
        closingCredit: '220.23',
        difference: '0.00',
      },
    });
  });

  it('keeps reports flat when legacy accounts have no parent', async () => {
    const result = await report(
      'profit-loss',
      accounts.map((row) => ({ ...row, parentAccountId: null })),
    );
    expect(result).toMatchObject({ accountSubtotals: [] });
    expect(
      result.rows?.find(
        (row) => 'accountId' in row && row.accountId === 'operations',
      ),
    ).not.toHaveProperty('depth');
  });
});
