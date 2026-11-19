jest.mock('@prisma/client', () => {
  const actual =
    jest.requireActual<typeof import('@prisma/client')>('@prisma/client');
  return { ...actual, PrismaClient: jest.fn() };
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MasterInventoryController } from './master-inventory.controller';

describe('legacy inventory mutations with tracked stock', () => {
  const product = {
    id: 1,
    company: 'Surgicom',
    sku: 'MED-1',
    currentStock: 10,
  };
  const database = {
    product: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    supplier: { findFirst: jest.fn(), findMany: jest.fn() },
    warehouse: { findFirst: jest.fn(), delete: jest.fn() },
    warehouseLot: { aggregate: jest.fn(), count: jest.fn() },
    customerOrderLine: { count: jest.fn() },
    warehouseBin: { count: jest.fn() },
    warehouseStock: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    inventoryMovement: { create: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  let controller: MasterInventoryController;
  beforeEach(() => {
    jest.resetAllMocks();
    database.product.findUnique.mockResolvedValue(product);
    database.product.findFirst.mockResolvedValue(product);
    database.product.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ id: 5, ...data }),
    );
    database.product.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...product, ...data }),
    );
    database.warehouseLot.aggregate.mockResolvedValue({
      _sum: { quantity: 0 },
    });
    database.warehouseLot.count.mockResolvedValue(0);
    database.customerOrderLine.count.mockResolvedValue(0);
    database.warehouseBin.count.mockResolvedValue(0);
    database.warehouse.findFirst.mockResolvedValue({
      id: 2,
      company: 'Surgicom',
      status: 'Active',
    });
    database.warehouseStock.findUnique.mockResolvedValue({
      id: 'stock',
      company: 'Surgicom',
      quantity: 5,
    });
    database.warehouseStock.upsert.mockImplementation(
      ({ update }: { update: object }) => Promise.resolve(update),
    );
    database.$transaction.mockImplementation(
      (callback: (tx: typeof database) => Promise<unknown>) =>
        callback(database),
    );
    controller = new MasterInventoryController();
    Object.assign(Reflect.get(controller, 'prisma') as object, database);
  });

  it('creates item details, including zero reorder settings, without changing the initial Master receipt', async () => {
    database.product.findFirst.mockResolvedValueOnce({ parentProductId: null });
    database.supplier.findFirst.mockResolvedValueOnce({ id: 'supplier-1' });
    await expect(
      controller.createProduct({
        company: 'Surgicom',
        name: 'Item',
        sku: 'MED-5',
        parentProductId: 2,
        preferredSupplierId: 'supplier-1',
        manufacturerPartNumber: ' MFG-5 ',
        purchaseDescription: 'Package of ten',
        salesDescription: 'Sterile item',
        itemNotes: 'Check packaging',
        customFields: { ' Batch origin ': 'Catalog' },
        cmdn: 'CMDN-5',
        isActive: false,
        minQuantity: 0,
        reorderLevel: '0',
        initialQuantity: 7,
        username: 'operator',
      }),
    ).resolves.toMatchObject({
      parentProductId: 2,
      preferredSupplierId: 'supplier-1',
      manufacturerPartNumber: 'MFG-5',
      purchaseDescription: 'Package of ten',
      salesDescription: 'Sterile item',
      itemNotes: 'Check packaging',
      customFields: { 'Batch origin': 'Catalog' },
      cmdn: 'CMDN-5',
      isActive: false,
      minQuantity: 0,
      reorderLevel: 0,
      currentStock: 7,
    });
    expect(database.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-1', company: 'Surgicom' },
      select: { id: true },
    });
    expect(database.product.findFirst).toHaveBeenCalledWith({
      where: { id: 2, company: 'Surgicom', deletedAt: null },
      select: { parentProductId: true },
    });
    expect(database.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        company: 'Surgicom',
        productId: 5,
        productName: 'Item',
        sku: 'MED-5',
        type: 'RECEIVE',
        quantity: 7,
        previousStock: 0,
        newStock: 7,
        remarks: 'Initial System Entry (Master Stock)',
        user: 'operator',
        warehouseId: null,
        employeeId: null,
        batchNumber: null,
        expirationDate: null,
      },
    });
  });

  it('clears nullable details without touching Master Quantity and keeps the blank quantity defaults', async () => {
    await expect(
      controller.updateProduct('1', {
        manufacturerPartNumber: '   ',
        purchaseDescription: '',
        salesDescription: null,
        itemNotes: '',
        customFields: null,
        parentProductId: null,
        preferredSupplierId: null,
        minQuantity: '',
        reorderLevel: 0,
      }),
    ).resolves.toMatchObject({ currentStock: 10 });
    expect(database.product.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        manufacturerPartNumber: null,
        purchaseDescription: null,
        salesDescription: null,
        itemNotes: null,
        customFields: Prisma.DbNull,
        parentProductId: null,
        preferredSupplierId: null,
        minQuantity: 10,
        reorderLevel: 0,
      },
    });
    expect(database.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects self-parenting and ancestor cycles before saving', async () => {
    await expect(
      controller.updateProduct('1', { parentProductId: 1 }),
    ).rejects.toThrow('hierarchy cycle');
    expect(database.product.findFirst).not.toHaveBeenCalled();
    database.product.findFirst.mockResolvedValueOnce({ parentProductId: 1 });
    await expect(
      controller.updateProduct('1', { parentProductId: 2 }),
    ).rejects.toThrow('hierarchy cycle');
    expect(database.product.update).not.toHaveBeenCalled();
  });

  it('rejects parent products and suppliers that are unavailable in the workspace', async () => {
    database.product.findFirst.mockResolvedValueOnce(null);
    await expect(
      controller.updateProduct('1', { parentProductId: 2 }),
    ).rejects.toThrow('Parent product not found in this workspace');
    database.supplier.findFirst.mockResolvedValueOnce(null);
    await expect(
      controller.createProduct({
        company: 'Surgicom',
        preferredSupplierId: 'other-supplier',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.product.update).not.toHaveBeenCalled();
    expect(database.product.create).not.toHaveBeenCalled();
  });

  it.each([
    { manufacturerPartNumber: 'x'.repeat(101) },
    { purchaseDescription: 'x'.repeat(2001) },
    { salesDescription: 123 },
    { itemNotes: 'x'.repeat(4001) },
    { isActive: 'false' },
    { parentProductId: 2147483648 },
    { customFields: [] },
    { customFields: { ' ': 'value' } },
    { customFields: { first: '1', ' first ': '2' } },
    { customFields: { ['x'.repeat(61)]: 'value' } },
    { customFields: { field: 1 } },
    { customFields: { field: 'x'.repeat(501) } },
    {
      customFields: Object.fromEntries(
        Array.from({ length: 13 }, (_, index) => [`field${index}`, 'value']),
      ),
    },
  ])('rejects invalid item details %j', async (details) => {
    await expect(controller.updateProduct('1', details)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(database.product.update).not.toHaveBeenCalled();
  });

  it('lists only scoped supplier identities for the preferred supplier selector', async () => {
    database.supplier.findMany.mockResolvedValueOnce([
      { id: 'supplier-1', legalName: 'Supplier', tradeName: null },
    ]);
    await expect(
      controller.productSupplierOptions('Surgicom'),
    ).resolves.toEqual([
      { id: 'supplier-1', legalName: 'Supplier', tradeName: null },
    ]);
    expect(database.supplier.findMany).toHaveBeenCalledWith({
      where: { company: 'Surgicom' },
      orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
      select: { id: true, legalName: true, tradeName: true },
    });
  });

  it('preserves catalog edits and no-op quantities for tracked products', async () => {
    database.warehouseLot.count.mockResolvedValue(1);
    await expect(
      controller.updateProduct('1', { name: 'Updated', currentStock: 10 }),
    ).resolves.toMatchObject({ name: 'Updated', currentStock: 10 });
    expect(database.product.update).toHaveBeenCalledTimes(1);
  });

  it.each([9, 11])(
    'rejects legacy absolute quantity %s for a tracked product',
    async (currentStock) => {
      database.warehouseLot.count.mockResolvedValue(1);
      await expect(
        controller.updateProduct('1', { currentStock }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(database.product.update).not.toHaveBeenCalled();
    },
  );

  it('rejects decreases below tracked physical stock even when unreserved', async () => {
    database.warehouseLot.aggregate.mockResolvedValue({
      _sum: { quantity: 8 },
    });
    await expect(
      controller.updateProduct('1', { currentStock: 7 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.product.update).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, '', null, '2x', Number.POSITIVE_INFINITY, 2147483648])(
    'rejects invalid stock %s',
    async (currentStock) => {
      await expect(
        controller.updateProduct('1', { currentStock }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(database.product.update).not.toHaveBeenCalled();
    },
  );

  it('keeps the new product controls behind the fulfillment endpoint', async () => {
    await controller.updateProduct('1', {
      name: 'Updated',
      expiryControlled: true,
      serialControlled: true,
    });
    expect(database.product.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: 'Updated' },
    });
  });

  it('allows an untracked balance update inside a serializable transaction', async () => {
    await expect(
      controller.updateProduct('1', { currentStock: '12' }),
    ).resolves.toMatchObject({ currentStock: 12 });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(database.$queryRaw).toHaveBeenCalled();
  });

  it.each([-1, 1])(
    'blocks both halves of old multipart transfers when tracked (delta %s)',
    async (quantity) => {
      database.warehouseLot.count.mockResolvedValue(1);
      await expect(
        controller.assignStock({
          productId: 1,
          company: 'Surgicom',
          warehouseId: '2',
          quantity,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(database.warehouseStock.upsert).not.toHaveBeenCalled();
    },
  );

  it('updates a valid untracked hub delta using catalog SKU and the locked current balance', async () => {
    await expect(
      controller.assignStock({
        productId: 1,
        company: 'Surgicom',
        warehouseId: '2',
        quantity: -2,
        sku: 'spoofed',
      }),
    ).resolves.toMatchObject({ quantity: 3 });
    expect(database.warehouseStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sku: 'MED-1',
          quantity: 3,
        }) as unknown,
      }),
    );
  });

  it('rejects negative hub totals and foreign-company balances', async () => {
    await expect(
      controller.assignStock({
        productId: 1,
        company: 'Surgicom',
        warehouseId: '2',
        quantity: -6,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    database.warehouseStock.findUnique.mockResolvedValueOnce({
      company: 'Other',
      quantity: 5,
    });
    await expect(
      controller.assignStock({
        productId: 1,
        company: 'Surgicom',
        warehouseId: '2',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.warehouseStock.upsert).not.toHaveBeenCalled();
  });

  it('keeps tracked products, facility history and hub balances from being deleted', async () => {
    database.warehouseLot.count.mockResolvedValue(1);
    await expect(controller.removeProduct('1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(controller.removeWarehouse('2')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      controller.clearAllHubStocks('Surgicom'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.product.delete).not.toHaveBeenCalled();
    expect(database.warehouse.delete).not.toHaveBeenCalled();
    expect(database.warehouseStock.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a separately submitted legacy ledger entry for tracked stock', async () => {
    database.warehouseLot.count.mockResolvedValue(1);
    await expect(
      controller.createMovement({
        company: 'Surgicom',
        productId: 1,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves a draft customer order product before any stock lot exists', async () => {
    database.customerOrderLine.count.mockResolvedValueOnce(1);
    await expect(controller.removeProduct('1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(database.product.delete).not.toHaveBeenCalled();
  });
});
