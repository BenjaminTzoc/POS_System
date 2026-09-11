import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Inventory } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { ProductService } from './product.service';
import { BranchService } from './branch.service';
import { CreateInventoryDto, InventoryResponseDto, UpdateInventoryDto, BulkCreateInventoryDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
    private readonly branchService: BranchService,
  ) {}

  async create(dto: CreateInventoryDto): Promise<InventoryResponseDto> {
    let product;
    try {
      product = await this.productService.findOne(dto.productId);
    } catch (error) {
      throw new BadRequestException(`El producto con ID ${dto.productId} no existe`);
    }

    let branch;
    try {
      branch = await this.branchService.findOne(dto.branchId);
    } catch (error) {
      throw new BadRequestException(`La sucursal con ID ${dto.branchId} no existe`);
    }

    const existingInventory = await this.inventoryRepository.findOne({
      where: {
        product: { id: dto.productId },
        branch: { id: dto.branchId },
        deletedAt: IsNull(),
      },
    });

    if (existingInventory) {
      throw new ConflictException(`Ya existe un inventario para el producto: '${product.name}' en la sucursal: '${branch.name}'`);
    }

    this.validateStockLimits(dto.stock, dto.minStock, dto.maxStock);

    const inventory = this.inventoryRepository.create({
      product: { id: dto.productId },
      branch: { id: dto.branchId },
      stock: dto.stock,
      minStock: dto.minStock || 0,
      maxStock: dto.maxStock || undefined,
    });

    const savedInventory = await this.inventoryRepository.save(inventory);
    return this.findOne(savedInventory.id);
  }

  async createBulk(dto: BulkCreateInventoryDto, defaultBranchId?: string): Promise<InventoryResponseDto[]> {
    const branchId = dto.branchId || defaultBranchId;
    if (!branchId) {
      throw new BadRequestException('Debe especificar una sucursal para el registro masivo');
    }

    let branch;
    try {
      branch = await this.branchService.findOne(branchId);
    } catch (error) {
      throw new BadRequestException(`La sucursal con ID ${branchId} no existe`);
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un producto para registrar inventario');
    }

    // Validar duplicados dentro de la misma lista entrante
    const productIdsInPayload = dto.items.map(i => i.productId);
    const uniqueProductIds = new Set(productIdsInPayload);
    if (uniqueProductIds.size !== productIdsInPayload.length) {
      throw new BadRequestException('Existen productos duplicados en la lista enviada');
    }

    // Validar límites de stock de cada item
    for (const [index, item] of dto.items.entries()) {
      try {
        this.validateStockLimits(item.stock, item.minStock, item.maxStock);
      } catch (e) {
        throw new BadRequestException(`Error en fila ${index + 1}: ${e.message}`);
      }
    }

    // Ejecutar en una transacción usando el EntityManager del repositorio
    const savedInventories = await this.inventoryRepository.manager.transaction(async (transactionalEntityManager) => {
      const createdEntities: Inventory[] = [];

      for (const item of dto.items) {
        // Verificar existencia del producto
        const product = await transactionalEntityManager.getRepository(Inventory).manager.findOne(
          this.productService['productRepository'].target,
          { where: { id: item.productId } }
        ) as any;

        if (!product) {
          throw new BadRequestException(`El producto con ID ${item.productId} no existe`);
        }

        // Verificar si ya existe inventario activo para este producto en la sucursal
        const existingInventory = await transactionalEntityManager.findOne(Inventory, {
          where: {
            product: { id: item.productId },
            branch: { id: branchId },
            deletedAt: IsNull(),
          },
        });

        if (existingInventory) {
          throw new ConflictException(`Ya existe inventario para el producto '${product.name}' en la sucursal '${branch.name}'`);
        }

        const newInventory = transactionalEntityManager.create(Inventory, {
          product: { id: item.productId },
          branch: { id: branchId },
          stock: item.stock,
          minStock: item.minStock || 0,
          maxStock: item.maxStock || undefined,
        });

        createdEntities.push(newInventory);
      }

      return await transactionalEntityManager.save(Inventory, createdEntities);
    });

    // Retornar los inventarios creados con sus relaciones
    const ids = savedInventories.map(inv => inv.id);
    const results = await this.inventoryRepository.find({
      where: ids.map(id => ({ id })),
      relations: ['product', 'product.category', 'product.unit', 'branch'],
    });

    return plainToInstance(InventoryResponseDto, results);
  }


  async findAll(branchId?: string): Promise<InventoryResponseDto[]> {
    const queryBuilder = this.inventoryRepository.createQueryBuilder('inventory').leftJoinAndSelect('inventory.product', 'product').leftJoinAndSelect('product.category', 'category').leftJoinAndSelect('product.unit', 'unit').leftJoinAndSelect('inventory.branch', 'branch').where('inventory.deletedAt IS NULL');

    if (branchId) {
      queryBuilder.andWhere('branch.id = :branchId', { branchId });
    }

    const inventories = await queryBuilder.select(['inventory.id', 'inventory.stock', 'inventory.minStock', 'inventory.maxStock', 'inventory.lastMovementDate', 'inventory.createdAt', 'product.id', 'product.imageUrl', 'product.name', 'product.sku', 'product.barcode', 'product.price', 'product.cost', 'product.isActive', 'product.manageStock', 'category.id', 'category.name', 'unit.id', 'unit.name', 'unit.abbreviation', 'unit.allowsDecimals', 'branch.id', 'branch.name']).orderBy('branch.name', 'ASC').addOrderBy('product.name', 'ASC').getMany();

    return plainToInstance(InventoryResponseDto, inventories);
  }

  async findAllWithoutFilter(user?: any): Promise<InventoryResponseDto[]> {
    const inventories = await this.inventoryRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['product', 'product.category', 'product.unit', 'branch'],
      select: {
        id: true,
        product: {
          id: true,
          imageUrl: true,
          name: true,
          price: true,
          category: {
            id: true,
            name: true,
          },
        },
        branch: {
          id: true,
          name: true,
        },
        stock: true,
        lastMovementDate: true,
        createdAt: true,
      },
      order: { createdAt: 'DESC' },
    });
    return plainToInstance(InventoryResponseDto, inventories);
  }

  async findOne(id: string): Promise<InventoryResponseDto> {
    const inventory = await this.inventoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'product.category', 'product.unit', 'branch'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventario con ID ${id} no encontrado`);
    }

    return plainToInstance(InventoryResponseDto, inventory);
  }

  async findByProductAndBranch(productId: string, branchId: string): Promise<InventoryResponseDto> {
    const inventory = await this.inventoryRepository.findOne({
      where: {
        product: { id: productId },
        branch: { id: branchId },
        deletedAt: IsNull(),
      },
      relations: ['product', 'product.category', 'product.unit', 'branch'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventario no encontrado para el producto ${productId} en la sucursal ${branchId}`);
    }

    return plainToInstance(InventoryResponseDto, inventory);
  }

  async findByProduct(productId: string): Promise<InventoryResponseDto[]> {
    const inventories = await this.inventoryRepository.find({
      where: {
        product: { id: productId },
        deletedAt: IsNull(),
      },
      relations: ['product', 'product.category', 'product.unit', 'branch'],
      order: { stock: 'DESC' },
    });

    return plainToInstance(InventoryResponseDto, inventories);
  }

  async findByBranch(branchId: string): Promise<InventoryResponseDto[]> {
    const inventories = await this.inventoryRepository.find({
      where: {
        branch: { id: branchId },
        deletedAt: IsNull(),
      },
      relations: ['product', 'product.category', 'product.unit', 'branch'],
      order: { product: { name: 'ASC' } },
    });

    return plainToInstance(InventoryResponseDto, inventories);
  }

  async update(id: string, dto: UpdateInventoryDto): Promise<InventoryResponseDto> {
    const inventory = await this.inventoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'branch'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventario con ID ${id} no encontrado`);
    }

    this.validateStockLimits(dto.stock ?? inventory.stock, dto.minStock ?? inventory.minStock, dto.maxStock ?? inventory.maxStock);

    Object.assign(inventory, {
      stock: dto.stock ?? inventory.stock,
      minStock: dto.minStock ?? inventory.minStock,
      maxStock: dto.maxStock ?? inventory.maxStock,
    });

    await this.inventoryRepository.save(inventory);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const inventory = await this.inventoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['movements'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventario con ID ${id} no encontrado`);
    }

    if (inventory.movements && inventory.movements.length > 0) {
      throw new ConflictException('No se puede eliminar el inventario porque tiene movimientos asociados');
    }

    await this.inventoryRepository.softRemove(inventory);
    return { message: 'Inventario eliminado exitosamente' };
  }

  async restore(id: string): Promise<InventoryResponseDto> {
    const inventory = await this.inventoryRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['product', 'product.category', 'product.unit', 'branch'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventario con ID ${id} no encontrado`);
    }

    if (!inventory.deletedAt) {
      throw new ConflictException(`El inventario con ID ${id} no está eliminado`);
    }

    inventory.deletedAt = null;
    await this.inventoryRepository.save(inventory);
    return this.findOne(id);
  }

  async getLowStock(branchId?: string): Promise<InventoryResponseDto[]> {
    const query = this.inventoryRepository.createQueryBuilder('inventory').leftJoinAndSelect('inventory.product', 'product').leftJoinAndSelect('product.category', 'category').leftJoinAndSelect('product.unit', 'unit').leftJoinAndSelect('inventory.branch', 'branch').where('inventory.deletedAt IS NULL').andWhere('inventory.stock <= inventory.minStock');

    if (branchId) {
      query.andWhere('inventory.branch_id = :branchId', { branchId });
    }

    query.orderBy('inventory.stock', 'ASC');

    const inventories = await query.getMany();
    return plainToInstance(InventoryResponseDto, inventories);
  }

  async getInventoryStats(branchId?: string): Promise<{
    totalProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    totalValue: number;
  }> {
    const query = this.inventoryRepository.createQueryBuilder('inventory').leftJoinAndSelect('inventory.product', 'product').where('inventory.deletedAt IS NULL');

    if (branchId) {
      query.andWhere('inventory.branch_id = :branchId', { branchId });
    }

    const inventories = await query.getMany();

    const totalProducts = inventories.length;
    const lowStockProducts = inventories.filter((inv) => inv.stock > 0 && inv.stock <= inv.minStock).length;
    const outOfStockProducts = inventories.filter((inv) => inv.stock === 0).length;
    const totalValue = inventories.reduce((sum, inv) => sum + inv.stock * inv.product.cost, 0);

    return {
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      totalValue: Number(totalValue.toFixed(2)),
    };
  }

  private validateStockLimits(stock: number, minStock?: number, maxStock?: number | null): void {
    if (minStock && minStock < 0) {
      throw new BadRequestException('El stock mínimo no puede ser negativo');
    }

    if (maxStock && maxStock < 0) {
      throw new BadRequestException('El stock máximo no puede ser negativo');
    }

    if (maxStock && minStock && minStock > maxStock) {
      throw new BadRequestException('El stock mínimo no puede ser mayor al stock máximo');
    }

    if (maxStock && stock > maxStock) {
      throw new BadRequestException('El stock no puede ser mayor al stock máximo');
    }

    if (stock < 0) {
      throw new BadRequestException('El stock no puede ser negativo');
    }
  }
}
