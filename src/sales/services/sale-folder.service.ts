import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Sale, SaleFolder, SaleFolderItem } from '../entities';
import { Branch } from 'src/logistics/entities';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';
import { AddSalesToFolderDto, CreateSaleFolderDto, ReorderFolderSalesDto, UpdateSaleFolderDto } from '../dto/sale-folder.dto';

@Injectable()
export class SaleFolderService {
  constructor(
    @InjectRepository(SaleFolder)
    private readonly folderRepository: Repository<SaleFolder>,
    @InjectRepository(SaleFolderItem)
    private readonly itemRepository: Repository<SaleFolderItem>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async findAll(user: any, branchIdQuery?: string) {
    const branchId = this.resolveBranchId(user, branchIdQuery, false);
    const qb = this.folderRepository
      .createQueryBuilder('folder')
      .leftJoinAndSelect('folder.branch', 'branch')
      .loadRelationCountAndMap('folder.saleCount', 'folder.items')
      .where('folder.deletedAt IS NULL')
      .orderBy('folder.sortOrder', 'ASC')
      .addOrderBy('folder.name', 'ASC');

    if (branchId) qb.andWhere('folder.branch_id = :branchId', { branchId });

    const folders = await qb.getMany();
    return folders.map((folder) => this.toFolderDto(folder));
  }

  async findOne(id: string, user: any) {
    const folder = await this.folderRepository.findOne({
      where: { id },
      relations: ['branch', 'items', 'items.sale', 'items.sale.customer'],
    });
    if (!folder) throw new NotFoundException('No se encontró la carpeta.');
    this.assertCanAccessBranch(user, folder.branch.id);

    const items = (folder.items || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((item) => ({
        saleId: item.sale.id,
        invoiceNumber: item.sale.invoiceNumber,
        customerName: item.sale.customer?.name || item.sale.guestCustomer?.name || 'Consumidor final',
        status: item.sale.status,
        total: Number(item.sale.total),
        date: item.sale.date,
        sortOrder: item.sortOrder,
      }));

    return { ...this.toFolderDto(folder, items.length), sales: items };
  }

  async create(dto: CreateSaleFolderDto, user: any) {
    const branchId = this.resolveBranchId(user, dto.branchId, true);
    if (!branchId) throw new BadRequestException('branchId es obligatorio.');
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) throw new BadRequestException('branchId inexistente');

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    await this.assertUniqueName(branchId, name);

    const folder = this.folderRepository.create({
      name,
      color: dto.color?.trim() || null,
      sortOrder: dto.sortOrder ?? 0,
      createdById: user?.id ?? null,
      branch,
    });
    const saved = await this.folderRepository.save(folder);
    return this.toFolderDto(saved, 0);
  }

  async update(id: string, dto: UpdateSaleFolderDto, user: any) {
    const folder = await this.requireFolder(id, user);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('El nombre es obligatorio.');
      await this.assertUniqueName(folder.branch.id, name, folder.id);
      folder.name = name;
    }
    if (dto.color !== undefined) folder.color = dto.color?.trim() || null;
    if (dto.sortOrder !== undefined) folder.sortOrder = dto.sortOrder;
    const saved = await this.folderRepository.save(folder);
    const count = await this.itemRepository.count({ where: { folder: { id: saved.id } } });
    return this.toFolderDto(saved, count);
  }

  async remove(id: string, user: any) {
    const folder = await this.requireFolder(id, user);
    await this.itemRepository.delete({ folder: { id: folder.id } });
    await this.folderRepository.softDelete(folder.id);
    return { message: 'Carpeta eliminada' };
  }

  async addSales(id: string, dto: AddSalesToFolderDto, user: any) {
    const folder = await this.requireFolder(id, user);
    const sales = await this.saleRepository.find({
      where: { id: In(dto.saleIds) },
      relations: ['branch'],
    });

    const foundIds = new Set(sales.map((s) => s.id));
    const missing = dto.saleIds.filter((saleId) => !foundIds.has(saleId));
    if (missing.length) throw new NotFoundException('Una o más órdenes no existen.');

    const wrongBranch = sales.filter((s) => s.branch?.id !== folder.branch.id);
    if (wrongBranch.length) {
      throw new BadRequestException('Solo se pueden agrupar órdenes de la misma sucursal que la carpeta.');
    }

    const existing = await this.itemRepository.find({
      where: { folder: { id: folder.id }, sale: { id: In(dto.saleIds) } },
      relations: ['sale'],
    });
    const already = new Set(existing.map((item) => item.sale.id));
    const maxSort = await this.maxSort(folder.id);
    let next = maxSort + 1;
    const toInsert = sales
      .filter((sale) => !already.has(sale.id))
      .map((sale) =>
        this.itemRepository.create({
          folder,
          sale,
          sortOrder: next++,
        }),
      );

    if (toInsert.length) await this.itemRepository.save(toInsert);
    return this.findOne(folder.id, user);
  }

  async removeSale(id: string, saleId: string, user: any) {
    const folder = await this.requireFolder(id, user);
    const item = await this.itemRepository.findOne({
      where: { folder: { id: folder.id }, sale: { id: saleId } },
    });
    if (!item) throw new NotFoundException('La orden no está en esta carpeta.');
    await this.itemRepository.delete(item.id);
    return { message: 'Orden quitada de la carpeta' };
  }

  async reorder(id: string, dto: ReorderFolderSalesDto, user: any) {
    const folder = await this.requireFolder(id, user);
    const items = await this.itemRepository.find({
      where: { folder: { id: folder.id }, sale: { id: In(dto.items.map((i) => i.saleId)) } },
      relations: ['sale'],
    });
    const bySale = new Map(items.map((item) => [item.sale.id, item]));
    for (const row of dto.items) {
      const item = bySale.get(row.saleId);
      if (!item) throw new BadRequestException(`La orden ${row.saleId} no está en esta carpeta.`);
      item.sortOrder = row.sortOrder;
    }
    await this.itemRepository.save([...bySale.values()]);
    return this.findOne(folder.id, user);
  }

  private async requireFolder(id: string, user: any) {
    const folder = await this.folderRepository.findOne({ where: { id }, relations: ['branch'] });
    if (!folder) throw new NotFoundException('No se encontró la carpeta.');
    this.assertCanAccessBranch(user, folder.branch.id);
    return folder;
  }

  private async assertUniqueName(branchId: string, name: string, excludeId?: string) {
    const qb = this.folderRepository
      .createQueryBuilder('folder')
      .where('folder.branch_id = :branchId', { branchId })
      .andWhere('LOWER(folder.name) = LOWER(:name)', { name });
    if (excludeId) qb.andWhere('folder.id != :excludeId', { excludeId });
    const exists = await qb.getOne();
    if (exists) throw new BadRequestException('Ya existe una carpeta con ese nombre en la sucursal.');
  }

  private async maxSort(folderId: string) {
    const row = await this.itemRepository
      .createQueryBuilder('item')
      .select('COALESCE(MAX(item.sortOrder), -1)', 'max')
      .where('item.folder_id = :folderId', { folderId })
      .getRawOne();
    return Number(row?.max ?? -1);
  }

  private resolveBranchId(user: any, queryBranchId: string | undefined, required: boolean): string | undefined {
    if (!isSuperAdmin(user)) {
      if (!user?.branch?.id) throw new BadRequestException('El usuario no tiene una sucursal asignada.');
      return user.branch.id;
    }
    if (required && !queryBranchId) throw new BadRequestException('branchId es obligatorio.');
    return queryBranchId;
  }

  private assertCanAccessBranch(user: any, branchId: string) {
    if (isSuperAdmin(user)) return;
    if (user?.branch?.id !== branchId) throw new ForbiddenException('No tiene acceso a esta sucursal.');
  }

  private toFolderDto(folder: SaleFolder, saleCount?: number) {
    return {
      id: folder.id,
      name: folder.name,
      color: folder.color,
      sortOrder: folder.sortOrder,
      branchId: folder.branch?.id,
      branchName: folder.branch?.name,
      saleCount: saleCount ?? (folder as any).saleCount ?? 0,
      createdById: folder.createdById,
      createdAt: folder.createdAt,
    };
  }
}
