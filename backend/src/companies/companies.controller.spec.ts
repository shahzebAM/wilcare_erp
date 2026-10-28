import { ForbiddenException } from '@nestjs/common';
import type { DocumentService } from '../documentation/document.service';
import { CompaniesController } from './companies.controller';

jest.mock('@prisma/client', () => {
  const mockClient = {
    company: { findMany: jest.fn(), create: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockClient), mockClient };
});

const prisma = jest.requireMock<{
  mockClient: { company: { findMany: jest.Mock; create: jest.Mock } };
}>('@prisma/client').mockClient;

describe('Wilcare company defaults', () => {
  const documents = { deleteCompanyWorkspace: jest.fn() };
  let controller: CompaniesController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new CompaniesController(
      documents as unknown as DocumentService,
    );
  });

  it('hides legacy company names and retains Wilcare and dynamically added companies', async () => {
    const companies = [
      { name: 'Olten' },
      { name: ' surgicom ' },
      { name: 'ORDENT' },
      { name: 'Wilcare' },
      { name: 'New Company' },
    ];
    prisma.company.findMany.mockResolvedValue(companies);
    await expect(controller.findAll()).resolves.toEqual([
      { name: 'Wilcare' },
      { name: 'New Company' },
    ]);
    expect(prisma.company.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
    });
    expect(companies).toHaveLength(5);
  });

  it('keeps Add Company available for other company names', async () => {
    prisma.company.create.mockResolvedValue({
      id: 'new-company',
      name: 'New Company',
    });
    await expect(controller.create({ name: 'New Company' })).resolves.toEqual({
      id: 'new-company',
      name: 'New Company',
    });
    expect(prisma.company.create).toHaveBeenCalledWith({
      data: { name: 'New Company' },
    });
  });

  it.each(['Olten', ' surgicom ', 'ORDENT'])(
    'rejects creation of a hidden legacy company: %s',
    async (name) => {
      await expect(controller.create({ name })).rejects.toMatchObject({
        status: 400,
      });
      expect(prisma.company.create).not.toHaveBeenCalled();
    },
  );

  it.each(['Wilcare', 'WILCARE', ' Wilcare '])(
    'protects the built-in workspace from deletion: %s',
    async (name) => {
      await expect(controller.remove(name)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(documents.deleteCompanyWorkspace).not.toHaveBeenCalled();
    },
  );

  it('retains normal deletion for other companies', async () => {
    documents.deleteCompanyWorkspace.mockResolvedValue({
      id: 'new-company',
      name: 'New Company',
    });
    await expect(controller.remove('New Company')).resolves.toEqual({
      id: 'new-company',
      name: 'New Company',
    });
    expect(documents.deleteCompanyWorkspace).toHaveBeenCalledWith(
      'New Company',
    );
  });
});
