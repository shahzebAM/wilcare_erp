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
        ledgerAccount: { findMany: jest.fn().mockResolvedValue([account]) },
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
