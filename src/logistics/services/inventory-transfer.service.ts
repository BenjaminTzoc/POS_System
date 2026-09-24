import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { InventoryTransfer, InventoryTransferItem, TransferStatus, MovementType, MovementStatus, MovementConcept, Inventory, Product, Branch } from '../entities';
import { CreateInventoryTransferDto, UpdateInventoryTransferDto, InventoryTransferResponseDto, InventoryTransferListResponseDto, UpdateTransferStatusDto } from '../dto';
import { InventoryMovementService } from './inventory-movement.service';

@Injectable()
export class InventoryTransferService {
  constructor(
    @InjectRepository(InventoryTransfer)
    private readonly transferRepository: Repository<InventoryTransfer>,
    @InjectRepository(InventoryTransferItem)
    private readonly transferItemRepository: Repository<InventoryTransferItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly movementService: InventoryMovementService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateInventoryTransferDto, userId: string): Promise<InventoryTransferResponseDto> {
    if (dto.originBranchId === dto.destinationBranchId) {
      throw new BadRequestException('La sucursal de origen y destino no pueden ser la misma');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const originBranch = await this.branchRepository.findOne({
        where: { id: dto.originBranchId },
      });
      const destinationBranch = await this.branchRepository.findOne({
        where: { id: dto.destinationBranchId },
      });

      if (!originBranch || !destinationBranch) {
        throw new NotFoundException('Una o ambas sucursales no existen');
      }

      const transferNumber = await this.generateTransferNumber();
      const transfer = this.transferRepository.create({
        originBranch,
        destinationBranch,
        notes: dto.notes,
        status: TransferStatus.PENDING,
        createdBy: { id: userId } as any,
        transferNumber,
      });

      const savedTransfer = await queryRunner.manager.save(transfer);

      const transferItems: InventoryTransferItem[] = [];
      for (const itemDto of dto.items) {
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId },
        });
        if (!product) {
          throw new NotFoundException(`Producto con ID ${itemDto.productId} no encontrado`);
        }

        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: {
            product: { id: product.id },
            branch: { id: originBranch.id },
            deletedAt: IsNull(),
          },
        });

        if (!inventory || Number(inventory.stock) < itemDto.quantity) {
          throw new BadRequestException(`Stock insuficiente para el producto ${product.name} en la sucursal de origen. Disponible: ${inventory ? inventory.stock : 0}`);
        }

        const item = this.transferItemRepository.create({
          transfer: savedTransfer,
          product,
          quantity: itemDto.quantity,
        });

        const savedItem = await queryRunner.manager.save(item);
        transferItems.push(savedItem);
      }

      await queryRunner.commitTransaction();
      return this.findOne(savedTransfer.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, dto: UpdateInventoryTransferDto, userId: string): Promise<InventoryTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['originBranch', 'destinationBranch', 'items', 'items.product'],
    });

    if (!transfer) {
      throw new NotFoundException(`Traslado con ID ${id} no encontrado`);
    }

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException(`Solo se pueden editar traslados en estado PENDING. El estado actual es ${transfer.status}`);
    }

    const originBranchId = dto.originBranchId || transfer.originBranch.id;
    const destinationBranchId = dto.destinationBranchId || transfer.destinationBranch.id;

    if (originBranchId === destinationBranchId) {
      throw new BadRequestException('La sucursal de origen y destino no pueden ser la misma');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.originBranchId && dto.originBranchId !== transfer.originBranch.id) {
        const originBranch = await queryRunner.manager.findOne(Branch, {
          where: { id: dto.originBranchId },
        });
        if (!originBranch) {
          throw new NotFoundException(`Sucursal de origen con ID ${dto.originBranchId} no encontrada`);
        }
        transfer.originBranch = originBranch;
      }

      if (dto.destinationBranchId && dto.destinationBranchId !== transfer.destinationBranch.id) {
        const destinationBranch = await queryRunner.manager.findOne(Branch, {
          where: { id: dto.destinationBranchId },
        });
        if (!destinationBranch) {
          throw new NotFoundException(`Sucursal de destino con ID ${dto.destinationBranchId} no encontrada`);
        }
        transfer.destinationBranch = destinationBranch;
      }

      if (dto.notes !== undefined) {
        transfer.notes = dto.notes;
      }

      await queryRunner.manager.save(transfer);

      if (dto.items && dto.items.length > 0) {
        await queryRunner.manager.delete(InventoryTransferItem, {
          transfer: { id: transfer.id },
        });

        const newItems: InventoryTransferItem[] = [];
        for (const itemDto of dto.items) {
          const product = await queryRunner.manager.findOne(Product, {
            where: { id: itemDto.productId },
          });
          if (!product) {
            throw new NotFoundException(`Producto con ID ${itemDto.productId} no encontrado`);
          }

          const inventory = await queryRunner.manager.findOne(Inventory, {
            where: {
              product: { id: product.id },
              branch: { id: transfer.originBranch.id },
              deletedAt: IsNull(),
            },
          });

          if (!inventory || Number(inventory.stock) < itemDto.quantity) {
            throw new BadRequestException(
              `Stock insuficiente para el producto ${product.name} en la sucursal de origen. Disponible: ${inventory ? inventory.stock : 0}`,
            );
          }

          const item = this.transferItemRepository.create({
            transfer: { id: transfer.id } as any,
            product,
            quantity: itemDto.quantity,
          });

          const savedItem = await queryRunner.manager.save(item);
          newItems.push(savedItem);
        }
      }

      await queryRunner.commitTransaction();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filters?: any): Promise<InventoryTransferListResponseDto[]> {
    const where: any = { deletedAt: IsNull() };

    if (filters?.originBranchId) where.originBranch = { id: filters.originBranchId };
    if (filters?.destinationBranchId) where.destinationBranch = { id: filters.destinationBranchId };
    if (filters?.status) where.status = filters.status;

    if (filters?.startDate && filters?.endDate) {
      where.createdAt = Between(new Date(filters.startDate), new Date(filters.endDate));
    } else if (filters?.startDate) {
      where.createdAt = MoreThanOrEqual(new Date(filters.startDate));
    } else if (filters?.endDate) {
      where.createdAt = LessThanOrEqual(new Date(filters.endDate));
    }

    const transfers = await this.transferRepository.find({
      where,
      relations: ['originBranch', 'destinationBranch', 'createdBy'],
      order: { createdAt: 'DESC' },
    });

    return transfers.map((t) => this.mapToListDto(t));
  }

  async findOne(id: string): Promise<InventoryTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['originBranch', 'destinationBranch', 'items', 'items.product', 'items.product.unit', 'createdBy'],
    });

    if (!transfer) {
      throw new NotFoundException(`Traslado con ID ${id} no encontrado`);
    }

    return this.mapToDto(transfer);
  }

  async updateStatus(id: string, dto: UpdateTransferStatusDto, userId: string): Promise<InventoryTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['originBranch', 'destinationBranch', 'items', 'items.product'],
    });

    if (!transfer) {
      throw new NotFoundException(`Traslado con ID ${id} no encontrado`);
    }

    if (transfer.status === dto.status) {
      return this.mapToDto(transfer);
    }

    if (transfer.status === TransferStatus.RECEIVED || transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException(`No se puede cambiar el estado de un traslado ${transfer.status}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.status === TransferStatus.SHIPPED && transfer.status === TransferStatus.PENDING) {
        // Salida de la sucursal de origen al ponerse en camino / subirse al transporte
        for (const item of transfer.items) {
          await this.movementService.create(
            {
              productId: item.product.id,
              branchId: transfer.originBranch.id,
              quantity: item.quantity,
              type: MovementType.TRANSFER_OUT,
              sourceBranchId: transfer.originBranch.id,
              targetBranchId: transfer.destinationBranch.id,
              notes: `Traslado ${transfer.transferNumber} (Salida)`,
              status: MovementStatus.COMPLETED,
              concept: MovementConcept.TRANSFER,
              referenceId: transfer.id,
              referenceNumber: transfer.transferNumber,
            },
            userId,
            true,
          );
        }
      } else if (dto.status === TransferStatus.RECEIVED) {
        // Si no había sido marcado como SHIPPED previamente, ejecutar primero la salida de origen
        if (transfer.status === TransferStatus.PENDING) {
          for (const item of transfer.items) {
            await this.movementService.create(
              {
                productId: item.product.id,
                branchId: transfer.originBranch.id,
                quantity: item.quantity,
                type: MovementType.TRANSFER_OUT,
                sourceBranchId: transfer.originBranch.id,
                targetBranchId: transfer.destinationBranch.id,
                notes: `Traslado ${transfer.transferNumber} (Salida)`,
                status: MovementStatus.COMPLETED,
                concept: MovementConcept.TRANSFER,
                referenceId: transfer.id,
                referenceNumber: transfer.transferNumber,
              },
              userId,
              true,
            );
          }
        }

        // Entrada a la sucursal de destino
        for (const item of transfer.items) {
          await this.movementService.create(
            {
              productId: item.product.id,
              branchId: transfer.destinationBranch.id,
              quantity: item.quantity,
              type: MovementType.TRANSFER_IN,
              sourceBranchId: transfer.originBranch.id,
              targetBranchId: transfer.destinationBranch.id,
              notes: `Traslado ${transfer.transferNumber} (Entrada)`,
              status: MovementStatus.COMPLETED,
              concept: MovementConcept.TRANSFER,
              referenceId: transfer.id,
              referenceNumber: transfer.transferNumber,
            },
            userId,
            true,
          );
        }
      } else if (dto.status === TransferStatus.CANCELLED) {
        // Si ya había salido el stock (estaba SHIPPED), devolverlo a la sucursal de origen
        if (transfer.status === TransferStatus.SHIPPED) {
          for (const item of transfer.items) {
            await this.movementService.create(
              {
                productId: item.product.id,
                branchId: transfer.originBranch.id,
                quantity: item.quantity,
                type: MovementType.IN,
                notes: `Cancelación de Traslado ${transfer.transferNumber} (Retorno a origen)`,
                status: MovementStatus.COMPLETED,
                concept: MovementConcept.RETURN,
                referenceId: transfer.id,
                referenceNumber: transfer.transferNumber,
              },
              userId,
              true,
            );
          }
        }
      }

      transfer.status = dto.status;
      await queryRunner.manager.save(transfer);

      await queryRunner.commitTransaction();
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private mapToListDto(transfer: InventoryTransfer): InventoryTransferListResponseDto {
    const dto = new InventoryTransferListResponseDto();
    dto.id = transfer.id;
    dto.transferNumber = transfer.transferNumber;
    dto.status = transfer.status;
    dto.originBranchName = transfer.originBranch.name;
    dto.destinationBranchName = transfer.destinationBranch.name;
    dto.createdBy = transfer.createdBy.name;
    dto.createdAt = transfer.createdAt;
    dto.updatedAt = transfer.updatedAt;
    return dto;
  }

  private mapToDto(transfer: InventoryTransfer): InventoryTransferResponseDto {
    const dto = new InventoryTransferResponseDto();
    dto.id = transfer.id;
    dto.originBranchId = transfer.originBranch.id;
    dto.originBranchName = transfer.originBranch.name;
    dto.destinationBranchId = transfer.destinationBranch.id;
    dto.destinationBranchName = transfer.destinationBranch.name;
    dto.transferNumber = transfer.transferNumber;
    dto.status = transfer.status;
    dto.notes = transfer.notes;
    dto.createdBy = transfer.createdBy.name;
    dto.createdAt = transfer.createdAt;
    dto.updatedAt = transfer.updatedAt;

    let totalValue = 0;
    dto.items = transfer.items.map((item) => {
      const quantity = Number(item.quantity);
      const price = Number(item.product.price);
      const subtotal = quantity * price;
      totalValue += subtotal;

      return {
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        quantity: quantity,
        receivedQuantity: item.receivedQuantity !== null && item.receivedQuantity !== undefined ? Number(item.receivedQuantity) : null,
        unitAbbreviation: item.product.unit?.abbreviation,
        price,
        subtotal: subtotal,
        imageUrl: item.product.imageUrl,
      };
    });

    dto.totalValue = totalValue;
    return dto;
  }

  private async generateTransferNumber(): Promise<string> {
    const lastTransfer = await this.transferRepository.findOne({
      where: {},
      order: { transferNumber: 'DESC' },
      withDeleted: true,
    });

    let nextNumber = 1;
    if (lastTransfer && lastTransfer.transferNumber) {
      const lastNumberStr = lastTransfer.transferNumber.split('-')[1];
      if (lastNumberStr) {
        const lastNumber = parseInt(lastNumberStr);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }
    }

    return `TR-${nextNumber.toString().padStart(6, '0')}`;
  }
}
