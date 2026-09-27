import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { Branch, Inventory, InventoryTransfer, InventoryTransferItem } from '../entities';
import { BranchSettlement, BranchSettlementStatus } from '../entities/branch-settlement.entity';
import { BranchSettlementItem } from '../entities/branch-settlement-item.entity';
import {
  BranchSettlementIncident,
  BranchSettlementIncidentStatus,
} from '../entities/branch-settlement-incident.entity';
import { CashRegister } from 'src/finances/entities/cash-register.entity';
import { InventoryMovementService } from './inventory-movement.service';
import { InventoryTransferService } from './inventory-transfer.service';
import { FilesService } from './files.service';
import { MovementConcept, MovementStatus, MovementType } from '../entities/inventory-movement.entity';
import { TransferStatus } from '../entities/inventory-transfer.entity';
import { isAdminUser } from 'src/common/utils/user-scope.util';
import {
  BranchSettlementResponseDto,
  CreateBranchSettlementIncidentDto,
  ReceiveBranchSettlementDto,
  ResolveBranchSettlementIncidentDto,
  SubmitTodaySettlementDto,
  UpdateBranchSettlementDto,
  UpdateBranchSettlementIncidentDto,
} from '../dto/branch-settlement.dto';

@Injectable()
export class BranchSettlementService implements OnModuleInit {
  constructor(
    @InjectRepository(BranchSettlement)
    private readonly settlementRepo: Repository<BranchSettlement>,
    @InjectRepository(BranchSettlementItem)
    private readonly itemRepo: Repository<BranchSettlementItem>,
    @InjectRepository(BranchSettlementIncident)
    private readonly incidentRepo: Repository<BranchSettlementIncident>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(CashRegister)
    private readonly cashRepo: Repository<CashRegister>,
    @InjectRepository(InventoryTransfer)
    private readonly transferRepo: Repository<InventoryTransfer>,
    @InjectRepository(InventoryTransferItem)
    private readonly transferItemRepo: Repository<InventoryTransferItem>,
    private readonly movementService: InventoryMovementService,
    private readonly transferService: InventoryTransferService,
    private readonly filesService: FilesService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.purgeAllDrafts();
    } catch {
      // La tabla puede no existir todavía en el primer arranque.
    }
  }

  async getOrCreateToday(user: any, branchId?: string, businessDate?: string): Promise<BranchSettlementResponseDto> {
    await this.purgeAllDrafts();
    const branch = await this.resolveBranch(user, branchId);
    const date = businessDate || this.todayDate();
    const existing = await this.findByBranchDate(branch.id, date);
    if (existing) return this.toDto(existing);
    return this.toDto(await this.buildSession(branch, date, user));
  }

  async submitToday(
    dto: SubmitTodaySettlementDto,
    user: any,
    incidentFiles: Express.Multer.File[][] = [],
  ): Promise<BranchSettlementResponseDto> {
    await this.purgeAllDrafts();
    const branch = await this.resolveBranch(user, dto.branchId);
    const date = this.todayDate();
    const existing = await this.findByBranchDate(branch.id, date);
    if (existing) {
      throw new BadRequestException('Esta sucursal ya tiene una liquidación enviada para hoy');
    }

    const settlement = await this.buildSession(branch, date, user);
    settlement.notes = dto.notes ?? null;
    const byProduct = new Map(settlement.items.map((item) => [item.product.id, item]));
    for (const line of dto.items || []) {
      const item = byProduct.get(line.productId);
      if (!item) throw new BadRequestException(`El producto ${line.productId} no está en esta liquidación`);
      this.allocateKeep(item, Number(line.keepQty));
    }

    const incidentsDto = dto.incidents || [];
    settlement.incidents = [];
    for (let i = 0; i < incidentsDto.length; i++) {
      const inc = incidentsDto[i];
      const item = byProduct.get(inc.productId);
      if (!item) throw new BadRequestException(`El producto ${inc.productId} no está en esta liquidación`);
      const files = incidentFiles[i] || [];
      const attachmentUrls: string[] = [];
      for (const file of files) {
        attachmentUrls.push(await this.filesService.saveSettlementIncidentImage(file));
      }
      settlement.incidents.push(
        this.incidentRepo.create({
          product: item.product,
          quantity: Number(inc.quantity),
          description: inc.description,
          status: BranchSettlementIncidentStatus.OPEN,
          attachmentUrls,
        }),
      );
    }

    for (const item of settlement.items) {
      item.wasteQty = (settlement.incidents || [])
        .filter((inc) => inc.product?.id === item.product.id)
        .reduce((sum, inc) => sum + Number(inc.quantity || 0), 0);
      this.allocateKeep(item, Number(item.keepQty));
    }

    const saved = await this.settlementRepo.save(settlement);
    return this.submit(saved.id, user);
  }

  async purgeAllDrafts(): Promise<void> {
    const drafts = await this.settlementRepo.find({
      where: { status: BranchSettlementStatus.DRAFT },
      relations: ['items', 'incidents'],
    });
    if (!drafts.length) return;
    for (const draft of drafts) {
      if (draft.incidents?.length) await this.incidentRepo.remove(draft.incidents);
      if (draft.items?.length) await this.itemRepo.remove(draft.items);
      await this.settlementRepo.remove(draft);
    }
  }

  async findAll(user: any, branchId?: string, status?: BranchSettlementStatus): Promise<BranchSettlementResponseDto[]> {
    await this.purgeAllDrafts();
    const qb = this.settlementRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.branch', 'branch')
      .leftJoinAndSelect('s.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.unit', 'unit')
      .leftJoinAndSelect('s.submittedBy', 'submittedBy')
      .leftJoinAndSelect('s.transfer', 'transfer')
      .where('s.deletedAt IS NULL')
      .andWhere('s.status != :draft', { draft: BranchSettlementStatus.DRAFT })
      .orderBy('s.businessDate', 'DESC')
      .addOrderBy('s.createdAt', 'DESC');

    if (!isAdminUser(user) && !user?.branch?.isPlant) {
      const own = user?.branch?.id;
      if (!own) throw new ForbiddenException('Usuario sin sucursal asignada');
      qb.andWhere('branch.id = :own', { own });
    } else if (branchId) {
      qb.andWhere('branch.id = :branchId', { branchId });
    }

    if (status) qb.andWhere('s.status = :status', { status });

    const rows = await qb.getMany();
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  async findOne(id: string, user: any): Promise<BranchSettlementResponseDto> {
    const settlement = await this.loadOne(id);
    this.assertCanView(user, settlement.branch.id);
    return this.toDto(settlement);
  }

  async updateDraft(id: string, dto: UpdateBranchSettlementDto, user: any): Promise<BranchSettlementResponseDto> {
    const settlement = await this.loadOne(id);
    this.assertCanEdit(user, settlement);
    if (settlement.status !== BranchSettlementStatus.DRAFT) {
      throw new BadRequestException('Solo se puede editar un borrador');
    }
    if (dto.notes !== undefined) settlement.notes = dto.notes;
    if (dto.items) {
      const byProduct = new Map(settlement.items.map((item) => [item.product.id, item]));
      for (const line of dto.items) {
        const existing = byProduct.get(line.productId);
        if (!existing) {
          throw new BadRequestException(`El producto ${line.productId} no está en esta liquidación`);
        }
        this.allocateKeep(existing, Number(line.keepQty));
        existing.notes = line.notes ?? existing.notes;
      }
      this.validateLines(settlement.items);
      await this.itemRepo.save(settlement.items);
    }
    await this.settlementRepo.save(settlement);
    return this.toDto(await this.loadOne(id));
  }

  async submit(id: string, user: any): Promise<BranchSettlementResponseDto> {
    const settlement = await this.loadOne(id);
    this.assertCanEdit(user, settlement);
    if (settlement.status !== BranchSettlementStatus.DRAFT) {
      throw new BadRequestException('Esta liquidación ya fue enviada');
    }
    this.validateLines(settlement.items);
    for (const item of settlement.items) {
      if (Number(item.wasteQty) <= 0.0005) continue;
      const declared = (settlement.incidents || [])
        .filter((inc) => inc.product?.id === item.product.id)
        .reduce((sum, inc) => sum + Number(inc.quantity), 0);
      if (Math.abs(declared - Number(item.wasteQty)) > 0.001) {
        throw new BadRequestException(
          `La merma de ${item.product.name} debe coincidir con incidencias reportadas`,
        );
      }
    }

    const branchId = settlement.branch.id;
    const ref = settlement.settlementNumber;

    for (const item of settlement.items) {
      const wasteQty = Number(item.wasteQty);
      if (wasteQty > 0.0005) {
        await this.movementService.create(
          {
            productId: item.product.id,
            branchId,
            quantity: wasteQty,
            type: MovementType.OUT,
            concept: MovementConcept.WASTE,
            status: MovementStatus.COMPLETED,
            referenceId: settlement.id,
            referenceNumber: ref,
            notes: `Liquidación ${ref}: merma declarada`,
          },
          user.id,
          true,
        );
      }
    }

    const returnLines = settlement.items.filter((item) => Number(item.returnQty) > 0.0005);
    if (returnLines.length) {
      const plant = await this.findPlantBranch(branchId);
      const transfer = await this.transferService.create(
        {
          originBranchId: branchId,
          destinationBranchId: plant.id,
          notes: `Retorno de liquidación ${ref}`,
          items: returnLines.map((item) => ({
            productId: item.product.id,
            quantity: Number(item.returnQty),
          })),
        },
        user.id,
      );
      settlement.transfer = { id: transfer.id } as InventoryTransfer;
    }

    settlement.status = BranchSettlementStatus.SUBMITTED;
    settlement.submittedAt = new Date();
    settlement.submittedBy = { id: user.id } as any;
    await this.settlementRepo.save(settlement);
    return this.toDto(await this.loadOne(id));
  }

  async createIncident(
    id: string,
    dto: CreateBranchSettlementIncidentDto,
    user: any,
    files?: Express.Multer.File[],
  ): Promise<BranchSettlementResponseDto> {
    const settlement = await this.loadOne(id);
    this.assertCanEdit(user, settlement);
    if (settlement.status !== BranchSettlementStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden reportar incidencias en un borrador');
    }
    const item = settlement.items.find((row) => row.product.id === dto.productId);
    if (!item) throw new BadRequestException('El producto no está en esta liquidación');

    const qty = Math.max(0, Number(dto.quantity) || 0);
    const remaining = Number(item.systemQty) - Number(item.wasteQty);
    if (qty > remaining + 0.0005) {
      throw new BadRequestException('La merma no puede superar el stock del sistema');
    }

    const attachments = (files || []).filter(Boolean);
    if (attachments.length > 5) throw new BadRequestException('Puede adjuntar hasta 5 imágenes');
    const attachmentUrls: string[] = [];
    try {
      for (const file of attachments) {
        attachmentUrls.push(await this.filesService.saveSettlementIncidentImage(file));
      }
    } catch (error) {
      await Promise.all(attachmentUrls.map((url) => this.filesService.deleteImage(url)));
      throw error;
    }

    item.wasteQty = Number(item.wasteQty) + qty;
    this.allocateKeep(item, Number(item.keepQty));
    await this.itemRepo.save(item);

    await this.incidentRepo.save(
      this.incidentRepo.create({
        settlement: { id: settlement.id } as BranchSettlement,
        settlementItem: { id: item.id } as BranchSettlementItem,
        product: { id: item.product.id } as any,
        quantity: qty,
        description: dto.description,
        status: BranchSettlementIncidentStatus.OPEN,
        attachmentUrls,
      }),
    );
    return this.toDto(await this.loadOne(id));
  }

  async updateIncident(
    id: string,
    incidentId: string,
    dto: UpdateBranchSettlementIncidentDto,
    user: any,
    files?: Express.Multer.File[],
  ): Promise<BranchSettlementResponseDto> {
    const settlement = await this.loadOne(id);
    this.assertCanEdit(user, settlement);
    if (settlement.status !== BranchSettlementStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden editar incidencias en un borrador');
    }
    const incident = await this.incidentRepo.findOne({
      where: { id: incidentId, settlement: { id }, deletedAt: IsNull() },
      relations: ['product'],
    });
    if (!incident) throw new NotFoundException('Incidencia no encontrada');

    const nextProductId = dto.productId || incident.product?.id;
    if (!nextProductId) throw new BadRequestException('La incidencia no tiene producto');
    const item = settlement.items.find((row) => row.product.id === nextProductId);
    if (!item) throw new BadRequestException('El producto no está en esta liquidación');

    const nextQty = dto.quantity != null ? Math.max(0, Number(dto.quantity) || 0) : Number(incident.quantity);
    const othersWaste = this.wasteForProduct(settlement, nextProductId, incidentId);
    if (othersWaste + nextQty > Number(item.systemQty) + 0.0005) {
      throw new BadRequestException('La merma no puede superar el stock del sistema');
    }

    const attachments = (files || []).filter(Boolean);
    if ((incident.attachmentUrls?.length || 0) + attachments.length > 5) {
      throw new BadRequestException('Puede adjuntar hasta 5 imágenes');
    }
    const extraUrls: string[] = [];
    try {
      for (const file of attachments) {
        extraUrls.push(await this.filesService.saveSettlementIncidentImage(file));
      }
    } catch (error) {
      await Promise.all(extraUrls.map((url) => this.filesService.deleteImage(url)));
      throw error;
    }

    const previousProductId = incident.product?.id;
    incident.product = { id: nextProductId } as any;
    incident.settlementItem = { id: item.id } as BranchSettlementItem;
    incident.quantity = nextQty;
    if (dto.description != null) incident.description = dto.description;
    if (extraUrls.length) incident.attachmentUrls = [...(incident.attachmentUrls || []), ...extraUrls];
    await this.incidentRepo.save(incident);

    await this.refreshProductWaste(id, nextProductId);
    if (previousProductId && previousProductId !== nextProductId) {
      await this.refreshProductWaste(id, previousProductId);
    }
    return this.toDto(await this.loadOne(id));
  }

  async deleteIncident(id: string, incidentId: string, user: any): Promise<BranchSettlementResponseDto> {
    const settlement = await this.loadOne(id);
    this.assertCanEdit(user, settlement);
    if (settlement.status !== BranchSettlementStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden eliminar incidencias en un borrador');
    }
    const incident = await this.incidentRepo.findOne({
      where: { id: incidentId, settlement: { id }, deletedAt: IsNull() },
      relations: ['product'],
    });
    if (!incident) throw new NotFoundException('Incidencia no encontrada');
    const productId = incident.product?.id;
    await this.incidentRepo.softRemove(incident);
    if (productId) await this.refreshProductWaste(id, productId);
    return this.toDto(await this.loadOne(id));
  }

  async resolveIncident(
    id: string,
    incidentId: string,
    dto: ResolveBranchSettlementIncidentDto,
    user: any,
  ): Promise<BranchSettlementResponseDto> {
    if (!isAdminUser(user) && !user?.branch?.isPlant) {
      throw new ForbiddenException('Solo planta puede resolver incidencias de liquidación');
    }
    const settlement = await this.loadOne(id);
    const incident = await this.incidentRepo.findOne({
      where: { id: incidentId, settlement: { id }, deletedAt: IsNull() },
    });
    if (!incident) throw new NotFoundException('Incidencia no encontrada');
    incident.status = BranchSettlementIncidentStatus.RESOLVED;
    incident.resolutionNotes = dto.resolutionNotes;
    incident.resolvedAt = new Date();
    incident.resolvedBy = user?.id ? ({ id: user.id } as any) : null;
    await this.incidentRepo.save(incident);
    return this.toDto(await this.loadOne(id));
  }

  async receive(id: string, dto: ReceiveBranchSettlementDto, user: any): Promise<BranchSettlementResponseDto> {
    if (!isAdminUser(user) && !user?.branch?.isPlant) {
      throw new ForbiddenException('Solo planta puede recibir el retorno de liquidación');
    }
    const settlement = await this.loadOne(id);
    if (settlement.status !== BranchSettlementStatus.SUBMITTED && settlement.status !== BranchSettlementStatus.DISCREPANCY) {
      throw new BadRequestException('La liquidación no está pendiente de recepción');
    }
    if (!settlement.transfer) {
      settlement.status = BranchSettlementStatus.RECEIVED;
      await this.settlementRepo.save(settlement);
      return this.toDto(await this.loadOne(id));
    }

    const transfer = await this.transferRepo.findOne({
      where: { id: settlement.transfer.id, deletedAt: IsNull() },
      relations: ['originBranch', 'destinationBranch', 'items', 'items.product'],
    });
    if (!transfer) throw new NotFoundException('Traslado de retorno no encontrado');
    if (transfer.status === TransferStatus.PENDING) {
      throw new BadRequestException(
        'El retorno está pendiente de viaje. Recíbalo en planta cuando el piloto entregue el traslado.',
      );
    }
    if (transfer.status === TransferStatus.RECEIVED) {
      settlement.status = BranchSettlementStatus.RECEIVED;
      await this.settlementRepo.save(settlement);
      return this.toDto(await this.loadOne(id));
    }

    let hasShortage = false;
    for (const tItem of transfer.items) {
      const match = dto.items.find((line) => line.productId === tItem.product.id);
      const shipped = Number(tItem.quantity);
      const received = match != null ? Number(match.receivedQuantity) : shipped;
      if (received > shipped + 0.0005) {
        throw new BadRequestException(`No se puede recibir más de lo enviado para ${tItem.product.name}`);
      }
      tItem.receivedQuantity = received;
      const settlementItem = settlement.items.find((item) => item.product.id === tItem.product.id);
      if (settlementItem) settlementItem.receivedQty = received;

      if (received > 0.0005) {
        await this.movementService.create(
          {
            productId: tItem.product.id,
            branchId: transfer.destinationBranch.id,
            quantity: received,
            type: MovementType.TRANSFER_IN,
            concept: MovementConcept.TRANSFER,
            status: MovementStatus.COMPLETED,
            sourceBranchId: transfer.originBranch.id,
            targetBranchId: transfer.destinationBranch.id,
            referenceId: transfer.id,
            referenceNumber: transfer.transferNumber,
            notes: `Recepción liquidación ${settlement.settlementNumber}`,
          },
          user.id,
          true,
        );
      }

      const shortage = shipped - received;
      if (shortage > 0.0005) hasShortage = true;
    }

    await this.itemRepo.save(settlement.items);
    await this.transferItemRepo.save(transfer.items);
    transfer.status = TransferStatus.RECEIVED;
    await this.transferRepo.save(transfer);

    settlement.status =
      hasShortage && !dto.registerAsWaste
        ? BranchSettlementStatus.DISCREPANCY
        : BranchSettlementStatus.RECEIVED;
    if (dto.notes) settlement.notes = [settlement.notes, dto.notes].filter(Boolean).join('\n');
    await this.settlementRepo.save(settlement);
    return this.toDto(await this.loadOne(id));
  }

  private async buildSession(branch: Branch, businessDate: string, user: any): Promise<BranchSettlement> {
    const inventories = await this.inventoryRepo.find({
      where: { branch: { id: branch.id }, deletedAt: IsNull() },
      relations: ['product', 'product.unit'],
    });
    const rows = inventories.filter(
      (inv) => inv.product && !inv.product.deletedAt && inv.product.manageStock && !inv.product.isMaster,
    );
    const sessions = await this.cashSessionsForDay(branch.id, businessDate);
    return this.settlementRepo.create({
      settlementNumber: await this.nextNumber(),
      branch,
      businessDate,
      status: BranchSettlementStatus.DRAFT,
      createdBy: user?.id ? ({ id: user.id } as any) : null,
      cashRegisterIds: sessions.map((s) => s.id),
      items: rows.map((inv) =>
        this.itemRepo.create({
          product: inv.product,
          systemQty: Number(inv.stock),
          countedQty: Number(inv.stock),
          keepQty: Number(inv.stock),
          returnQty: 0,
          wasteQty: 0,
        }),
      ),
      incidents: [],
    });
  }

  private wasteForProduct(
    settlement: BranchSettlement,
    productId: string,
    excludeIncidentId?: string,
  ): number {
    return (settlement.incidents || [])
      .filter((inc) => inc.product?.id === productId && inc.id !== excludeIncidentId)
      .reduce((sum, inc) => sum + Number(inc.quantity || 0), 0);
  }

  private async refreshProductWaste(settlementId: string, productId: string): Promise<void> {
    const settlement = await this.loadOne(settlementId);
    const item = settlement.items.find((row) => row.product.id === productId);
    if (!item) return;
    item.wasteQty = this.wasteForProduct(settlement, productId);
    this.allocateKeep(item, Number(item.keepQty));
    await this.itemRepo.save(item);
  }

  private allocateKeep(item: BranchSettlementItem, keepInput: number): void {
    const system = Number(item.systemQty);
    const waste = Math.max(0, Number(item.wasteQty) || 0);
    const maxKeep = Math.max(0, system - waste);
    const keep = Math.min(maxKeep, Math.max(0, Number(keepInput) || 0));
    item.countedQty = system;
    item.keepQty = Math.round(keep * 1000) / 1000;
    item.wasteQty = Math.round(waste * 1000) / 1000;
    item.returnQty = Math.round((system - item.keepQty - item.wasteQty) * 1000) / 1000;
  }

  private validateLines(items: BranchSettlementItem[]): void {
    for (const item of items) {
      const system = Number(item.systemQty);
      const keep = Number(item.keepQty);
      const ret = Number(item.returnQty);
      const waste = Number(item.wasteQty);
      if (Math.abs(keep + ret + waste - system) > 0.001) {
        throw new BadRequestException(
          `En ${item.product?.name || 'un producto'}, se queda + planta + merma debe igualar el stock del sistema`,
        );
      }
    }
  }

  private async findPlantBranch(excludeId: string): Promise<Branch> {
    const plant =
      (await this.branchRepo.findOne({ where: { isPlant: true, deletedAt: IsNull() } })) ||
      (await this.branchRepo.findOne({ where: { isCentral: true, deletedAt: IsNull() } }));
    if (!plant || plant.id === excludeId) {
      throw new BadRequestException('No hay una planta distinta configurada para devolver producto');
    }
    return plant;
  }

  private async nextNumber(): Promise<string> {
    const last = await this.settlementRepo.findOne({
      where: {},
      order: { settlementNumber: 'DESC' },
      withDeleted: true,
    });
    let next = 1;
    if (last?.settlementNumber) {
      const n = parseInt(last.settlementNumber.replace(/\D/g, ''), 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `LIQ-${String(next).padStart(6, '0')}`;
  }

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private dayRange(dateStr: string): { start: Date; end: Date } {
    const start = new Date(`${dateStr}T00:00:00.000`);
    const end = new Date(`${dateStr}T23:59:59.999`);
    return { start, end };
  }

  private async cashSessionsForDay(branchId: string, dateStr: string): Promise<CashRegister[]> {
    const { start, end } = this.dayRange(dateStr);
    return this.cashRepo.find({
      where: { branch: { id: branchId }, openedAt: Between(start, end) },
      relations: ['user'],
      order: { openedAt: 'ASC' },
    });
  }

  private async findByBranchDate(branchId: string, date: string): Promise<BranchSettlement | null> {
    return this.settlementRepo.findOne({
      where: { branch: { id: branchId }, businessDate: date, deletedAt: IsNull() },
      relations: [
        'branch',
        'items',
        'items.product',
        'items.product.unit',
        'submittedBy',
        'transfer',
        'incidents',
        'incidents.product',
        'incidents.resolvedBy',
      ],
    });
  }

  private async loadOne(id: string): Promise<BranchSettlement> {
    const settlement = await this.settlementRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'branch',
        'items',
        'items.product',
        'items.product.unit',
        'submittedBy',
        'createdBy',
        'transfer',
        'incidents',
        'incidents.product',
        'incidents.resolvedBy',
      ],
    });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada');
    return settlement;
  }

  private async resolveBranch(user: any, branchId?: string): Promise<Branch> {
    const canPickBranch = isAdminUser(user) || !!user?.branch?.isPlant;
    const id = canPickBranch ? branchId || user?.branch?.id : user?.branch?.id;
    if (!id) {
      throw new ForbiddenException(
        canPickBranch
          ? 'Seleccione una sucursal para liquidar'
          : 'Usuario sin sucursal asignada',
      );
    }
    const branch = await this.branchRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    if (!canPickBranch && user?.branch?.id !== branch.id) {
      throw new ForbiddenException('No puede liquidar otra sucursal');
    }
    return branch;
  }

  private assertCanView(user: any, branchId: string): void {
    if (isAdminUser(user) || user?.branch?.isPlant) return;
    if (user?.branch?.id !== branchId) throw new ForbiddenException('Sin acceso a esta liquidación');
  }

  private assertCanEdit(user: any, settlement: BranchSettlement): void {
    this.assertCanView(user, settlement.branch.id);
  }

  private async toDto(settlement: BranchSettlement): Promise<BranchSettlementResponseDto> {
    const sessions = await this.cashSessionsForDay(settlement.branch.id, settlement.businessDate);
    return {
      id: settlement.id || '',
      settlementNumber: settlement.settlementNumber || 'Pendiente',
      branchId: settlement.branch.id,
      branchName: settlement.branch.name,
      businessDate: String(settlement.businessDate).slice(0, 10),
      status: settlement.status,
      notes: settlement.notes,
      transferId: settlement.transfer?.id ?? null,
      transferNumber: settlement.transfer?.transferNumber ?? null,
      transferStatus: settlement.transfer?.status ?? null,
      submittedAt: settlement.submittedAt ?? null,
      submittedByName: settlement.submittedBy?.name ?? null,
      createdAt: settlement.createdAt || new Date(),
      items: (settlement.items || []).map((item) => ({
        id: item.id || item.product.id,
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        unitAbbreviation: item.product.unit?.abbreviation ?? null,
        allowsDecimals: item.product.unit?.allowsDecimals ?? false,
        imageUrl: item.product.imageUrl,
        systemQty: Number(item.systemQty),
        countedQty: Number(item.countedQty),
        keepQty: Number(item.keepQty),
        returnQty: Number(item.returnQty),
        wasteQty: Number(item.wasteQty),
        receivedQty: item.receivedQty != null ? Number(item.receivedQty) : null,
        notes: item.notes,
      })),
      incidents: (settlement.incidents || []).map((incident) => ({
        id: incident.id,
        productId: incident.product?.id ?? null,
        productName: incident.product?.name ?? null,
        quantity: Number(incident.quantity),
        description: incident.description,
        status: incident.status,
        attachmentUrls: incident.attachmentUrls ?? [],
        resolutionNotes: incident.resolutionNotes ?? null,
        resolvedAt: incident.resolvedAt ?? null,
        resolvedByName: incident.resolvedBy?.name ?? null,
      })),
      cashSessions: sessions.map((s) => ({
        id: s.id,
        userName: s.user?.name || '',
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingBalance: Number(s.openingBalance),
        expectedBalance: Number(s.expectedBalance),
        closingBalance: s.closingBalance != null ? Number(s.closingBalance) : null,
        difference: s.difference != null ? Number(s.difference) : null,
        status: s.status,
      })),
    };
  }
}
