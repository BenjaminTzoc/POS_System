import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Like, Repository } from 'typeorm';
import { Quotation, QuotationItem, QuotationStatus, Sale, SaleStatus, SaleDetail, Customer } from '../entities';
import { CreateQuotationDto, QuotationResponseDto, UpdateQuotationStatusDto } from '../dto';
import { Branch, Product } from 'src/logistics/entities';

@Injectable()
export class QuotationService {
  constructor(
    @InjectRepository(Quotation)
    private readonly quotationRepository: Repository<Quotation>,
    @InjectRepository(QuotationItem)
    private readonly quotationItemRepository: Repository<QuotationItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateQuotationDto, userId: string): Promise<QuotationResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const branch = await this.branchRepository.findOne({
        where: { id: dto.branchId, deletedAt: IsNull() },
      });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + (dto.validityDays || 15));

      const correlative = await this.generateCorrelative();

      let subtotal = 0;
      const items: QuotationItem[] = [];

      for (const itemDto of dto.items) {
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId, deletedAt: IsNull() },
        });
        if (!product) throw new NotFoundException(`Producto ${itemDto.productId} no encontrado`);

        const itemSubtotal = Number(itemDto.quantity) * Number(itemDto.unitPrice);
        subtotal += itemSubtotal;

        const item = this.quotationItemRepository.create({
          product,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          subtotal: itemSubtotal,
        });
        items.push(item);
      }

      const taxAmount = subtotal * 0.12;
      const total = subtotal + taxAmount;

      const quotation = this.quotationRepository.create({
        correlative,
        validUntil,
        status: QuotationStatus.PENDING,
        notes: dto.notes,
        subtotal,
        taxAmount,
        total,
        customer: dto.customerId ? ({ id: dto.customerId } as any) : null,
        guestCustomer: dto.guestCustomer,
        branch,
        createdBy: { id: userId } as any,
        items,
      });

      const savedQuotation = await queryRunner.manager.save(quotation);
      await queryRunner.commitTransaction();

      return this.findOne(savedQuotation.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filters: { status?: QuotationStatus; customerId?: string; branchId?: string; search?: string }): Promise<QuotationResponseDto[]> {
    const query = this.quotationRepository.createQueryBuilder('q').leftJoinAndSelect('q.customer', 'customer').leftJoinAndSelect('q.branch', 'branch').leftJoinAndSelect('q.createdBy', 'createdBy').leftJoinAndSelect('q.items', 'items').leftJoinAndSelect('items.product', 'product').leftJoinAndSelect('q.sale', 'sale').where('q.deletedAt IS NULL');

    if (filters.status) {
      query.andWhere('q.status = :status', { status: filters.status });
    }
    if (filters.branchId) {
      query.andWhere('branch.id = :branchId', { branchId: filters.branchId });
    }
    if (filters.customerId) {
      query.andWhere('customer.id = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.search) {
      query.andWhere("(q.correlative Like :search OR customer.name Like :search OR q.guestCustomer->>'name' Like :search)", { search: `%${filters.search}%` });
    }

    query.orderBy('q.createdAt', 'DESC');

    const quotations = await query.getMany();
    return quotations.map((q) => this.mapToDto(q));
  }

  async findOne(id: string): Promise<QuotationResponseDto> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'branch', 'createdBy', 'items', 'items.product', 'sale'],
    });

    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    return this.mapToDto(quotation);
  }

  async updateStatus(id: string, dto: UpdateQuotationStatusDto): Promise<QuotationResponseDto> {
    const quotation = await this.quotationRepository.findOne({ where: { id } });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    quotation.status = dto.status;
    await this.quotationRepository.save(quotation);
    return this.findOne(id);
  }

  async convertToSale(id: string, userId: string): Promise<{ saleId: string }> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'branch', 'items', 'items.product'],
    });

    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    if (quotation.status !== QuotationStatus.PENDING) {
      throw new BadRequestException('Solo se pueden convertir cotizaciones pendientes');
    }
    if (new Date() > quotation.validUntil) {
      quotation.status = QuotationStatus.EXPIRED;
      await this.quotationRepository.save(quotation);
      throw new BadRequestException('La cotización ha expirado');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invoiceNumber = await this.generateInvoiceNumber();

      const sale = queryRunner.manager.create(Sale, {
        invoiceNumber,
        status: SaleStatus.PENDING,
        customer: quotation.customer,
        guestCustomer: quotation.guestCustomer,
        branch: quotation.branch,
        subtotal: quotation.subtotal,
        taxAmount: quotation.taxAmount,
        discountAmount: 0,
        total: quotation.total,
        paidAmount: 0,
        pendingAmount: quotation.total,
        applyTax: true,
        notes: `Convertido desde cotización ${quotation.correlative}. ${quotation.notes || ''}`,
        date: new Date(),
      });

      const savedSale = await queryRunner.manager.save(sale);

      for (const qItem of quotation.items) {
        const lineTax = Number(qItem.subtotal) * 0.12;
        const lineTotal = Number(qItem.subtotal) + lineTax;

        const saleDetail = queryRunner.manager.create(SaleDetail, {
          sale: savedSale,
          product: qItem.product,
          quantity: qItem.quantity,
          unitPrice: qItem.unitPrice,
          discount: 0,
          discountAmount: 0,
          taxPercentage: 12,
          taxAmount: lineTax,
          lineTotal: lineTotal,
        });
        await queryRunner.manager.save(saleDetail);
      }

      quotation.status = QuotationStatus.CONVERTED;
      quotation.sale = savedSale;
      await queryRunner.manager.save(quotation);

      await queryRunner.commitTransaction();
      return { saleId: savedSale.id };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private mapToDto(q: Quotation): QuotationResponseDto {
    const dto = new QuotationResponseDto();
    dto.id = q.id;
    dto.correlative = q.correlative;
    dto.validUntil = q.validUntil;
    dto.status = q.status;
    dto.notes = q.notes || '';
    dto.subtotal = Number(q.subtotal);
    dto.taxAmount = Number(q.taxAmount);
    dto.total = Number(q.total);
    dto.customerId = q.customer?.id || null;
    dto.customerName = q.customer ? q.customer.name : q.guestCustomer?.name || 'Venta General';
    dto.guestCustomer = q.guestCustomer;
    dto.branchId = q.branch?.id || '';
    dto.branchName = q.branch?.name || '';
    dto.createdBy = q.createdBy?.name || 'Sistema';
    dto.createdAt = q.createdAt;
    dto.saleId = q.sale?.id || null;
    dto.items = (q.items || []).map((item) => ({
      id: item.id,
      productId: item.product.id,
      productName: item.product.name,
      productSku: item.product.sku,
      productImage: item.product.imageUrl || '',
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    }));
    return dto;
  }

  private async generateCorrelative(): Promise<string> {
    const last = await this.quotationRepository.findOne({
      where: {},
      order: { correlative: 'DESC' },
      withDeleted: true,
    });

    let next = 1;
    if (last && last.correlative) {
      const parts = last.correlative.split('-');
      if (parts.length === 2) {
        const lastNum = parseInt(parts[1]);
        if (!isNaN(lastNum)) {
          next = lastNum + 1;
        }
      }
    }
    return `COT-${next.toString().padStart(6, '0')}`;
  }

  private async generateInvoiceNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const lastInvoice = await this.saleRepository.findOne({
      where: {
        invoiceNumber: Like(`ORD-${currentYear}-%`),
      },
      order: { invoiceNumber: 'DESC' },
      withDeleted: true,
    });

    let sequence = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length === 3) {
        const lastSequence = parseInt(parts[2]);
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1;
        }
      }
    }

    return `ORD-${currentYear}-${sequence.toString().padStart(4, '0')}`;
  }
}
