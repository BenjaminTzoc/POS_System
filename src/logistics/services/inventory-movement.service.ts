import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Inventory, InventoryMovement } from '../entities';
import { DataSource, IsNull, Repository } from 'typeorm';
import { BranchService, InventoryService, ProductService } from '.';
import { CreateInventoryMovementDto, InventoryMovementResponseDto, UpdateInventoryMovementDto } from '../dto';
import { MovementStatus, MovementType } from '../entities/inventory-movement.entity';
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

  async create(dto: CreateInventoryMovementDto): Promise<InventoryMovementResponseDto> {
    // Validar que el producto existe
    let product;
    try {
      product = await this.productService.findOne(dto.productId);
    } catch (error) {
      throw new BadRequestException(`El producto con ID ${dto.productId} no existe`);
    }

    // Validar que la sucursal existe
    let branch;
    try {
      branch = await this.branchService.findOne(dto.branchId);
    } catch (error) {
      throw new BadRequestException(`La sucursal con ID ${dto.branchId} no existe`);
    }

    // Validar inventoryId si se proporciona
    let inventory: any = null;
    if (dto.inventoryId) {
      try {
        inventory = await this.inventoryService.findOne(dto.inventoryId);
        // Verificar que el inventory pertenece al producto y sucursal
        if (inventory.product.id !== dto.productId || inventory.branch.id !== dto.branchId) {
          throw new BadRequestException('El inventory no corresponde al producto y sucursal especificados');
        }
      } catch (error) {
        throw new BadRequestException(`El inventory con ID ${dto.inventoryId} no existe`);
      }
    }

    let sourceBranch, targetBranch;
    // Validar sucursales de origen y destino para transferencias
    if (dto.type === MovementType.TRANSFER_OUT || dto.type === MovementType.TRANSFER_IN) {
      if (!dto.sourceBranchId || !dto.targetBranchId) {
        throw new BadRequestException('Las transferencias requieren sourceBranchId y targetBranchId');
      }

      if (dto.sourceBranchId === dto.targetBranchId) {
        throw new BadRequestException('Las sucursales de origen y destino no pueden ser las mismas');
      }

      // Validar sucursal origen
      try {
        sourceBranch = await this.branchService.findOne(dto.sourceBranchId);
      } catch (error) {
        throw new BadRequestException(`La sucursal origen con ID ${dto.sourceBranchId} no existe`);
      }

      // Validar sucursal destino
      try {
        targetBranch = await this.branchService.findOne(dto.targetBranchId);
      } catch (error) {
        throw new BadRequestException(`La sucursal destino con ID ${dto.targetBranchId} no existe`);
      }
    }

    // Validar cantidad
    if (dto.quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }
    
    const movement = this.movementRepository.create({
      product: product,
      branch: branch,
      inventory: inventory ? inventory : null,
      quantity: dto.quantity,
      type: dto.type,
      status: dto.status || MovementStatus.PENDING,
      referenceId: dto.referenceId,
      sourceBranch: sourceBranch ? sourceBranch : null,
      targetBranch: targetBranch ? targetBranch : null,
      notes: dto.notes,
      movementDate: dto.movementDate ? new Date(dto.movementDate) : new Date(),
      unitCost: dto.unitCost || product.cost,
      totalCost: dto.totalCost || (dto.unitCost ? dto.unitCost * dto.quantity : product.cost * dto.quantity),
    })

    const savedMovement = await this.movementRepository.save(movement);
    
    // Si el movimiento está completado, actualizar el inventario
    if (savedMovement.status === MovementStatus.COMPLETED) {
      await this.updateInventory(savedMovement);
    }

    return this.findOne(savedMovement.id);
  }

  async findAll(): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: { deletedAt: IsNull() },
      relations: [
        'product', 
        'product.category', 
        'product.unit', 
        'branch', 
        'inventory',
        'sourceBranch',
        'targetBranch'
      ],
      order: { movementDate: 'DESC', createdAt: 'DESC' },
    });
    return plainToInstance(InventoryMovementResponseDto, movements);
  }

  async findOne(id: string): Promise<InventoryMovementResponseDto> {
    const movement = await this.movementRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'product', 
        'product.category', 
        'product.unit', 
        'branch', 
        'inventory',
        'sourceBranch',
        'targetBranch'
      ],
    });

    if (!movement) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    return plainToInstance(InventoryMovementResponseDto, movement);
  }

  async findByProduct(productId: string): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: {
        product: { id: productId },
        deletedAt: IsNull(),
      },
      relations: [
        'product', 
        'product.category', 
        'product.unit', 
        'branch', 
        'inventory',
        'sourceBranch',
        'targetBranch'
      ],
      order: { movementDate: 'DESC' },
    });
    return plainToInstance(InventoryMovementResponseDto, movements);
  }

  async findByBranch(branchId: string): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: {
        branch: { id: branchId },
        deletedAt: IsNull(),
      },
      relations: [
        'product', 
        'product.category', 
        'product.unit', 
        'branch', 
        'inventory',
        'sourceBranch',
        'targetBranch'
      ],
      order: { movementDate: 'DESC' },
    });
    return plainToInstance(InventoryMovementResponseDto, movements);
  }

  async findByType(type: MovementType): Promise<InventoryMovementResponseDto[]> {
    const movements = await this.movementRepository.find({
      where: {
        type,
        deletedAt: IsNull(),
      },
      relations: [
        'product', 
        'product.category', 
        'product.unit', 
        'branch', 
        'inventory',
        'sourceBranch',
        'targetBranch'
      ],
      order: { movementDate: 'DESC' },
    });
    return plainToInstance(InventoryMovementResponseDto, movements);
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

    const updatedMovement = await this.movementRepository.save(movement);

    // Si el estado cambió a COMPLETED, actualizar inventario
    if (previousStatus !== MovementStatus.COMPLETED && updatedMovement.status === MovementStatus.COMPLETED) {
      await this.updateInventory(updatedMovement);
    }

    return this.findOne(id);
  }

  async completeMovement(id: string): Promise<InventoryMovementResponseDto> {
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

    const updatedMovement = await this.movementRepository.save(movement);
    await this.updateInventory(updatedMovement);

    return this.findOne(id);
  }

  async cancelMovement(id: string): Promise<InventoryMovementResponseDto> {
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
      relations: [
        'product', 
        'product.category', 
        'product.unit', 
        'branch', 
        'inventory',
        'sourceBranch',
        'targetBranch'
      ],
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
    const query = this.movementRepository
      .createQueryBuilder('movement')
      .where('movement.deletedAt IS NULL');

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

    movements.forEach(movement => {
      byType[movement.type]++;
    });

    return {
      total: movements.length,
      completed: movements.filter(m => m.status === MovementStatus.COMPLETED).length,
      pending: movements.filter(m => m.status === MovementStatus.PENDING).length,
      cancelled: movements.filter(m => m.status === MovementStatus.CANCELLED).length,
      byType,
    };
  }

  private async updateInventory(movement: InventoryMovement): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Obtener o crear el inventory
      let inventory = await queryRunner.manager.findOne(Inventory, {
        where: {
          product: { id: movement.product.id },
          branch: { id: movement.branch.id },
        },
      });

      if (!inventory) {
        inventory = queryRunner.manager.create(Inventory, {
          product: { id: movement.product.id },
          branch: { id: movement.branch.id },
          stock: 0,
          minStock: 0,
          maxStock: null,
        });
      }

      // Actualizar stock según el tipo de movimiento
      switch (movement.type) {
        case MovementType.IN:
        case MovementType.TRANSFER_IN:
        case MovementType.ADJUSTMENT:
          inventory.stock = Number(inventory.stock) + Number(movement.quantity);
          break;
        case MovementType.OUT:
        case MovementType.TRANSFER_OUT:
          if (inventory.stock < movement.quantity) {
            throw new BadRequestException('Stock insuficiente para realizar el movimiento');
          }
          inventory.stock = Number(inventory.stock) - Number(movement.quantity);
          break;
      }

      inventory.lastMovementDate = new Date();
      await queryRunner.manager.save(inventory);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createTransfer(
    productId: string,
    fromBranchId: string,
    toBranchId: string,
    quantity: number,
    notes?: string,
  ): Promise<{ outMovement: InventoryMovementResponseDto; inMovement: InventoryMovementResponseDto }> {
    if (fromBranchId === toBranchId) {
      throw new BadRequestException('Las sucursales de origen y destino no pueden ser las mismas');
    }

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    // Crear movimiento de salida
    const outMovement = await this.create({
      productId,
      branchId: fromBranchId,
      quantity,
      type: MovementType.TRANSFER_OUT,
      sourceBranchId: fromBranchId,
      targetBranchId: toBranchId,
      notes,
      status: MovementStatus.PENDING,
    });

    // Crear movimiento de entrada
    const inMovement = await this.create({
      productId,
      branchId: toBranchId,
      quantity,
      type: MovementType.TRANSFER_IN,
      sourceBranchId: fromBranchId,
      targetBranchId: toBranchId,
      referenceId: outMovement.id,
      notes,
      status: MovementStatus.PENDING,
    });

    outMovement.referenceId = inMovement.id;

    return {
      outMovement: plainToInstance(InventoryMovementResponseDto, outMovement),
      inMovement: plainToInstance(InventoryMovementResponseDto, inMovement),
    };
  }

  async completeTransfer(referenceId: string): Promise<{ outMovement: InventoryMovementResponseDto; inMovement: InventoryMovementResponseDto }> {
    const movements = await this.movementRepository.find({
      where: { referenceId, deletedAt: IsNull() },
      relations: ['product', 'branch'],
    });

    if (movements.length !== 2) {
      throw new NotFoundException(`Transferencia con referenceId ${referenceId} no encontrada`);
    }

    const outMovement = movements.find(m => m.type === MovementType.TRANSFER_OUT);
    const inMovement = movements.find(m => m.type === MovementType.TRANSFER_IN);

    if (!outMovement || !inMovement) {
      throw new NotFoundException('Transferencia incompleta');
    }

    // Completar ambos movimientos
    const completedOut = await this.completeMovement(outMovement.id);
    const completedIn = await this.completeMovement(inMovement.id);

    return {
      outMovement: completedOut,
      inMovement: completedIn,
    };
  }
}
