import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  InventoryTransfer,
  InventoryTransferItem,
  TransferStatus,
  InventoryMovement,
  MovementType,
  MovementStatus,
  MovementConcept,
  Inventory,
  Product,
  Branch,
} from '../entities';
import {
  CreateInventoryTransferDto,
  InventoryTransferResponseDto,
  UpdateTransferStatusDto,
} from '../dto';
import { InventoryMovementService } from './inventory-movement.service';
import { plainToInstance } from 'class-transformer';

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

  async create(
    dto: CreateInventoryTransferDto,
    userId: string,
  ): Promise<InventoryTransferResponseDto> {
    if (dto.originBranchId === dto.destinationBranchId) {
      throw new BadRequestException(
        'La sucursal de origen y destino no pueden ser la misma',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validar sucursales
      const originBranch = await this.branchRepository.findOne({
        where: { id: dto.originBranchId },
      });
      const destinationBranch = await this.branchRepository.findOne({
        where: { id: dto.destinationBranchId },
      });

      if (!originBranch || !destinationBranch) {
        throw new NotFoundException('Una o ambas sucursales no existen');
      }

      // 2. Crear cabecera de traslado
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

      // 3. Procesar items
      const transferItems: InventoryTransferItem[] = [];
      for (const itemDto of dto.items) {
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId },
        });
        if (!product) {
          throw new NotFoundException(
            `Producto con ID ${itemDto.productId} no encontrado`,
          );
        }

        // Verificar stock en origen
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: {
            product: { id: product.id },
            branch: { id: originBranch.id },
            deletedAt: IsNull(),
          },
        });

        if (!inventory || Number(inventory.stock) < itemDto.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${product.name} en la sucursal de origen. Disponible: ${inventory ? inventory.stock : 0}`,
          );
        }

        const item = this.transferItemRepository.create({
          transfer: savedTransfer,
          product,
          quantity: itemDto.quantity,
        });

        const savedItem = await queryRunner.manager.save(item);
        transferItems.push(savedItem);

        // 4. Generar movimiento de SALIDA inmediatamente
        await this.movementService.create(
          {
            productId: product.id,
            branchId: originBranch.id,
            quantity: itemDto.quantity,
            type: MovementType.TRANSFER_OUT,
            sourceBranchId: originBranch.id,
            targetBranchId: destinationBranch.id,
            notes: `Traslado ${transferNumber} (Salida)`,
            status: MovementStatus.COMPLETED,
            concept: MovementConcept.TRANSFER,
            referenceId: savedTransfer.id,
            referenceNumber: transferNumber,
          },
          userId,
          true,
        );
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

  async findAll(filters?: any): Promise<InventoryTransferResponseDto[]> {
    const where: any = { deletedAt: IsNull() };

    if (filters?.originBranchId)
      where.originBranch = { id: filters.originBranchId };
    if (filters?.destinationBranchId)
      where.destinationBranch = { id: filters.destinationBranchId };
    if (filters?.status) where.status = filters.status;

    const transfers = await this.transferRepository.find({
      where,
      relations: [
        'originBranch',
        'destinationBranch',
        'items',
        'items.product',
        'createdBy',
      ],
      order: { createdAt: 'DESC' },
    });

    return transfers.map((t) => this.mapToDto(t));
  }

  async findOne(id: string): Promise<InventoryTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'originBranch',
        'destinationBranch',
        'items',
        'items.product',
        'createdBy',
      ],
    });

    if (!transfer) {
      throw new NotFoundException(`Traslado con ID ${id} no encontrado`);
    }

    return this.mapToDto(transfer);
  }

  async updateStatus(
    id: string,
    dto: UpdateTransferStatusDto,
    userId: string,
  ): Promise<InventoryTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'originBranch',
        'destinationBranch',
        'items',
        'items.product',
      ],
    });

    if (!transfer) {
      throw new NotFoundException(`Traslado con ID ${id} no encontrado`);
    }

    if (transfer.status === dto.status) {
      return this.mapToDto(transfer);
    }

    if (
      transfer.status === TransferStatus.RECEIVED ||
      transfer.status === TransferStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `No se puede cambiar el estado de un traslado ${transfer.status}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.status === TransferStatus.RECEIVED) {
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
        for (const item of transfer.items) {
          await this.movementService.create(
            {
              productId: item.product.id,
              branchId: transfer.originBranch.id,
              quantity: item.quantity,
              type: MovementType.IN,
              notes: `Cancelación de Traslado ${transfer.transferNumber}`,
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
    dto.items = transfer.items.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      quantity: Number(item.quantity),
    }));
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
