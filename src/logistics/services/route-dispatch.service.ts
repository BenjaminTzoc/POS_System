import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { RouteDispatch, RouteDispatchItem, RouteDispatchStatus, Product, Branch, ProductType } from '../entities';
import { CreateRouteDispatchDto, ReceiveRouteDispatchDto, LiquidateRouteDispatchDto } from '../dto/route-dispatch.dto';
import { InventoryMovementService } from './inventory-movement.service';
import { MovementType, MovementConcept, MovementStatus } from '../entities/inventory-movement.entity';
import { SaleDetail } from '../../sales/entities/sale-detail.entity';

@Injectable()
export class RouteDispatchService {
  constructor(
    @InjectRepository(RouteDispatch)
    private readonly dispatchRepository: Repository<RouteDispatch>,
    @InjectRepository(RouteDispatchItem)
    private readonly itemRepository: Repository<RouteDispatchItem>,
    private readonly movementService: InventoryMovementService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateRouteDispatchDto, userId?: string): Promise<RouteDispatch> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let origin: Branch | null = null;
      if (dto.originBranchId) {
        origin = await queryRunner.manager.findOne(Branch, {
          where: { id: dto.originBranchId, deletedAt: IsNull() },
        });

        if (!origin) {
          throw new NotFoundException(`Sucursal de origen con ID ${dto.originBranchId} no encontrada`);
        }

        if (!origin.isPlant) {
          throw new BadRequestException('La sucursal de origen debe ser marcada como planta');
        }
      }

      const dispatch = this.dispatchRepository.create({
        date: new Date(dto.date),
        branch: { id: dto.branchId } as any,
        originBranch: origin ? origin : undefined,
        responsible: userId ? ({ id: userId } as any) : null,
        status: RouteDispatchStatus.SENT,
        notes: dto.notes,
      });

      const savedDispatch = await queryRunner.manager.save(dispatch);

      const items: RouteDispatchItem[] = [];
      for (const itemDto of dto.items) {
        const product = await queryRunner.manager.findOne(Product, {
          where: { id: itemDto.productId, deletedAt: IsNull() },
        });

        if (!product) {
          throw new NotFoundException(`Producto con ID ${itemDto.productId} no encontrado`);
        }

        if (product.isMaster) {
          throw new BadRequestException(`El producto '${product.name}' es un Maestro y no puede ser despachado.`);
        }

        if (!product.manageStock) {
          throw new BadRequestException(`El producto '${product.name}' no gestiona inventario.`);
        }

        if (product.type !== ProductType.FINISHED_PRODUCT && product.type !== ProductType.COMPONENT) {
          throw new BadRequestException(`El producto '${product.name}' no es un producto terminado ni componente.`);
        }

        const item = this.itemRepository.create({
          routeDispatch: savedDispatch,
          product: product,
          sentQuantity: itemDto.sentQuantity,
        } as any) as unknown as RouteDispatchItem;
        
        const savedItem = await queryRunner.manager.save(item);
        items.push(savedItem);

        // Movimiento de salida si hay sucursal de origen
        if (origin) {
          await this.movementService.create({
            productId: itemDto.productId,
            branchId: origin.id,
            quantity: itemDto.sentQuantity,
            type: MovementType.OUT,
            concept: MovementConcept.ROUTE_DISPATCH,
            notes: `Despacho de Ruta ${savedDispatch.id} (Salida de Planta)`,
            status: MovementStatus.COMPLETED,
            referenceId: savedDispatch.id,
          }, userId, true);
        }
      }

      savedDispatch.items = items;
      await queryRunner.commitTransaction();
      return savedDispatch;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async receive(id: string, dto: ReceiveRouteDispatchDto): Promise<RouteDispatch> {
    const dispatch = await this.dispatchRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['items', 'items.product', 'branch'],
    });

    if (!dispatch) throw new NotFoundException(`Despacho con ID ${id} no encontrado`);
    if (dispatch.status !== RouteDispatchStatus.SENT) throw new BadRequestException('El despacho ya fue recibido o liquidado');

    for (const itemDto of dto.items) {
      const item = dispatch.items.find(i => i.product.id === itemDto.productId) as any;
      if (item) {
        item.receivedQuantity = itemDto.receivedQuantity;
        await this.itemRepository.save(item);

        // Movimiento de entrada a la sucursal de destino
        await this.movementService.create({
          productId: item.product.id,
          branchId: dispatch.branch.id,
          quantity: itemDto.receivedQuantity,
          type: MovementType.IN,
          concept: MovementConcept.ROUTE_DISPATCH,
          notes: `Recepción de Despacho ${dispatch.id}`,
          status: MovementStatus.COMPLETED,
          referenceId: dispatch.id,
        }, undefined, true);
      }
    }

    dispatch.status = RouteDispatchStatus.RECEIVED;
    return this.dispatchRepository.save(dispatch);
  }

  async reconcile(id: string): Promise<RouteDispatch> {
    const dispatch = await this.dispatchRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['items', 'items.product', 'branch'],
    });

    if (!dispatch) throw new NotFoundException(`Despacho con ID ${id} no encontrado`);

    // Obtener ventas reales de la sucursal en esa fecha
    for (const item of dispatch.items as any[]) {
      const sales = await this.dataSource.getRepository(SaleDetail).createQueryBuilder('sd')
        .innerJoin('sd.sale', 's')
        .where('s.branch_id = :branchId', { branchId: dispatch.branch.id })
        .andWhere('CAST(s.date AS DATE) = :date', { date: dispatch.date })
        .andWhere('sd.product_id = :productId', { productId: item.product.id })
        .andWhere('s.status != :status', { status: 'cancelled' })
        .select('SUM(sd.quantity)', 'total')
        .getRawOne();

      item.soldQuantity = parseFloat(sales?.total || '0');
      await this.itemRepository.save(item);
    }

    dispatch.status = RouteDispatchStatus.RECONCILED;
    return this.dispatchRepository.save(dispatch);
  }

  async liquidate(id: string, dto: LiquidateRouteDispatchDto): Promise<RouteDispatch> {
    const dispatch = await this.dispatchRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['items', 'items.product', 'originBranch'],
    });

    if (!dispatch) throw new NotFoundException(`Despacho con ID ${id} no encontrado`);

    for (const itemDto of dto.items) {
      const item = dispatch.items.find(i => i.product.id === itemDto.productId) as any;
      if (item) {
        item.soldQuantity = itemDto.soldQuantity;
        item.returnedQuantity = itemDto.returnedQuantity;
        item.stayedQuantity = itemDto.stayedQuantity;
        item.wasteQuantity = itemDto.wasteQuantity;
        item.notes = itemDto.notes;
        
        // Discrepancia = Recibido - (Venta + Retorno + Merma + Se Quedó)
        const received = item.receivedQuantity || item.sentQuantity;
        item.discrepancy = received - (item.soldQuantity + item.returnedQuantity + item.wasteQuantity + item.stayedQuantity);
        
        await this.itemRepository.save(item);

        // 1. Si hubo retorno, sale de sucursal y entra a planta
        if (item.returnedQuantity > 0) {
          // Salida de sucursal
          await this.movementService.create({
            productId: item.product.id,
            branchId: dispatch.branch.id,
            quantity: item.returnedQuantity,
            type: MovementType.OUT,
            concept: MovementConcept.ROUTE_RETURN,
            notes: `Liquidación Despacho ${dispatch.id} (Retorno a Planta)`,
            status: MovementStatus.COMPLETED,
            referenceId: dispatch.id,
          }, undefined, true);

          // Entrada a planta (si existe sucursal de origen)
          if (dispatch.originBranch) {
            await this.movementService.create({
              productId: item.product.id,
              branchId: dispatch.originBranch.id,
              quantity: item.returnedQuantity,
              type: MovementType.IN,
              concept: MovementConcept.ROUTE_RETURN,
              notes: `Liquidación Despacho ${dispatch.id} (Retorno desde Sucursal)`,
              status: MovementStatus.COMPLETED,
              referenceId: dispatch.id,
            }, undefined, true);
          }
        }

        // 2. Si hubo merma, sale de sucursal
        if (item.wasteQuantity > 0) {
          await this.movementService.create({
            productId: item.product.id,
            branchId: dispatch.branch.id,
            quantity: item.wasteQuantity,
            type: MovementType.OUT,
            concept: MovementConcept.WASTE,
            notes: `Liquidación Despacho ${dispatch.id} (Merma en Ruta)`,
            status: MovementStatus.COMPLETED,
            referenceId: dispatch.id,
          }, undefined, true);
        }
      }
    }

    dispatch.status = RouteDispatchStatus.CLOSED;
    dispatch.liquidatedAt = new Date();
    return this.dispatchRepository.save(dispatch);
  }

  async findAll(): Promise<RouteDispatch[]> {
    return this.dispatchRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['branch', 'responsible'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<RouteDispatch> {
    const dispatch = await this.dispatchRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['branch', 'responsible', 'items', 'items.product', 'items.product.unit'],
    });

    if (!dispatch) throw new NotFoundException(`Despacho con ID ${id} no encontrado`);

    // Si el despacho no ha sido liquidado, calcular sugerencia de ventas POS en tiempo real
    if (dispatch.status !== RouteDispatchStatus.CLOSED) {
      for (const item of dispatch.items as any[]) {
        const sales = await this.dataSource.getRepository(SaleDetail).createQueryBuilder('sd')
          .innerJoin('sd.sale', 's')
          .where('s.branch_id = :branchId', { branchId: dispatch.branch.id })
          .andWhere('CAST(s.date AS DATE) = :date', { date: dispatch.date })
          .andWhere('sd.product_id = :productId', { productId: item.product.id })
          .andWhere('s.status != :status', { status: 'cancelled' })
          .select('SUM(sd.quantity)', 'total')
          .getRawOne();

        // En lugar de guardar en DB de una vez, lo enviamos como sugerencia
        item.suggestedSoldQuantity = parseFloat(sales?.total || '0');
      }
    }

    return dispatch;
  }
}
