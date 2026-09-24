import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
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
import { AddTripItemsDto, CreateTripDto, CreateTripIncidentDto, DeliverSaleItemDto, DeliveryOutcome, ReceiveTripReturnDto, ResolveTripIncidentDto, TripResponseDto, UpdateTripDto } from '../dto/trip.dto';
import { ReceiveTransferDto } from '../dto/inventory-transfer.dto';
import { InventoryMovementService } from './inventory-movement.service';
import { MovementConcept, MovementStatus, MovementType } from '../entities/inventory-movement.entity';
import { Inventory } from '../entities/inventory.entity';
import { isSuperAdmin } from 'src/common/utils/user-scope.util';
import { TripGateway } from '../gateway/trip.gateway';

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
    private readonly tripGateway: TripGateway,
  ) {}

  private async generateTripNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.tripRepository.count();
    const sequence = String(count + 1).padStart(4, '0');
    return `TRIP-${dateStr}-${sequence}`;
  }

  private isDriver(trip: Trip, user?: any): boolean {
    return !!user?.id && trip.driver?.id === user.id;
  }

  private isPlant(trip: Trip, user?: any): boolean {
    return isSuperAdmin(user) || (!!user?.branch?.id && user.branch.id === trip.originBranch?.id);
  }

  private isDestinationStaff(trip: Trip, user?: any): boolean {
    const branchId = user?.branch?.id;
    if (!branchId) return false;
    return (trip.items || []).some((item) => item.transfer?.destinationBranch?.id === branchId);
  }

  private assertCanView(trip: Trip, user?: any): void {
    if (isSuperAdmin(user) || this.isDriver(trip, user) || this.isPlant(trip, user) || this.isDestinationStaff(trip, user)) {
      return;
    }
    throw new ForbiddenException('No tiene acceso a este viaje');
  }

  private assertDriver(trip: Trip, user?: any): void {
    if (isSuperAdmin(user) || this.isDriver(trip, user)) return;
    throw new ForbiddenException('Solo el piloto asignado puede realizar esta acción');
  }

  private assertPlant(trip: Trip, user?: any): void {
    if (this.isPlant(trip, user)) return;
    throw new ForbiddenException('Solo personal de la planta de origen puede realizar esta acción');
  }

  private assertDriverOrPlant(trip: Trip, user?: any): void {
    if (isSuperAdmin(user) || this.isDriver(trip, user) || this.isPlant(trip, user)) return;
    throw new ForbiddenException('Solo el piloto asignado o personal de planta puede realizar esta acción');
  }

  private assertPlantNotDriver(trip: Trip, user?: any): void {
    if (isSuperAdmin(user)) return;
    if (this.isDriver(trip, user)) {
      throw new ForbiddenException('El piloto no puede confirmar esta operación de planta');
    }
    if (user?.branch?.id && user.branch.id === trip.originBranch?.id) return;
    throw new ForbiddenException('Solo personal de la planta de origen puede realizar esta acción');
  }

  /** Recepción de traslado: administrador (global o planta) o sucursal destino. Nunca el piloto. */
  private assertTransferReceiver(trip: Trip, user?: any, destinationBranchId?: string): void {
    if (this.isDriver(trip, user) && !isSuperAdmin(user)) {
      throw new ForbiddenException('El piloto no puede confirmar la recepción del traslado');
    }
    if (isSuperAdmin(user)) return;
    if (this.isPlant(trip, user)) return;
    if (destinationBranchId && user?.branch?.id === destinationBranchId) return;
    throw new ForbiddenException('Solo un administrador o personal de la sucursal destino puede confirmar la recepción');
  }

  private userSummary(user?: User | null) {
    if (!user?.id) return null;
    return { id: user.id, name: user.name, email: user.email };
  }

  private branchSummary(branch?: Branch | null) {
    if (!branch?.id) return null;
    return {
      id: branch.id,
      name: branch.name,
      address: branch.address ?? null,
      phone: branch.phone ?? null,
      isPlant: branch.isPlant,
    };
  }

  private productSummary(product?: any) {
    if (!product?.id) return null;
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      manageStock: product.manageStock,
      unit: product.unit
        ? {
            id: product.unit.id,
            name: product.unit.name,
            abbreviation: product.unit.abbreviation,
            allowsDecimals: !!product.unit.allowsDecimals,
          }
        : null,
    };
  }

  private mapSale(sale?: Sale | null) {
    if (!sale?.id) return null;
    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      status: sale.status,
      total: sale.total,
      pendingAmount: sale.pendingAmount,
      notes: sale.notes,
      guestCustomer: sale.guestCustomer ?? null,
      deliveryAddress: sale.deliveryAddress ?? sale.customer?.address ?? sale.guestCustomer?.address ?? null,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            phone: sale.customer.phone,
            address: sale.customer.address,
          }
        : null,
      details: (sale.details || []).map((detail) => ({
        id: detail.id,
        quantity: Number(detail.quantity),
        unitPrice: Number(detail.unitPrice),
        product: this.productSummary(detail.product),
      })),
    };
  }

  private toTripDto(trip: Trip): TripResponseDto {
    return {
      id: trip.id,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      deletedAt: trip.deletedAt,
      tripNumber: trip.tripNumber,
      date: trip.date,
      status: trip.status,
      departureAt: trip.departureAt ?? null,
      completedAt: trip.completedAt ?? null,
      notes: trip.notes ?? null,
      originBranch: this.branchSummary(trip.originBranch),
      truck: trip.truck
        ? {
            id: trip.truck.id,
            name: trip.truck.name,
            licensePlate: trip.truck.licensePlate,
            status: trip.truck.status,
          }
        : null,
      driver: this.userSummary(trip.driver),
      createdBy: this.userSummary(trip.createdBy),
      items: (trip.items || []).map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        sequence: item.sequence,
        deliveredAt: item.deliveredAt ?? null,
        notes: item.notes ?? null,
        sale: this.mapSale(item.sale),
        transfer: item.transfer
          ? {
              id: item.transfer.id,
              transferNumber: item.transfer.transferNumber,
              status: item.transfer.status,
              originBranch: this.branchSummary(item.transfer.originBranch),
              destinationBranch: this.branchSummary(item.transfer.destinationBranch),
              items: (item.transfer.items || []).map((transferItem) => ({
                id: transferItem.id,
                quantity: Number(transferItem.quantity),
                receivedQuantity: transferItem.receivedQuantity != null ? Number(transferItem.receivedQuantity) : null,
                product: this.productSummary(transferItem.product),
              })),
            }
          : null,
      })),
      returns: (trip.returns || []).map((tripReturn) => ({
        id: tripReturn.id,
        status: tripReturn.status,
        reason: tripReturn.reason ?? null,
        receptionNotes: tripReturn.receptionNotes ?? null,
        receivedAt: tripReturn.receivedAt ?? null,
        receivedBy: this.userSummary(tripReturn.receivedBy as any),
        items: (tripReturn.items || []).map((returnItem) => ({
          id: returnItem.id,
          returnedQuantity: Number(returnItem.returnedQuantity),
          receivedQuantity: returnItem.receivedQuantity != null ? Number(returnItem.receivedQuantity) : null,
          product: this.productSummary(returnItem.product),
        })),
      })),
      incidents: (trip.incidents || []).map((incident) => ({
        id: incident.id,
        description: incident.description,
        status: incident.status,
        resolutionNotes: incident.resolutionNotes ?? null,
        resolvedAt: incident.resolvedAt ?? null,
        resolvedBy: this.userSummary(incident.resolvedBy as any),
      })),
    } as TripResponseDto;
  }

  private toTripDtoList(trips: Trip[]): TripResponseDto[] {
    return trips.map((trip) => this.toTripDto(trip));
  }

  private async getTripForAccess(tripId: string, extraRelations: string[] = []): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver', ...extraRelations],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    return trip;
  }

  private async ensureOpenIncident(tripId: string, description: string, tripItemId?: string): Promise<void> {
    const existing = await this.tripIncidentRepository.findOne({
      where: { trip: { id: tripId }, description, status: TripIncidentStatus.OPEN },
    });
    if (existing) return;
    const incident = this.tripIncidentRepository.create({
      trip: { id: tripId } as Trip,
      tripItem: tripItemId ? ({ id: tripItemId } as TripItem) : null,
      description,
      status: TripIncidentStatus.OPEN,
    });
    await this.tripIncidentRepository.save(incident);
  }

  async create(dto: CreateTripDto, user?: any): Promise<TripResponseDto> {
    if (!isSuperAdmin(user) && user?.branch?.id !== dto.originBranchId) {
      throw new ForbiddenException('Solo personal de la planta de origen puede crear viajes');
    }

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
      createdBy: user?.id ? ({ id: user.id } as any) : null,
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

  async addItems(tripId: string, dto: AddTripItemsDto, user?: any): Promise<TripResponseDto> {
    const trip = await this.getTripForAccess(tripId);
    this.assertPlant(trip, user);
    if (trip.status !== TripStatus.DRAFT) {
      throw new BadRequestException(`Solo se pueden agregar operaciones a un viaje en estado BORRADOR (Estado actual: ${trip.status})`);
    }

    await this.attachItemsToTrip(trip, dto.items);
    return this.findOne(tripId);
  }

  async removeItem(tripId: string, itemId: string, user?: any): Promise<TripResponseDto> {
    const trip = await this.getTripForAccess(tripId);
    this.assertPlant(trip, user);
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

  async confirmDeparture(tripId: string, user?: any): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver', 'items', 'items.transfer', 'items.sale'],
      relationLoadStrategy: 'query',
    });
    if (!trip) {
      throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    }
    this.assertDriverOrPlant(trip, user);
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
      await queryRunner.manager.update(Trip, { id: tripId }, {
        status: TripStatus.ON_ROUTE,
        departureAt: new Date(),
      });

      for (const item of trip.items) {
        if (item.type === TripItemType.TRANSFER && item.transfer) {
          const fullTransfer = await queryRunner.manager.findOne(InventoryTransfer, {
            where: { id: item.transfer.id },
            relations: ['items', 'items.product', 'originBranch', 'destinationBranch'],
            relationLoadStrategy: 'query',
          });

          if (fullTransfer && fullTransfer.status === TransferStatus.PENDING) {
            await queryRunner.manager.update(InventoryTransfer, { id: fullTransfer.id }, { status: TransferStatus.SHIPPED });

            for (const tItem of fullTransfer.items) {
              if (!tItem.product?.manageStock) continue;
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
                user?.id,
                true,
                queryRunner.manager,
              );
            }
          }
        } else if (item.type === TripItemType.SALE_ORDER && item.sale) {
          await queryRunner.manager.update(Sale, { id: item.sale.id }, { status: SaleStatus.OUT_FOR_DELIVERY });
        }
      }

      await queryRunner.commitTransaction();
      this.tripGateway.notifyTripUpdated({
        type: 'TRIP_STATUS_CHANGED',
        tripId,
        tripStatus: TripStatus.ON_ROUTE,
      });
      return this.findOne(tripId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deliverSaleItem(tripId: string, itemId: string, dto: DeliverSaleItemDto, user?: any): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver', 'items', 'items.sale', 'items.sale.details', 'items.sale.details.product'],
    });

    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    this.assertDriver(trip, user);
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

    if (!sale.deliveryOtp || sale.deliveryOtp.trim() !== dto.otp.trim()) {
      throw new BadRequestException('Código OTP inválido o no coincide con el provisto al cliente');
    }

    const saleBranchId = sale.branch?.id;
    if (!saleBranchId) {
      throw new BadRequestException('La orden de venta no tiene sucursal asociada');
    }
    const userId = user?.id;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (dto.outcome === DeliveryOutcome.FULL) {
        for (const detail of sale.details) {
          if (detail.product?.manageStock) {
            await this.movementService.create(
              {
                productId: detail.product.id,
                branchId: saleBranchId,
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

            await qr.manager.decrement(
              Inventory,
              {
                product: { id: detail.product.id },
                branch: { id: saleBranchId },
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
        if (!dto.deliveredItems || dto.deliveredItems.length === 0) {
          throw new BadRequestException('Debe especificar las cantidades entregadas en una entrega parcial');
        }

        const qtyByDetailId = new Map<string, number>();
        for (const line of dto.deliveredItems) {
          if (qtyByDetailId.has(line.saleDetailId)) {
            throw new BadRequestException('Hay renglones duplicados en deliveredItems (mismo saleDetailId)');
          }
          qtyByDetailId.set(line.saleDetailId, Number(line.deliveredQuantity));
        }

        const saleDetailIds = new Set(sale.details.map((d) => d.id));
        for (const id of qtyByDetailId.keys()) {
          if (!saleDetailIds.has(id)) {
            throw new BadRequestException(`El detalle ${id} no pertenece a esta orden`);
          }
        }

        let totalDelivered = 0;
        let totalReturned = 0;
        for (const detail of sale.details) {
          const deliveredQty = qtyByDetailId.has(detail.id) ? Number(qtyByDetailId.get(detail.id)) : 0;
          if (deliveredQty > Number(detail.quantity)) {
            throw new BadRequestException(
              `La cantidad entregada (${deliveredQty}) supera la orden (${detail.quantity}) para ${detail.product.name}`,
            );
          }
          totalDelivered += deliveredQty;
          totalReturned += Math.max(0, Number(detail.quantity) - deliveredQty);
        }

        if (totalDelivered <= 0) {
          throw new BadRequestException('Una entrega parcial requiere al menos una cantidad entregada. Use rejected si no hubo entrega');
        }
        if (totalReturned <= 0) {
          throw new BadRequestException('No hay cantidades a devolver. Use outcome full');
        }

        const tripReturn = qr.manager.create(TripReturn, {
          trip: { id: trip.id } as Trip,
          tripItem: { id: item.id } as TripItem,
          sale: { id: sale.id } as Sale,
          status: TripReturnStatus.PENDING_RECEIPT,
          reason: dto.reason,
          items: [],
        });

        const savedReturn = await qr.manager.save(tripReturn);
        const returnItemsToSave: TripReturnItem[] = [];

        for (const detail of sale.details) {
          const deliveredQty = qtyByDetailId.has(detail.id) ? Number(qtyByDetailId.get(detail.id)) : 0;
          const returnedQty = Math.max(0, Number(detail.quantity) - deliveredQty);

          if (deliveredQty > 0 && detail.product?.manageStock) {
            await this.movementService.create(
              {
                productId: detail.product.id,
                branchId: saleBranchId,
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

            await qr.manager.decrement(
              Inventory,
              {
                product: { id: detail.product.id },
                branch: { id: saleBranchId },
                deletedAt: IsNull(),
              },
              'reservedStock',
              deliveredQty,
            );
          }

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
        item.notes = `Entrega parcial: ${dto.reason}`;
        await qr.manager.save(item);

      } else if (dto.outcome === DeliveryOutcome.REJECTED) {
        const tripReturn = qr.manager.create(TripReturn, {
          trip: { id: trip.id } as Trip,
          tripItem: { id: item.id } as TripItem,
          sale: { id: sale.id } as Sale,
          status: TripReturnStatus.PENDING_RECEIPT,
          reason: dto.reason,
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
        item.notes = `Rechazado: ${dto.reason}`;
        await qr.manager.save(item);
      }

      await qr.commitTransaction();
      this.tripGateway.notifyTripUpdated({
        type: 'SALE_DELIVERED',
        tripId,
        itemId,
        itemStatus: item.status,
        tripStatus: trip.status,
        outcome: dto.outcome,
      });
      return this.findOne(tripId);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async deliverTransferItem(tripId: string, itemId: string, dto: ReceiveTransferDto, user?: any): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver', 'items', 'items.transfer', 'items.transfer.originBranch', 'items.transfer.destinationBranch', 'items.transfer.items', 'items.transfer.items.product'],
    });

    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    const item = trip.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Operación con ID ${itemId} no encontrada en este viaje`);
    if (item.type !== TripItemType.TRANSFER || !item.transfer) {
      throw new BadRequestException('Esta operación no es un traslado de inventario');
    }
    this.assertTransferReceiver(trip, user, item.transfer.destinationBranch?.id);
    if (trip.status !== TripStatus.ON_ROUTE) {
      throw new BadRequestException(`Solo se pueden marcar entregas en viajes que estén EN RUTA (Estado actual: ${trip.status})`);
    }

    if (item.status === TripItemStatus.DELIVERED) {
      throw new BadRequestException('Este traslado ya fue recibido y completado');
    }

    const transfer = await this.transferRepository.findOne({
      where: { id: item.transfer.id },
      relations: ['items', 'items.product', 'originBranch', 'destinationBranch'],
    });

    if (!transfer) throw new NotFoundException('Traslado no encontrado');

    const userId = user?.id;
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
      this.tripGateway.notifyTripUpdated({
        type: 'TRANSFER_RECEIVED',
        tripId,
        itemId,
        itemStatus: item.status,
        tripStatus: trip.status,
        transferStatus: transfer.status,
      });
      return this.findOne(tripId);
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async completeItem(tripId: string, itemId: string): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['items'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);

    const item = trip.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Operación con ID ${itemId} no encontrada en este viaje`);

    if (item.type === TripItemType.SALE_ORDER) {
      throw new BadRequestException('Use POST /trips/:id/items/:itemId/deliver-sale con el OTP del cliente');
    }
    throw new BadRequestException('Use POST /trips/:id/items/:itemId/deliver-transfer para registrar la recepción del traslado');
  }

  async cancel(tripId: string, reason?: string, user?: any): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver', 'items', 'items.transfer', 'items.sale'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    this.assertPlant(trip, user);
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

  private readonly tripGraphRelations = [
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
    'items.transfer.items.product.unit',
    'items.sale',
    'items.sale.customer',
    'items.sale.details',
    'items.sale.details.product',
    'items.sale.details.product.unit',
    'returns',
    'returns.items',
    'returns.items.product',
    'returns.items.product.unit',
    'returns.receivedBy',
    'incidents',
    'incidents.resolvedBy',
  ];

  private async loadTripsByIds(ids: string[]): Promise<Trip[]> {
    if (!ids.length) return [];
    const trips = await this.tripRepository.find({
      where: { id: In(ids), deletedAt: IsNull() },
      relations: this.tripGraphRelations,
      relationLoadStrategy: 'query',
    });
    const byId = new Map(trips.map((trip) => [trip.id, trip]));
    return ids.map((id) => byId.get(id)).filter((trip): trip is Trip => !!trip);
  }

  private createListQuery() {
    return this.tripRepository
      .createQueryBuilder('trip')
      .leftJoin('trip.originBranch', 'originBranch')
      .leftJoin('trip.driver', 'driver')
      .where('trip.deletedAt IS NULL');
  }

  async findAll(branchId?: string, status?: TripStatus, date?: string): Promise<TripResponseDto[]> {
    const queryBuilder = this.createListQuery();

    if (branchId) {
      queryBuilder.andWhere('originBranch.id = :branchId', { branchId });
    }

    if (status) {
      queryBuilder.andWhere('trip.status = :status', { status });
    }

    if (date) {
      queryBuilder.andWhere('trip.date = :date', { date });
    }

    queryBuilder.select('trip.id', 'id').orderBy('trip.createdAt', 'DESC');
    const rows = await queryBuilder.getRawMany();
    const ids = rows.map((row) => row.id).filter(Boolean);
    const trips = await this.loadTripsByIds(ids);
    return this.toTripDtoList(trips);
  }

  async findMine(driverId: string, status?: TripStatus, date?: string): Promise<TripResponseDto[]> {
    const queryBuilder = this.createListQuery();
    queryBuilder.andWhere('driver.id = :driverId', { driverId });

    if (status) {
      queryBuilder.andWhere('trip.status = :status', { status });
    } else {
      queryBuilder.andWhere('trip.status IN (:...statuses)', {
        statuses: [TripStatus.DRAFT, TripStatus.ON_ROUTE],
      });
    }

    if (date) {
      queryBuilder.andWhere('trip.date = :date', { date });
    }

    queryBuilder.select('trip.id', 'id').orderBy('trip.date', 'ASC').addOrderBy('trip.createdAt', 'DESC');
    const rows = await queryBuilder.getRawMany();
    const ids = rows.map((row) => row.id).filter(Boolean);
    const trips = await this.loadTripsByIds(ids);
    return this.toTripDtoList(trips);
  }

  async receiveReturn(tripId: string, returnId: string, dto: ReceiveTripReturnDto, user?: any): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    this.assertPlantNotDriver(trip, user);

    const tripReturn = await this.tripReturnRepository.findOne({
      where: { id: returnId, trip: { id: tripId }, deletedAt: IsNull() },
      relations: ['items', 'items.product', 'sale', 'sale.branch', 'tripItem'],
    });
    if (!tripReturn) throw new NotFoundException(`Devolución con ID ${returnId} no encontrada en este viaje`);
    if (tripReturn.status === TripReturnStatus.RECEIVED_IN_WAREHOUSE) {
      throw new BadRequestException('Esta devolución ya fue recibida y procesada en bodega');
    }

    const saleBranchId = tripReturn.sale?.branch?.id;
    if (!saleBranchId) {
      throw new BadRequestException('La orden asociada a la devolución no tiene sucursal');
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const discrepancies: string[] = [];

      for (const item of tripReturn.items) {
        const expectedQty = Number(item.returnedQuantity);
        let receivedQty = expectedQty;
        if (dto.items && dto.items.length > 0) {
          const match = dto.items.find((i) => i.productId === item.product.id);
          if (match) receivedQty = Number(match.receivedQuantity);
        }

        if (receivedQty > expectedQty) {
          throw new BadRequestException(
            `La cantidad recibida (${receivedQty}) no puede superar la declarada en retorno (${expectedQty}) para ${item.product.name}`,
          );
        }

        if (receivedQty < expectedQty) {
          discrepancies.push(
            `${item.product.name}: Esperado ${expectedQty}, recibido ${receivedQty} (faltante: ${expectedQty - receivedQty})`,
          );
        }

        item.receivedQuantity = receivedQty;
        await qr.manager.save(item);

        if (item.product?.manageStock) {
          await qr.manager.decrement(
            Inventory,
            {
              product: { id: item.product.id },
              branch: { id: saleBranchId },
              deletedAt: IsNull(),
            },
            'reservedStock',
            item.returnedQuantity,
          );
        }
      }

      tripReturn.status = TripReturnStatus.RECEIVED_IN_WAREHOUSE;
      tripReturn.receivedAt = new Date();
      tripReturn.receivedBy = user?.id ? ({ id: user.id } as any) : null;
      const discrepancyNote = discrepancies.length
        ? `Discrepancia en recepción: ${discrepancies.join('; ')}`
        : null;
      tripReturn.receptionNotes = [dto.notes, discrepancyNote].filter(Boolean).join(' | ') || null;
      await qr.manager.save(tripReturn);

      if (discrepancies.length) {
        const invoice = tripReturn.sale?.invoiceNumber || 'sin factura';
        const incident = qr.manager.create(TripIncident, {
          trip: { id: tripId } as Trip,
          tripItem: tripReturn.tripItem?.id ? ({ id: tripReturn.tripItem.id } as TripItem) : null,
          description: `Faltante al recibir devolución de orden ${invoice}: ${discrepancies.join('; ')}`,
          status: TripIncidentStatus.OPEN,
        });
        await qr.manager.save(incident);
      }

      await qr.commitTransaction();
      return this.findOne(tripId);
    } catch (error) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async createIncident(tripId: string, dto: CreateTripIncidentDto, user?: any): Promise<TripResponseDto> {
    const trip = await this.getTripForAccess(tripId);
    this.assertDriverOrPlant(trip, user);

    if (dto.tripItemId) {
      const item = await this.tripItemRepository.findOne({
        where: { id: dto.tripItemId, trip: { id: tripId } },
      });
      if (!item) throw new NotFoundException(`Operación con ID ${dto.tripItemId} no encontrada en este viaje`);
    }

    const incident = this.tripIncidentRepository.create({
      trip: { id: tripId } as Trip,
      tripItem: dto.tripItemId ? ({ id: dto.tripItemId } as TripItem) : null,
      description: dto.description,
      status: TripIncidentStatus.OPEN,
    });
    await this.tripIncidentRepository.save(incident);
    return this.findOne(tripId);
  }

  async resolveIncident(tripId: string, incidentId: string, dto: ResolveTripIncidentDto, user?: any): Promise<TripResponseDto> {
    const trip = await this.getTripForAccess(tripId);
    this.assertPlantNotDriver(trip, user);

    const incident = await this.tripIncidentRepository.findOne({
      where: { id: incidentId, trip: { id: tripId }, deletedAt: IsNull() },
    });
    if (!incident) throw new NotFoundException(`Incidencia con ID ${incidentId} no encontrada`);

    incident.status = TripIncidentStatus.RESOLVED;
    incident.resolutionNotes = dto.resolutionNotes;
    incident.resolvedAt = new Date();
    incident.resolvedBy = user?.id ? ({ id: user.id } as any) : null;

    await this.tripIncidentRepository.save(incident);
    return this.findOne(tripId);
  }

  async completeTrip(tripId: string, user?: any): Promise<TripResponseDto> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId, deletedAt: IsNull() },
      relations: ['originBranch', 'driver', 'items', 'returns', 'incidents'],
    });
    if (!trip) throw new NotFoundException(`Viaje con ID ${tripId} no encontrado`);
    this.assertDriverOrPlant(trip, user);
    if (trip.status !== TripStatus.ON_ROUTE) {
      throw new BadRequestException(`Solo se pueden finalizar viajes que estén EN RUTA (Estado actual: ${trip.status})`);
    }

    const pendingItems = trip.items.filter((i) => i.status === TripItemStatus.PENDING);
    const failedItems = trip.items.filter((i) => i.status === TripItemStatus.FAILED);
    const blockingStops = pendingItems.length + failedItems.length;
    if (blockingStops > 0) {
      const desc = pendingItems.length
        ? `El viaje tiene ${pendingItems.length} parada(s) sin procesar`
        : `El viaje tiene ${failedItems.length} parada(s) con falla sin resolver`;
      await this.ensureOpenIncident(tripId, desc);
      throw new BadRequestException(
        `No se puede finalizar el viaje: Tiene ${blockingStops} parada(s) pendientes o con falla. Se ha registrado una incidencia.`,
      );
    }

    const returns = await this.tripReturnRepository.find({
      where: { trip: { id: tripId }, deletedAt: IsNull() },
    });
    const pendingReturns = returns.filter((r) => r.status === TripReturnStatus.PENDING_RECEIPT);
    if (pendingReturns.length > 0) {
      const desc = `Tiene ${pendingReturns.length} devolución(es) en tránsito pendientes de ser recibidas en bodega`;
      await this.ensureOpenIncident(tripId, desc);
      throw new BadRequestException(`No se puede finalizar el viaje: Hay ${pendingReturns.length} devolución(es) pendientes de confirmación en planta.`);
    }

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

  async findOne(id: string, user?: any): Promise<TripResponseDto> {
    const [trip] = await this.loadTripsByIds([id]);

    if (!trip) {
      throw new NotFoundException(`Viaje con ID ${id} no encontrado`);
    }

    if (user) this.assertCanView(trip, user);
    return this.toTripDto(trip);
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
      .leftJoinAndSelect('product.unit', 'transferProductUnit')
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
      .leftJoinAndSelect('product.unit', 'saleProductUnit')
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
