import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Trip, TripStatus } from '../entities/trip.entity';
import { TripItem, TripItemStatus, TripItemType } from '../entities/trip-item.entity';
import { Branch } from '../entities/branch.entity';
import { Truck, TruckStatus } from '../entities/truck.entity';
import { User } from 'src/auth/entities/user.entity';
import { InventoryTransfer, TransferStatus } from '../entities/inventory-transfer.entity';
import { Sale, SaleStatus } from 'src/sales/entities/sale.entity';
import { TripReturn, TripReturnStatus } from '../entities/trip-return.entity';
import { TripReturnItem } from '../entities/trip-return-item.entity';
import { TripIncident, TripIncidentStatus } from '../entities/trip-incident.entity';
import { AddTripItemsDto, CreateTripDto, DeliverSaleItemDto, DeliveryOutcome, ReceiveTripReturnDto, ResolveTripIncidentDto, TripResponseDto, UpdateTripDto } from '../dto/trip.dto';
import { ReceiveTransferDto } from '../dto/inventory-transfer.dto';
import { plainToInstance } from 'class-transformer';
import { InventoryMovementService } from './inventory-movement.service';
import { MovementConcept, MovementStatus, MovementType } from '../entities/inventory-movement.entity';
import { Inventory } from '../entities/inventory.entity';

@Injectable()
export class TripService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(TripItem)
    private readonly tripItemRepository: Repository<TripItem>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Truck)
    private readonly truckRepository: Repository<Truck>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(InventoryTransfer)
    private readonly transferRepository: Repository<InventoryTransfer>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(TripReturn)
    private readonly tripReturnRepository: Repository<TripReturn>,
    @InjectRepository(TripReturnItem)
    private readonly tripReturnItemRepository: Repository<TripReturnItem>,
    @InjectRepository(TripIncident)
    private readonly tripIncidentRepository: Repository<TripIncident>,
    private readonly movementService: InventoryMovementService,
    private readonly dataSource: DataSource,
  ) {}

  private async generateTripNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.tripRepository.count();
    const sequence = String(count + 1).padStart(4, '0');
    return `TRIP-${dateStr}-${sequence}`;
  }

  async create(dto: CreateTripDto, userId?: string): Promise<TripResponseDto> {
    const originBranch = await this.branchRepository.findOne({
      where: { id: dto.originBranchId, deletedAt: IsNull() },
    });
    if (!originBranch) {
      throw new NotFoundException(`Sucursal/Planta de origen con ID ${dto.originBranchId} no existe`);
    }

    const truck = await this.truckRepository.findOne({
      where: { id: dto.truckId, deletedAt: IsNull() },
    });
    if (!truck) {
      throw new NotFoundException(`Camión con ID ${dto.truckId} no existe`);
    }
    if (truck.status === TruckStatus.INACTIVE) {
      throw new BadRequestException(`El camión ${truck.name} (${truck.licensePlate}) está inactivo`);
    }

    const driver = await this.userRepository.findOne({
      where: { id: dto.driverId, deletedAt: IsNull() },
    });
    if (!driver) {
      throw new NotFoundException(`El piloto con ID ${dto.driverId} no existe`);
    }

    const tripNumber = await this.generateTripNumber();

    const trip = this.tripRepository.create({
      tripNumber,
      date: new Date(dto.date),
      originBranch,
      truck,
      driver,
      status: TripStatus.DRAFT,
      notes: dto.notes,
      createdBy: userId ? ({ id: userId } as any) : null,
      items: [],
    });

    const savedTrip = await this.tripRepository.save(trip);

    if (dto.items && dto.items.length > 0) {
      await this.attachItemsToTrip(savedTrip, dto.items);
    }

    return this.findOne(savedTrip.id);
  }

  private async attachItemsToTrip(trip: Trip, itemsDto: any[]): Promise<void> {
    const itemsToSave: TripItem[] = [];

    for (let i = 0; i < itemsDto.length; i++) {
      const itemDto = itemsDto[i];
      const sequence = itemDto.sequence || i + 1;

      if (itemDto.type === TripItemType.TRANSFER) {
        if (!itemDto.transferId) {
          throw new BadRequestException('Debe proporcionar el transferId para operaciones de tipo transfer');
        }

        const transfer = await this.transferRepository.findOne({
          where: { id: itemDto.transferId, deletedAt: IsNull() },
        });
        if (!transfer) {
          throw new NotFoundException(`Traslado con ID ${itemDto.transferId} no encontrado`);
        }
        if (transfer.status !== TransferStatus.PENDING) {
          throw new BadRequestException(`El traslado ${transfer.transferNumber} no está en estado PENDIENTE (Estado actual: ${transfer.status})`);
        }

        // Verificar si ya está asignado a otro viaje activo
        const existingActiveItem = await this.tripItemRepository
          .createQueryBuilder('item')
          .innerJoin('item.trip', 'trip')
          .where('item.transfer_id = :transferId', { transferId: transfer.id })
          .andWhere('trip.status IN (:...activeStatuses)', { activeStatuses: [TripStatus.DRAFT, TripStatus.ON_ROUTE] })
          .getOne();

        if (existingActiveItem) {
          throw new ConflictException(`El traslado ${transfer.transferNumber} ya está asignado a otro viaje activo`);
        }

        const tripItem = this.tripItemRepository.create({
          trip,
          type: TripItemType.TRANSFER,
          transfer,
          status: TripItemStatus.PENDING,
          sequence,
          notes: itemDto.notes,
        });
        itemsToSave.push(tripItem);
      } else if (itemDto.type === TripItemType.SALE_ORDER) {
        if (!itemDto.saleId) {
          throw new BadRequestException('Debe proporcionar el saleId para operaciones de tipo sale_order');
        }

        const sale = await this.saleRepository.findOne({
          where: { id: itemDto.saleId, deletedAt: IsNull() },
        });
        if (!sale) {
          throw new NotFoundException(`Orden de venta con ID ${itemDto.saleId} no encontrada`);
        }
        if (sale.status === SaleStatus.DELIVERED || sale.status === SaleStatus.CANCELLED) {
          throw new BadRequestException(`La orden de venta ${sale.invoiceNumber} no es válida para despacho (Estado: ${sale.status})`);
        }

        const existingActiveItem = await this.tripItemRepository
          .createQueryBuilder('item')
          .innerJoin('item.trip', 'trip')
          .where('item.sale_id = :saleId', { saleId: sale.id })
          .andWhere('trip.status IN (:...activeStatuses)', { activeStatuses: [TripStatus.DRAFT, TripStatus.ON_ROUTE] })
          .getOne();

        if (existingActiveItem) {
          throw new ConflictException(`La orden de venta ${sale.invoiceNumber} ya está asignada a otro viaje activo`);
        }

        const tripItem = this.tripItemRepository.create({
          trip,
          type: TripItemType.SALE_ORDER,
          sale,
          status: TripItemStatus.PENDING,
          sequence,
          notes: itemDto.notes,
        });
        itemsToSave.push(tripItem);
      }
    }

    if (itemsToSave.length > 0) {
      await this.tripItemRepository.save(itemsToSave);
    }
  }

  async addItems(tripId: string, dto: AddTripItemsDto): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
    });
    if (!trip) {
      throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    }
    if (trip.status !== TripStatus.DRAFT) {
      throw new BadRequestException(`Solo se pueden agregar operaciones a un viaje en estado BORRADOR (Estado actual: ${trip.status})`);
    }

    await this.attachItemsToTrip(trip, dto.items);
    return this.findOne(tripId);
  }

  async removeItem(tripId: string, itemId: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
    });
    if (!trip) {
      throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    }
    if (trip.status !== TripStatus.DRAFT) {
      throw new BadRequestException(`Solo se pueden remover operaciones de un viaje en estado BORRADOR`);
    }

    const item = await this.tripItemRepository.findOne({
      where: { id: itemId, trip: { id: tripId } },
    });
    if (!item) {
      throw new NotFoundException(`Operación con ID ${itemId} no encontrada en este viaje`);
    }

    await this.tripItemRepository.remove(item);
    return this.findOne(tripId);
  }

  async confirmDeparture(tripId: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['items', 'items.transfer', 'items.sale'],
    });
    if (!trip) {
      throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    }
    if (trip.status !== TripStatus.DRAFT) {
      throw new BadRequestException(`El viaje ya no está en estado BORRADOR (Estado actual: ${trip.status})`);
    }
    if (!trip.items || trip.items.length === 0) {
      throw new BadRequestException('El viaje debe tener al menos una operación asignada antes de confirmar salida');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      trip.status = TripStatus.ON_ROUTE;
      trip.departureAt = new Date();
      await queryRunner.manager.save(trip);

      // Actualizar estados de los traslados y órdenes asignadas
      for (const item of trip.items) {
        if (item.type === TripItemType.TRANSFER && item.transfer) {
          const fullTransfer = await queryRunner.manager.findOne(InventoryTransfer, {
            where: { id: item.transfer.id },
            relations: ['items', 'items.product', 'originBranch', 'destinationBranch'],
          });

          if (fullTransfer && fullTransfer.status === TransferStatus.PENDING) {
            fullTransfer.status = TransferStatus.SHIPPED;
            await queryRunner.manager.save(fullTransfer);

            for (const tItem of fullTransfer.items) {
              await this.movementService.create(
                {
                  productId: tItem.product.id,
                  branchId: fullTransfer.originBranch.id,
                  quantity: tItem.quantity,
                  type: MovementType.TRANSFER_OUT,
                  sourceBranchId: fullTransfer.originBranch.id,
                  targetBranchId: fullTransfer.destinationBranch.id,
                  notes: `Viaje ${trip.tripNumber} - Traslado ${fullTransfer.transferNumber} (Salida)`,
                  status: MovementStatus.COMPLETED,
                  concept: MovementConcept.TRANSFER,
                  referenceId: fullTransfer.id,
                  referenceNumber: fullTransfer.transferNumber,
                },
                trip.createdBy?.id,
                true,
                queryRunner.manager,
              );
            }
          }
        } else if (item.type === TripItemType.SALE_ORDER && item.sale) {
          item.sale.status = SaleStatus.OUT_FOR_DELIVERY;
          await queryRunner.manager.save(item.sale);
        }
      }

      await queryRunner.commitTransaction();
      return this.findOne(tripId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deliverSaleItem(tripId: string, itemId: string, dto: DeliverSaleItemDto, userId?: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'items', 'items.sale', 'items.sale.details', 'items.sale.details.product'],
    });

    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    if (trip.status !== TripStatus.ON_ROUTE) {
      throw new BadRequestException(`Solo se pueden marcar entregas en viajes que estén EN RUTA (Estado actual: ${trip.status})`);
    }

    const item = trip.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Operación con ID ${itemId} no encontrada en este viaje`);
    if (item.type !== TripItemType.SALE_ORDER || !item.sale) {
      throw new BadRequestException('Esta operación no es una orden de venta');
    }

    if (item.status === TripItemStatus.DELIVERED || item.status === TripItemStatus.PARTIALLY_DELIVERED || item.status === TripItemStatus.REJECTED) {
      throw new BadRequestException(`Esta parada ya fue procesada (Estado actual: ${item.status})`);
    }

    const sale = await this.saleRepository.findOne({
      where: { id: item.sale.id },
      relations: ['details', 'details.product', 'branch', 'customer'],
    });

    if (!sale) throw new NotFoundException('Orden de venta no encontrada');

    // 1. Validar Código OTP
    if (!sale.deliveryOtp || sale.deliveryOtp.trim() !== dto.otp.trim()) {
      throw new BadRequestException('Código OTP inválido o no coincide con el provisto al cliente');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const originBranchId = trip.originBranch.id;

      if (dto.outcome === DeliveryOutcome.FULL) {
        // 1. ENTREGA COMPLETA: Descontar stock físico y liberar stock reservado
        for (const detail of sale.details) {
          await this.movementService.create(
            {
              productId: detail.product.id,
              branchId: originBranchId,
              quantity: detail.quantity,
              type: MovementType.OUT,
              notes: `Entrega de Venta ${sale.invoiceNumber} (Viaje ${trip.tripNumber})`,
              unitCost: detail.product.cost,
              totalCost: detail.quantity * detail.product.cost,
              status: MovementStatus.COMPLETED,
              referenceId: sale.id,
              referenceNumber: sale.invoiceNumber,
              concept: MovementConcept.SALE,
            },
            userId,
            true,
            qr.manager,
          );

          if (detail.product?.manageStock) {
            await qr.manager.decrement(
              Inventory,
              {
                product: { id: detail.product.id },
                branch: { id: originBranchId },
                deletedAt: IsNull(),
              },
              'reservedStock',
              detail.quantity,
            );
          }
        }

        sale.status = SaleStatus.DELIVERED;
        sale.deliveredAt = new Date();
        await qr.manager.save(sale);

        item.status = TripItemStatus.DELIVERED;
        item.deliveredAt = new Date();
        item.notes = dto.reason || item.notes;
        await qr.manager.save(item);

      } else if (dto.outcome === DeliveryOutcome.PARTIAL) {
        // 2. ENTREGA PARCIAL:
        // Descontar entregado y crear TripReturn por el resto
        if (!dto.deliveredItems || dto.deliveredItems.length === 0) {
          throw new BadRequestException('Debe especificar las cantidades entregadas en una entrega parcial');
        }

        const tripReturn = qr.manager.create(TripReturn, {
          trip: { id: trip.id } as Trip,
          tripItem: { id: item.id } as TripItem,
          sale: { id: sale.id } as Sale,
          status: TripReturnStatus.PENDING_RECEIPT,
          reason: dto.reason || 'Entrega parcial en ruta',
          items: [],
        });

        const savedReturn = await qr.manager.save(tripReturn);
        const returnItemsToSave: TripReturnItem[] = [];

        for (const detail of sale.details) {
          const prodDelivered = dto.deliveredItems.find((di) => di.productId === detail.product.id);
          const deliveredQty = prodDelivered ? Number(prodDelivered.deliveredQuantity) : 0;
          const returnedQty = Math.max(0, Number(detail.quantity) - deliveredQty);

          if (deliveredQty > Number(detail.quantity)) {
            throw new BadRequestException(`La cantidad entregada (${deliveredQty}) supera la orden (${detail.quantity}) para ${detail.product.name}`);
          }

          // Descontar de stock físico y liberar reserva de lo efectivamente entregado
          if (deliveredQty > 0) {
            await this.movementService.create(
              {
                productId: detail.product.id,
                branchId: originBranchId,
                quantity: deliveredQty,
                type: MovementType.OUT,
                notes: `Entrega Parcial Venta ${sale.invoiceNumber} (Viaje ${trip.tripNumber})`,
                unitCost: detail.product.cost,
                totalCost: deliveredQty * detail.product.cost,
                status: MovementStatus.COMPLETED,
                referenceId: sale.id,
                referenceNumber: sale.invoiceNumber,
                concept: MovementConcept.SALE,
              },
              userId,
              true,
              qr.manager,
            );

            if (detail.product?.manageStock) {
              await qr.manager.decrement(
                Inventory,
                {
                  product: { id: detail.product.id },
                  branch: { id: originBranchId },
                  deletedAt: IsNull(),
                },
                'reservedStock',
                deliveredQty,
              );
            }
          }

          // Crear item de devolución para lo que regresa en el camión
          if (returnedQty > 0) {
            const retItem = qr.manager.create(TripReturnItem, {
              tripReturn: savedReturn,
              product: detail.product,
              returnedQuantity: returnedQty,
            });
            returnItemsToSave.push(retItem);
          }
        }

        if (returnItemsToSave.length > 0) {
          await qr.manager.save(returnItemsToSave);
        }

        sale.status = SaleStatus.PARTIALLY_DELIVERED;
        await qr.manager.save(sale);

        item.status = TripItemStatus.PARTIALLY_DELIVERED;
        item.deliveredAt = new Date();
        item.notes = dto.reason ? `Entrega parcial: ${dto.reason}` : 'Entrega parcial';
        await qr.manager.save(item);

      } else if (dto.outcome === DeliveryOutcome.REJECTED) {
        // 3. ENTREGA RECHAZADA:
        // Todo el pedido genera una devolución de viaje en tránsito de retorno a planta
        const tripReturn = qr.manager.create(TripReturn, {
          trip: { id: trip.id } as Trip,
          tripItem: { id: item.id } as TripItem,
          sale: { id: sale.id } as Sale,
          status: TripReturnStatus.PENDING_RECEIPT,
          reason: dto.reason || 'Pedido rechazado por cliente en ruta',
          items: [],
        });

        const savedReturn = await qr.manager.save(tripReturn);
        const returnItemsToSave: TripReturnItem[] = [];

        for (const detail of sale.details) {
          const retItem = qr.manager.create(TripReturnItem, {
            tripReturn: savedReturn,
            product: detail.product,
            returnedQuantity: Number(detail.quantity),
          });
          returnItemsToSave.push(retItem);
        }

        await qr.manager.save(returnItemsToSave);

        sale.status = SaleStatus.CANCELLED;
        await qr.manager.save(sale);

        item.status = TripItemStatus.REJECTED;
        item.deliveredAt = new Date();
        item.notes = dto.reason ? `Rechazado: ${dto.reason}` : 'Rechazado por el cliente';
        await qr.manager.save(item);
      }

      await qr.commitTransaction();
      return this.findOne(tripId);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async deliverTransferItem(tripId: string, itemId: string, dto: ReceiveTransferDto, userId?: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'items', 'items.transfer', 'items.transfer.originBranch', 'items.transfer.destinationBranch', 'items.transfer.items', 'items.transfer.items.product'],
    });

    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    if (trip.status !== TripStatus.ON_ROUTE) {
      throw new BadRequestException(`Solo se pueden marcar entregas en viajes que estén EN RUTA (Estado actual: ${trip.status})`);
    }

    const item = trip.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Operación con ID ${itemId} no encontrada en este viaje`);
    if (item.type !== TripItemType.TRANSFER || !item.transfer) {
      throw new BadRequestException('Esta operación no es un traslado de inventario');
    }

    if (item.status === TripItemStatus.DELIVERED) {
      throw new BadRequestException('Este traslado ya fue recibido y completado');
    }

    const transfer = await this.transferRepository.findOne({
      where: { id: item.transfer.id },
      relations: ['items', 'items.product', 'originBranch', 'destinationBranch'],
    });

    if (!transfer) throw new NotFoundException('Traslado no encontrado');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      let hasDiscrepancy = false;
      const discrepancies: string[] = [];

      // 1. Procesar inspección física producto por producto
      for (const tItem of transfer.items) {
        const receivedDto = dto.items.find((i) => i.productId === tItem.product.id);
        const receivedQty = receivedDto !== undefined ? Number(receivedDto.receivedQuantity) : Number(tItem.quantity);

        tItem.receivedQuantity = receivedQty;
        await qr.manager.save(tItem);

        const expectedQty = Number(tItem.quantity);
        if (receivedQty < expectedQty) {
          hasDiscrepancy = true;
          const diff = expectedQty - receivedQty;
          discrepancies.push(`${tItem.product.name}: Enviado ${expectedQty}, Recibido ${receivedQty} (Faltante: ${diff})`);
        } else if (receivedQty > expectedQty) {
          throw new BadRequestException(`La cantidad recibida (${receivedQty}) no puede superar la enviada (${expectedQty}) para ${tItem.product.name}`);
        }

        // 2. Ingresar a la sucursal de destino SOLO lo efectivamente recibido
        if (receivedQty > 0) {
          await this.movementService.create(
            {
              productId: tItem.product.id,
              branchId: transfer.destinationBranch.id,
              quantity: receivedQty,
              type: MovementType.TRANSFER_IN,
              sourceBranchId: transfer.originBranch.id,
              targetBranchId: transfer.destinationBranch.id,
              notes: `Viaje ${trip.tripNumber} - Traslado ${transfer.transferNumber} (Entrada física en destino)`,
              status: MovementStatus.COMPLETED,
              concept: MovementConcept.TRANSFER,
              referenceId: transfer.id,
              referenceNumber: transfer.transferNumber,
            },
            userId,
            true,
            qr.manager,
          );
        }
      }

      if (hasDiscrepancy) {
        // Caso con Discrepancia:
        transfer.status = TransferStatus.DISCREPANCY;
        if (dto.notes) {
          transfer.notes = transfer.notes ? `${transfer.notes} | Recepción con diferencias: ${dto.notes}` : `Recepción con diferencias: ${dto.notes}`;
        }
        await qr.manager.save(transfer);

        item.status = TripItemStatus.FAILED;
        item.deliveredAt = new Date();
        item.notes = `Diferencias en recepción: ${discrepancies.join('; ')}`;
        await qr.manager.save(item);

        // Generar automáticamente la Incidencia de Viaje
        const incidentDesc = `Discrepancia en traslado ${transfer.transferNumber} a sucursal ${transfer.destinationBranch.name}: ${discrepancies.join('; ')}`;
        const incident = this.tripIncidentRepository.create({
          trip: { id: trip.id } as Trip,
          tripItem: { id: item.id } as TripItem,
          description: incidentDesc,
          status: TripIncidentStatus.OPEN,
        });
        await qr.manager.save(incident);
      } else {
        // Caso Conforme:
        transfer.status = TransferStatus.RECEIVED;
        if (dto.notes) {
          transfer.notes = transfer.notes ? `${transfer.notes} | ${dto.notes}` : dto.notes;
        }
        await qr.manager.save(transfer);

        item.status = TripItemStatus.DELIVERED;
        item.deliveredAt = new Date();
        if (dto.notes) item.notes = dto.notes;
        await qr.manager.save(item);
      }

      await qr.commitTransaction();
      return this.findOne(tripId);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async completeItem(tripId: string, itemId: string, notes?: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['items', 'items.transfer', 'items.sale'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    if (trip.status !== TripStatus.ON_ROUTE) {
      throw new BadRequestException(`Solo se pueden marcar entregas en viajes que estén EN RUTA (Estado actual: ${trip.status})`);
    }

    const item = trip.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Operación con ID ${itemId} no encontrada en este viaje`);

    item.status = TripItemStatus.DELIVERED;
    item.deliveredAt = new Date();
    if (notes) item.notes = notes;
    await this.tripItemRepository.save(item);

    // Si es un traslado, actualizar a RECEIVED e ingresar stock a la sucursal de destino
    if (item.type === TripItemType.TRANSFER && item.transfer) {
      const fullTransfer = await this.transferRepository.findOne({
        where: { id: item.transfer.id },
        relations: ['items', 'items.product', 'originBranch', 'destinationBranch'],
      });

      if (fullTransfer && fullTransfer.status !== TransferStatus.RECEIVED) {
        fullTransfer.status = TransferStatus.RECEIVED;
        await this.transferRepository.save(fullTransfer);

        for (const tItem of fullTransfer.items) {
          await this.movementService.create(
            {
              productId: tItem.product.id,
              branchId: fullTransfer.destinationBranch.id,
              quantity: tItem.quantity,
              type: MovementType.TRANSFER_IN,
              sourceBranchId: fullTransfer.originBranch.id,
              targetBranchId: fullTransfer.destinationBranch.id,
              notes: `Viaje ${trip.tripNumber} - Traslado ${fullTransfer.transferNumber} (Entrada en destino)`,
              status: MovementStatus.COMPLETED,
              concept: MovementConcept.TRANSFER,
              referenceId: fullTransfer.id,
              referenceNumber: fullTransfer.transferNumber,
            },
            trip.createdBy?.id,
            true,
          );
        }
      }
    } else if (item.type === TripItemType.SALE_ORDER && item.sale) {
      item.sale.status = SaleStatus.DELIVERED;
      item.sale.deliveredAt = new Date();
      await this.saleRepository.save(item.sale);
    }

    return this.findOne(tripId);
  }

  async cancel(tripId: string, reason?: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['items', 'items.transfer', 'items.sale'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    if (trip.status === TripStatus.COMPLETED) {
      throw new BadRequestException('No se puede cancelar un viaje que ya ha sido completado');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      trip.status = TripStatus.CANCELLED;
      if (reason) trip.notes = trip.notes ? `${trip.notes} | Cancelación: ${reason}` : `Cancelación: ${reason}`;
      await queryRunner.manager.save(trip);

      // Revertir estados y stock si el viaje ya estaba en ruta
      for (const item of trip.items) {
        if (item.status !== TripItemStatus.DELIVERED) {
          if (item.type === TripItemType.TRANSFER && item.transfer) {
            const fullTransfer = await queryRunner.manager.findOne(InventoryTransfer, {
              where: { id: item.transfer.id },
              relations: ['items', 'items.product', 'originBranch', 'destinationBranch'],
            });

            if (fullTransfer && fullTransfer.status === TransferStatus.SHIPPED) {
              fullTransfer.status = TransferStatus.PENDING;
              await queryRunner.manager.save(fullTransfer);

              // Devolver stock al origen
              for (const tItem of fullTransfer.items) {
                await this.movementService.create(
                  {
                    productId: tItem.product.id,
                    branchId: fullTransfer.originBranch.id,
                    quantity: tItem.quantity,
                    type: MovementType.IN,
                    notes: `Cancelación Viaje ${trip.tripNumber} - Retorno Traslado ${fullTransfer.transferNumber}`,
                    status: MovementStatus.COMPLETED,
                    concept: MovementConcept.RETURN,
                    referenceId: fullTransfer.id,
                    referenceNumber: fullTransfer.transferNumber,
                  },
                  trip.createdBy?.id,
                  true,
                  queryRunner.manager,
                );
              }
            }
          } else if (item.type === TripItemType.SALE_ORDER && item.sale && item.sale.status === SaleStatus.OUT_FOR_DELIVERY) {
            item.sale.status = SaleStatus.READY_FOR_PICKUP;
            await queryRunner.manager.save(item.sale);
          }
        }
      }

      await queryRunner.commitTransaction();
      return this.findOne(tripId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(branchId?: string, status?: TripStatus, date?: string): Promise<TripResponseDto[]> {
    const queryBuilder = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.originBranch', 'originBranch')
      .leftJoinAndSelect('trip.truck', 'truck')
      .leftJoinAndSelect('trip.driver', 'driver')
      .leftJoinAndSelect('trip.createdBy', 'createdBy')
      .leftJoinAndSelect('trip.items', 'items')
      .leftJoinAndSelect('items.transfer', 'transfer')
      .leftJoinAndSelect('transfer.destinationBranch', 'destBranch')
      .leftJoinAndSelect('items.sale', 'sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .where('trip.deletedAt IS NULL');

    if (branchId) {
      queryBuilder.andWhere('originBranch.id = :branchId', { branchId });
    }

    if (status) {
      queryBuilder.andWhere('trip.status = :status', { status });
    }

    if (date) {
      queryBuilder.andWhere('trip.date = :date', { date });
    }

    queryBuilder.orderBy('trip.createdAt', 'DESC');

    const trips = await queryBuilder.getMany();
    return plainToInstance(TripResponseDto, trips);
  }

  async receiveReturn(tripId: string, returnId: string, dto: ReceiveTripReturnDto, userId?: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);

    const tripReturn = await this.tripReturnRepository.findOne({
      where: { id: returnId, trip: { id: tripId }, deletedAt: IsNull() },
      relations: ['items', 'items.product', 'sale'],
    });
    if (!tripReturn) throw new NotFoundException(`Devolución con ID ${returnId} no encontrada en este viaje`);
    if (tripReturn.status === TripReturnStatus.RECEIVED_IN_WAREHOUSE) {
      throw new BadRequestException('Esta devolución ya fue recibida y procesada en bodega');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const originBranchId = trip.originBranch.id;

      for (const item of tripReturn.items) {
        let receivedQty = Number(item.returnedQuantity);
        if (dto.items && dto.items.length > 0) {
          const match = dto.items.find((i) => i.productId === item.product.id);
          if (match) receivedQty = Number(match.receivedQuantity);
        }

        item.receivedQuantity = receivedQty;
        await qr.manager.save(item);

        // 1. Ingresar stock físico recuperado a la planta/origen
        if (receivedQty > 0) {
          await this.movementService.create(
            {
              productId: item.product.id,
              branchId: originBranchId,
              quantity: receivedQty,
              type: MovementType.IN,
              notes: `Recepción Devolución Viaje ${trip.tripNumber} (Orden ${tripReturn.sale.invoiceNumber})`,
              unitCost: item.product.cost,
              totalCost: receivedQty * item.product.cost,
              status: MovementStatus.COMPLETED,
              referenceId: tripReturn.id,
              referenceNumber: trip.tripNumber,
              concept: MovementConcept.RETURN,
            },
            userId,
            true,
            qr.manager,
          );
        }

        // 2. Liberar la reserva remanente en inventario que correspondía a la cantidad no entregada
        if (item.product?.manageStock) {
          await qr.manager.decrement(
            Inventory,
            {
              product: { id: item.product.id },
              branch: { id: originBranchId },
              deletedAt: IsNull(),
            },
            'reservedStock',
            item.returnedQuantity,
          );
        }
      }

      tripReturn.status = TripReturnStatus.RECEIVED_IN_WAREHOUSE;
      tripReturn.receivedAt = new Date();
      tripReturn.receivedBy = userId ? ({ id: userId } as any) : null;
      if (dto.notes) tripReturn.receptionNotes = dto.notes;
      await qr.manager.save(tripReturn);

      await qr.commitTransaction();
      return this.findOne(tripId);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async resolveIncident(tripId: string, incidentId: string, dto: ResolveTripIncidentDto, userId?: string): Promise<TripResponseDto> {
    const incident = await this.tripIncidentRepository.findOne({
      where: { id: incidentId, trip: { id: tripId }, deletedAt: IsNull() },
    });
    if (!incident) throw new NotFoundException(`Incidencia con ID ${incidentId} no encontrada`);

    incident.status = TripIncidentStatus.RESOLVED;
    incident.resolutionNotes = dto.resolutionNotes;
    incident.resolvedAt = new Date();
    incident.resolvedBy = userId ? ({ id: userId } as any) : null;

    await this.tripIncidentRepository.save(incident);
    return this.findOne(tripId);
  }

  async completeTrip(tripId: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['items', 'returns', 'incidents'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    if (trip.status !== TripStatus.ON_ROUTE) {
      throw new BadRequestException(`Solo se pueden finalizar viajes que estén EN RUTA (Estado actual: ${trip.status})`);
    }

    // 1. Validar si existen paradas pendientes
    const pendingItems = trip.items.filter((i) => i.status === TripItemStatus.PENDING);
    if (pendingItems.length > 0) {
      // Registrar incidencia automática si no existe
      const desc = `El viaje tiene ${pendingItems.length} parada(s) sin procesar`;
      const existing = await this.tripIncidentRepository.findOne({
        where: { trip: { id: tripId }, description: desc, status: TripIncidentStatus.OPEN },
      });
      if (!existing) {
        const incident = this.tripIncidentRepository.create({
          trip: { id: tripId } as Trip,
          description: desc,
          status: TripIncidentStatus.OPEN,
        });
        await this.tripIncidentRepository.save(incident);
      }

      throw new BadRequestException(`No se puede finalizar el viaje: Tiene ${pendingItems.length} parada(s) pendientes de atención. Se ha registrado una incidencia.`);
    }

    // 2. Validar si existen devoluciones pendientes de recepción en planta
    const returns = await this.tripReturnRepository.find({
      where: { trip: { id: tripId }, deletedAt: IsNull() },
    });
    const pendingReturns = returns.filter((r) => r.status === TripReturnStatus.PENDING_RECEIPT);
    if (pendingReturns.length > 0) {
      const desc = `Tiene ${pendingReturns.length} devolución(es) en tránsito pendientes de ser recibidas en bodega`;
      const existing = await this.tripIncidentRepository.findOne({
        where: { trip: { id: tripId }, description: desc, status: TripIncidentStatus.OPEN },
      });
      if (!existing) {
        const incident = this.tripIncidentRepository.create({
          trip: { id: tripId } as Trip,
          description: desc,
          status: TripIncidentStatus.OPEN,
        });
        await this.tripIncidentRepository.save(incident);
      }

      throw new BadRequestException(`No se puede finalizar el viaje: Hay ${pendingReturns.length} devolución(es) pendientes de confirmación en planta.`);
    }

    // 3. Validar si existen incidencias abiertas
    const openIncidents = await this.tripIncidentRepository.find({
      where: { trip: { id: tripId }, status: TripIncidentStatus.OPEN, deletedAt: IsNull() },
    });
    if (openIncidents.length > 0) {
      throw new BadRequestException(`No se puede finalizar el viaje: Existen ${openIncidents.length} incidencia(s) abiertas sin resolver.`);
    }

    trip.status = TripStatus.COMPLETED;
    trip.completedAt = new Date();
    await this.tripRepository.save(trip);

    return this.findOne(tripId);
  }

  async findOne(id: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'originBranch',
        'truck',
        'driver',
        'createdBy',
        'items',
        'items.transfer',
        'items.transfer.originBranch',
        'items.transfer.destinationBranch',
        'items.transfer.items',
        'items.transfer.items.product',
        'items.sale',
        'items.sale.customer',
        'items.sale.details',
        'items.sale.details.product',
        'returns',
        'returns.items',
        'returns.items.product',
        'returns.receivedBy',
        'incidents',
        'incidents.resolvedBy',
      ],
    });

    if (!trip) {
      throw new NotFoundException(`Viaje con ID ${id} no encontrado`);
    }

    return plainToInstance(TripResponseDto, trip);
  }

  async getPendingOperations(originBranchId?: string): Promise<{
    transfers: any[];
    sales: any[];
  }> {
    // 1. Traslados pendientes no asignados a viajes activos
    const transferQuery = this.transferRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.originBranch', 'originBranch')
      .leftJoinAndSelect('transfer.destinationBranch', 'destBranch')
      .leftJoinAndSelect('transfer.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where('transfer.deletedAt IS NULL')
      .andWhere('transfer.status = :status', { status: TransferStatus.PENDING })
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(TripItem, 'ti')
          .innerJoin('ti.trip', 't')
          .where('ti.transfer_id = transfer.id')
          .andWhere('t.status IN (:...activeStatuses)', { activeStatuses: [TripStatus.DRAFT, TripStatus.ON_ROUTE] })
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      });

    if (originBranchId) {
      transferQuery.andWhere('originBranch.id = :originBranchId', { originBranchId });
    }

    const transfers = await transferQuery.orderBy('transfer.createdAt', 'ASC').getMany();

    // 2. Órdenes de venta pendientes de despacho no asignadas a viajes activos
    const saleQuery = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.branch', 'branch')
      .leftJoinAndSelect('sale.details', 'details')
      .leftJoinAndSelect('details.product', 'product')
      .where('sale.deletedAt IS NULL')
      .andWhere('sale.status IN (:...pendingSaleStatuses)', {
        pendingSaleStatuses: [SaleStatus.CONFIRMED, SaleStatus.PREPARING, SaleStatus.READY_FOR_PICKUP, SaleStatus.PENDING],
      })
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(TripItem, 'ti')
          .innerJoin('ti.trip', 't')
          .where('ti.sale_id = sale.id')
          .andWhere('t.status IN (:...activeStatuses)', { activeStatuses: [TripStatus.DRAFT, TripStatus.ON_ROUTE] })
          .getQuery();
        return `NOT EXISTS ${subQuery}`;
      });

    if (originBranchId) {
      saleQuery.andWhere('branch.id = :originBranchId', { originBranchId });
    }

    const sales = await saleQuery.orderBy('sale.date', 'ASC').getMany();

    return { transfers, sales };
  }
}
