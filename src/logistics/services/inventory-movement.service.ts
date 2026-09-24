import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Inventory, InventoryMovement } from '../entities';
import { DataSource, IsNull, Repository } from 'typeorm';
import { BranchService, InventoryService, ProductService } from '.';
import { CreateInventoryMovementDto, InventoryMovementResponseDto, UpdateInventoryMovementDto, QueryInventoryMovementDto, PaginatedInventoryMovementResponseDto } from '../dto';
import { MovementStatus, MovementType, MovementConcept } from '../entities/inventory-movement.entity';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class InventoryMovementService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly movementRepository: Repository<InventoryMovement>,
    private readonly productService: ProductService,
    private readonly branchService: BranchService,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateInventoryMovementDto, userId?: string, isInternal: boolean = false, manager?: any): Promise<InventoryMovementResponseDto> {
    const repo = manager ? manager.getRepository(InventoryMovement) : this.movementRepository;
    const invRepo = manager ? manager.getRepository(Inventory) : this.dataSource.getRepository(Inventory);
    if (!isInternal && (dto.concept === MovementConcept.SALE || dto.concept === MovementConcept.PURCHASE || dto.concept === MovementConcept.TRANSFER)) {
      throw new BadRequestException('Los movimientos de venta, compra y transferencia no pueden crearse manualmente. Utilice los módulos correspondientes.');
    }

    if (dto.concept === MovementConcept.WASTE && dto.type !== MovementType.OUT) {
      throw new BadRequestException('Los movimientos de merma (WASTE) deben ser de tipo salida (OUT).');
    }

    let product;
    try {
      product = await this.productService.findOne(dto.productId);
    } catch (error) {
      throw new BadRequestException(`El producto con ID ${dto.productId} no existe`);
    }

    if (!product.manageStock) {
      throw new BadRequestException(`El producto "${product.name}" no gestiona control de stock numérico y no admite movimientos de kárdex.`);
    }

    if (product.isMaster) {
      throw new BadRequestException(`El producto "${product.name}" es un producto maestro y no admite movimientos directos de inventario.`);
    }

    let branch;
    try {
      branch = await this.branchService.findOne(dto.branchId);
    } catch (error) {
      throw new BadRequestException(`La sucursal con ID ${dto.branchId} no existe`);
    }

    let inventory: any = null;
    if (dto.inventoryId) {
      try {
        inventory = await this.inventoryService.findOne(dto.inventoryId);
        if (inventory.product.id !== dto.productId || inventory.branch.id !== dto.branchId) {
          throw new BadRequestException('El inventory no corresponde al producto y sucursal especificados');
        }
      } catch (error) {
        throw new BadRequestException(`El inventory con ID ${dto.inventoryId} no existe`);
      }
    } else {
      inventory = await this.dataSource.getRepository(Inventory).findOne({
        where: {
          product: { id: dto.productId },
          branch: { id: dto.branchId },
          deletedAt: IsNull(),
        },
      });
    }

    let sourceBranch, targetBranch;
    if (dto.type === MovementType.TRANSFER_OUT || dto.type === MovementType.TRANSFER_IN) {
      if (!dto.sourceBranchId || !dto.targetBranchId) {
        throw new BadRequestException('Las transferencias requieren sourceBranchId y targetBranchId');
      }

      if (dto.sourceBranchId === dto.targetBranchId) {
        throw new BadRequestException('Las sucursales de origen y destino no pueden ser las mismas');
      }

      try {
        sourceBranch = await this.branchService.findOne(dto.sourceBranchId);
      } catch (error) {
        throw new BadRequestException(`La sucursal origen con ID ${dto.sourceBranchId} no existe`);
      }

      try {
        targetBranch = await this.branchService.findOne(dto.targetBranchId);
      } catch (error) {
        throw new BadRequestException(`La sucursal destino con ID ${dto.targetBranchId} no existe`);
      }
    }

    const previousStock = inventory ? Number(inventory.stock) : 0;

    let newStock = previousStock;
    if (dto.type === MovementType.IN || dto.type === MovementType.TRANSFER_IN) {
      newStock += dto.quantity;
    } else if (dto.type === MovementType.OUT || dto.type === MovementType.TRANSFER_OUT) {
      newStock -= dto.quantity;
    } else if (dto.type === MovementType.ADJUSTMENT) {
      newStock = dto.quantity;
    }

    // Validar que el stock no sea negativo
    if (newStock < 0) {
      throw new BadRequestException(`Stock insuficiente. Stock actual: ${previousStock}, Cantidad solicitada: ${dto.quantity}`);
    }

    const unitCost = dto.unitCost ?? Number(product.cost);
    const totalCost = dto.totalCost ?? (dto.type === MovementType.ADJUSTMENT 
      ? Math.abs(dto.quantity - previousStock) * unitCost
      : dto.quantity * unitCost);

    const movement = repo.create({
      product: { id: dto.productId },
      branch: { id: dto.branchId },
      inventory: dto.inventoryId ? { id: dto.inventoryId } : undefined,
      quantity: dto.quantity,
      type: dto.type,
      status: dto.status || MovementStatus.PENDING,
      referenceId: dto.referenceId,
      referenceNumber: dto.referenceNumber,
      concept: dto.concept,
      sourceBranch: dto.sourceBranchId ? { id: dto.sourceBranchId } : undefined,
      targetBranch: dto.targetBranchId ? { id: dto.targetBranchId } : undefined,
      notes: dto.notes,
      movementDate: dto.movementDate ? new Date(dto.movementDate) : new Date(),
      unitCost,
      totalCost,
      previousStock,
      newStock,
      createdBy: userId ? ({ id: userId } as any) : null,
    });

    if (movement.status === MovementStatus.COMPLETED) {
      movement.completedAt = new Date();
      movement.completedBy = userId ? ({ id: userId } as any) : null;
    }

    const savedMovement = await repo.save(movement);

    if (savedMovement.status === MovementStatus.COMPLETED) {
      await this.updateInventory(savedMovement, manager);
    }

    if (manager) {
      return this.findOneInTransaction(savedMovement.id, manager);
    }

    return this.transformToDto(movement);
  }

  private transformToDto(movement: InventoryMovement): InventoryMovementResponseDto;
  private transformToDto(movements: InventoryMovement[]): InventoryMovementResponseDto[];
  private transformToDto(data: any): any {
    return plainToInstance(InventoryMovementResponseDto, data, {
      excludeExtraneousValues: true,
    });
  }

  private async findOneInTransaction(id: string, manager: any): Promise<InventoryMovementResponseDto> {
    const movement = await manager.findOne(InventoryMovement, {
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado en la transacción`);
    }

    return this.transformToDto(movement);
  }

  async findAll(query?: QueryInventoryMovementDto): Promise<PaginatedInventoryMovementResponseDto> {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.movementRepository.createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('movement.branch', 'branch')
      .leftJoinAndSelect('movement.createdBy', 'createdBy')
      .leftJoinAndSelect('movement.completedBy', 'completedBy')
      .leftJoinAndSelect('movement.cancelledBy', 'cancelledBy')
      .where('movement.deletedAt IS NULL');

    if (query?.branchId) {
      qb.andWhere('movement.branch_id = :branchId', { branchId: query.branchId });
    }

    if (query?.productId) {
      qb.andWhere('movement.product_id = :productId', { productId: query.productId });
    }

    if (query?.type) {
      qb.andWhere('movement.type = :type', { type: query.type });
    }

    if (query?.status) {
      qb.andWhere('movement.status = :status', { status: query.status });
    }

    if (query?.concept) {
      qb.andWhere('movement.concept = :concept', { concept: query.concept });
    }

    if (query?.startDate) {
      qb.andWhere('movement.movementDate >= :startDate', { startDate: new Date(query.startDate) });
    }

    if (query?.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('movement.movementDate <= :endDate', { endDate: end });
    }

    if (query?.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(product.name) LIKE :search OR LOWER(product.sku) LIKE :search OR LOWER(product.barcode) LIKE :search OR LOWER(movement.referenceNumber) LIKE :search OR LOWER(movement.notes) LIKE :search)',
        { search },
      );
    }

    qb.orderBy('movement.movementDate', 'DESC')
      .addOrderBy('movement.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [movements, total] = await qb.getManyAndCount();

    const items = this.transformToDto(movements);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string): Promise<InventoryMovementResponseDto> {
    const movement = await this.movementRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    return this.transformToDto(movement);
  }

  async findByProduct(productId: string): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: {
        product: { id: productId },
        deletedAt: IsNull(),
      },
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
      order: { movementDate: 'DESC' },
    });
    return this.transformToDto(movements);
  }

  async findByBranch(branchId: string): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: {
        branch: { id: branchId },
        deletedAt: IsNull(),
      },
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
      order: { movementDate: 'DESC' },
    });
    return this.transformToDto(movements);
  }

  async findByType(type: MovementType): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: {
        type,
        deletedAt: IsNull(),
      },
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
      order: { movementDate: 'DESC' },
    });
    return this.transformToDto(movements);
  }

  async findByReferenceId(referenceId: string): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: { referenceId, deletedAt: IsNull() },
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
      order: { createdAt: 'ASC' },
    });
    return this.transformToDto(movements);
  }


  async update(id: string, dto: UpdateInventoryMovementDto): Promise<InventoryMovementResponseDto> {
    const movement = await this.movementRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'branch', 'inventory'],
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    const previousStatus = movement.status;

    Object.assign(movement, {
      status: dto.status ?? movement.status,
      notes: dto.notes ?? movement.notes,
      movementDate: dto.movementDate ? new Date(dto.movementDate) : movement.movementDate,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : movement.completedAt,
      unitCost: dto.unitCost ?? movement.unitCost,
      totalCost: dto.totalCost ?? movement.totalCost,
    });

    if (previousStatus !== MovementStatus.COMPLETED && movement.status === MovementStatus.COMPLETED) {
      movement.completedAt = new Date();
    }

    if (previousStatus !== MovementStatus.CANCELLED && movement.status === MovementStatus.CANCELLED) {
      movement.cancelledAt = new Date();
    }

    const updatedMovement = await this.movementRepository.save(movement);

    if (previousStatus !== MovementStatus.COMPLETED && updatedMovement.status === MovementStatus.COMPLETED) {
      await this.updateInventory(updatedMovement);
    }

    return this.findOne(id);
  }

  async completeMovement(id: string, userId?: string): Promise<InventoryMovementResponseDto> {
    const movement = await this.movementRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'branch', 'inventory'],
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    if (movement.status === MovementStatus.COMPLETED) {
      throw new ConflictException('El movimiento ya está completado');
    }

    movement.status = MovementStatus.COMPLETED;
    movement.completedAt = new Date();
    movement.completedBy = userId ? ({ id: userId } as any) : null;

    const updatedMovement = await this.movementRepository.save(movement);
    await this.updateInventory(updatedMovement);

    return this.findOne(id);
  }

  async cancelMovement(id: string, userId?: string, reason?: string): Promise<InventoryMovementResponseDto> {
    const movement = await this.movementRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    if (movement.status === MovementStatus.CANCELLED) {
      throw new ConflictException('El movimiento ya está cancelado');
    }

    movement.status = MovementStatus.CANCELLED;
    movement.cancelledAt = new Date();
    movement.cancelledBy = userId ? ({ id: userId } as any) : null;
    movement.cancellationReason = reason;

    const updatedMovement = await this.movementRepository.save(movement);

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const movement = await this.movementRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    await this.movementRepository.softRemove(movement);
    return { message: 'Movimiento eliminado exitosamente' };
  }

  async restore(id: string): Promise<InventoryMovementResponseDto> {
    const movement = await this.movementRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['product', 'product.unit', 'branch', 'createdBy', 'completedBy', 'cancelledBy'],
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    if (!movement.deletedAt) {
      throw new ConflictException(`El movimiento con ID ${id} no está eliminado`);
    }

    movement.deletedAt = null;
    await this.movementRepository.save(movement);
    return this.findOne(id);
  }

  async getMovementStats(branchId?: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    byType: Record<MovementType, number>;
  }> {
    const query = this.movementRepository.createQueryBuilder('movement').where('movement.deletedAt IS NULL');

    if (branchId) {
      query.andWhere('movement.branch_id = :branchId', { branchId });
    }

    const movements = await query.getMany();

    const byType = {
      [MovementType.IN]: 0,
      [MovementType.OUT]: 0,
      [MovementType.TRANSFER_IN]: 0,
      [MovementType.TRANSFER_OUT]: 0,
      [MovementType.ADJUSTMENT]: 0,
    };

    movements.forEach((movement) => {
      byType[movement.type]++;
    });

    return {
      total: movements.length,
      completed: movements.filter((m) => m.status === MovementStatus.COMPLETED).length,
      pending: movements.filter((m) => m.status === MovementStatus.PENDING).length,
      cancelled: movements.filter((m) => m.status === MovementStatus.CANCELLED).length,
      byType,
    };
  }

  private async updateInventory(movement: InventoryMovement, manager?: any): Promise<void> {
    if (manager) {
      await this.performInventoryUpdate(movement, manager);
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.performInventoryUpdate(movement, queryRunner.manager);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async performInventoryUpdate(movement: InventoryMovement, manager: any): Promise<void> {
    try {
      let inventory = await manager.findOne(Inventory, {
        where: {
          product: { id: movement.product.id },
          branch: { id: movement.branch.id },
        },
      });

      if (!inventory) {
        inventory = manager.create(Inventory, {
          product: { id: movement.product.id },
          branch: { id: movement.branch.id },
          stock: 0,
          minStock: 0,
          maxStock: null,
        });
      }

      const previousStock = Number(inventory.stock);

      switch (movement.type) {
        case MovementType.IN:
        case MovementType.TRANSFER_IN:
        case MovementType.ADJUSTMENT:
          inventory.stock = previousStock + Number(movement.quantity);
          break;
        case MovementType.OUT:
        case MovementType.TRANSFER_OUT:
          if (previousStock < movement.quantity) {
            throw new BadRequestException('Stock insuficiente para realizar el movimiento');
          }
          inventory.stock = previousStock - Number(movement.quantity);
          break;
      }

      inventory.lastMovementDate = new Date();
      await manager.save(inventory);

      await manager.update(InventoryMovement, movement.id, {
        previousStock,
        newStock: inventory.stock,
        completedAt: new Date(),
      });
    } catch (error) {
      throw error;
    }
  }

  async createTransfer(
    productId: string,
    fromBranchId: string,
    toBranchId: string,
    quantity: number,
    notes?: string,
  ): Promise<{
    outMovement: InventoryMovementResponseDto;
    inMovement: InventoryMovementResponseDto;
  }> {
    if (fromBranchId === toBranchId) {
      throw new BadRequestException('Las sucursales de origen y destino no pueden ser las mismas');
    }

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    const outMovement = await this.create(
      {
        productId,
        branchId: fromBranchId,
        quantity,
        type: MovementType.TRANSFER_OUT,
        sourceBranchId: fromBranchId,
        targetBranchId: toBranchId,
        notes,
        status: MovementStatus.PENDING,
        concept: MovementConcept.TRANSFER,
      },
      undefined,
      true,
    );

    const inMovement = await this.create(
      {
        productId,
        branchId: toBranchId,
        quantity,
        type: MovementType.TRANSFER_IN,
        sourceBranchId: fromBranchId,
        targetBranchId: toBranchId,
        referenceId: outMovement.id,
        notes,
        status: MovementStatus.PENDING,
        concept: MovementConcept.TRANSFER,
      },
      undefined,
      true,
    );

    await this.movementRepository.update(outMovement.id, {
      referenceId: inMovement.id,
    });
    outMovement.referenceId = inMovement.id;

    return {
      outMovement,
      inMovement,
    };
  }

  async completeTransfer(referenceId: string): Promise<{
    outMovement: InventoryMovementResponseDto;
    inMovement: InventoryMovementResponseDto;
  }> {
    const movements = await this.movementRepository.find({
      where: { referenceId, deletedAt: IsNull() },
      relations: ['product', 'branch'],
    });

    if (movements.length !== 2) {
      throw new NotFoundException(`Transferencia con referenceId ${referenceId} no encontrada`);
    }

    const outMovement = movements.find((m) => m.type === MovementType.TRANSFER_OUT);
    const inMovement = movements.find((m) => m.type === MovementType.TRANSFER_IN);

    if (!outMovement || !inMovement) {
      throw new NotFoundException('Transferencia incompleta');
    }

    const completedOut = await this.completeMovement(outMovement.id);
    const completedIn = await this.completeMovement(inMovement.id);

    return {
      outMovement: completedOut,
      inMovement: completedIn,
    };
  }
}
