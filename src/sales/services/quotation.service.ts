import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Like, Repository } from 'typeorm';
import {
  Quotation,
  QuotationItem,
  QuotationStatus,
  Sale,
  SaleStatus,
  SaleDetail,
  Customer,
  DiscountType,
  QuotationDiscount,
  QuotationAdjustmentType,
  QuotationValueType,
  SaleDiscount,
} from '../entities';
import { CreateQuotationDto, QuotationResponseDto, UpdateQuotationStatusDto } from '../dto';
import { Branch, Product } from 'src/logistics/entities';
import { PreparationStatus } from '../entities/sale-detail.entity';
import { PdfService } from 'src/common/pdf/pdf.service';
import { MailService } from 'src/common/mail/mail.service';

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
    private readonly pdfService: PdfService,
    private readonly mailService: MailService,
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

      const quotation = this.quotationRepository.create({
        correlative,
        validUntil,
        status: QuotationStatus.PENDING,
        notes: dto.notes,
        customer: dto.customerId ? ({ id: dto.customerId } as any) : null,
        guestCustomer: dto.guestCustomer,
        branch,
        createdBy: { id: userId } as any,
        applyTax: dto.applyTax ?? true,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
      });

      const savedQuotation = await queryRunner.manager.save(quotation);

      let subtotal = 0;
      let taxAmount = 0;
      let lineDiscounts = 0;

      for (const itemDto of dto.items) {
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId, deletedAt: IsNull() },
        });
        if (!product) throw new NotFoundException(`Producto ${itemDto.productId} no encontrado`);

        const lineSubtotal = Number(itemDto.quantity) * Number(itemDto.unitPrice);

        let lineDiscount = 0;
        let discountPct = itemDto.discount || 0;

        if (itemDto.discountType === DiscountType.FIXED_AMOUNT) {
          lineDiscount = itemDto.discountAmount || 0;
          discountPct = lineSubtotal > 0 ? (lineDiscount / lineSubtotal) * 100 : 0;
        } else {
          lineDiscount = (lineSubtotal * discountPct) / 100;
        }

        const lineAfterDiscount = lineSubtotal - lineDiscount;
        const lineTax = quotation.applyTax ? (lineAfterDiscount * (itemDto.taxPercentage ?? 12)) / 100 : 0;
        const lineTotal = lineAfterDiscount + lineTax;

        const item = queryRunner.manager.create(QuotationItem, {
          quotation: savedQuotation,
          product,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          discount: discountPct,
          discountAmount: lineDiscount,
          discountType: itemDto.discountType || DiscountType.PERCENTAGE,
          taxPercentage: quotation.applyTax ? (itemDto.taxPercentage ?? 12) : 0,
          taxAmount: lineTax,
          lineTotal,
          subtotal: lineSubtotal,
          originalPrice: itemDto.originalPrice || product.price,
          notes: itemDto.notes,
        });

        await queryRunner.manager.save(item);

        subtotal += lineSubtotal;
        lineDiscounts += lineDiscount;
        taxAmount += lineTax;
      }

      let globalAdjustmentsAmount = 0;
      if (dto.adjustments?.length) {
        for (const adjDto of dto.adjustments) {
          let amount = 0;
          if (adjDto.valueType === QuotationValueType.PERCENTAGE) {
            amount = subtotal * (adjDto.value / 100);
          } else {
            amount = adjDto.value;
          }

          if (adjDto.adjustmentType === QuotationAdjustmentType.DISCOUNT) {
            globalAdjustmentsAmount += amount;
          } else {
            globalAdjustmentsAmount -= amount; // Increases decrease the "discount total" or increase final total
          }

          const adjustment = queryRunner.manager.create(QuotationDiscount, {
            quotation: savedQuotation,
            adjustmentType: adjDto.adjustmentType,
            valueType: adjDto.valueType,
            value: adjDto.value,
            amountApplied: amount,
            reason: adjDto.reason || null,
          });

          await queryRunner.manager.save(adjustment);
        }
      }

      // Proportional tax adjustment like in SaleService
      const totalDiscounts = lineDiscounts + globalAdjustmentsAmount;
      const taxableBase = subtotal - lineDiscounts;
      const finalTaxAmount = taxableBase > 0 ? taxAmount * ((taxableBase - globalAdjustmentsAmount) / taxableBase) : 0;
      const total = taxableBase - globalAdjustmentsAmount + finalTaxAmount;

      await queryRunner.manager.update(Quotation, savedQuotation.id, {
        subtotal,
        taxAmount: finalTaxAmount,
        discountAmount: totalDiscounts,
        total,
      });

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
    const query = this.quotationRepository
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.customer', 'customer')
      .leftJoinAndSelect('q.branch', 'branch')
      .leftJoinAndSelect('q.createdBy', 'createdBy')
      .leftJoinAndSelect('q.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('q.discounts', 'discounts')
      .leftJoinAndSelect('q.sale', 'sale')
      .where('q.deletedAt IS NULL');

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
      relations: ['customer', 'branch', 'createdBy', 'items', 'items.product', 'discounts', 'sale'],
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
      relations: ['customer', 'branch', 'items', 'items.product', 'discounts'],
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
        discountAmount: quotation.discountAmount,
        total: quotation.total,
        paidAmount: 0,
        pendingAmount: quotation.total,
        applyTax: quotation.applyTax,
        notes: `Convertido desde cotización ${quotation.correlative}. ${quotation.notes || ''}`,
        date: new Date(),
      });

      const savedSale = await queryRunner.manager.save(sale);

      // Map Items
      for (const qItem of quotation.items) {
        const saleDetail = queryRunner.manager.create(SaleDetail, {
          sale: savedSale,
          product: qItem.product,
          quantity: qItem.quantity,
          unitPrice: qItem.unitPrice,
          discount: qItem.discount,
          discountAmount: qItem.discountAmount,
          discountType: qItem.discountType,
          taxPercentage: qItem.taxPercentage,
          taxAmount: qItem.taxAmount,
          lineTotal: qItem.lineTotal,
          originalPrice: qItem.originalPrice,
          notes: qItem.notes,
          preparationStatus: PreparationStatus.PENDING,
          currentArea: qItem.product.area ? (qItem.product.area as any) : null,
        });
        await queryRunner.manager.save(saleDetail);
      }

      // Map Adjustments (Discounts/Increases)
      // Note: SaleDiscount only supports 'percent' | 'amount'. 
      // Current system might not support 'increase' in Sales yet, but we'll map them as discounts if they were discounts.
      if (quotation.discounts?.length) {
        for (const qDisc of quotation.discounts) {
          // If it's an increase, we'll map it with a sign or just as an amount if SaleDiscount grows to support it.
          // For now, mirroring existing fields.
          const saleDiscount = queryRunner.manager.create(SaleDiscount, {
            sale: savedSale,
            type: qDisc.valueType === QuotationValueType.PERCENTAGE ? 'percent' : 'amount',
            value: qDisc.value,
            amountApplied: qDisc.adjustmentType === QuotationAdjustmentType.DISCOUNT ? qDisc.amountApplied : -qDisc.amountApplied,
            reason: qDisc.reason,
          });
          await queryRunner.manager.save(saleDiscount);
        }
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
    dto.applyTax = q.applyTax;
    dto.subtotal = Number(q.subtotal);
    dto.taxAmount = Number(q.taxAmount);
    dto.discountAmount = Number(q.discountAmount);
    dto.total = Number(q.total);
    dto.customerId = q.customer?.id || null;
    dto.customerName = q.customer ? q.customer.name : q.guestCustomer?.name || 'Consumidor Final';
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
      discount: Number(item.discount),
      discountAmount: Number(item.discountAmount),
      discountType: item.discountType,
      taxPercentage: Number(item.taxPercentage),
      taxAmount: Number(item.taxAmount),
      lineTotal: Number(item.lineTotal),
      subtotal: Number(item.subtotal),
      notes: item.notes || '',
    }));
    dto.adjustments = (q.discounts || []).map((adj) => ({
      id: adj.id,
      adjustmentType: adj.adjustmentType,
      valueType: adj.valueType,
      value: Number(adj.value),
      amountApplied: Number(adj.amountApplied),
      reason: adj.reason || '',
    }));
    return dto;
  }

  async generatePdf(id: string): Promise<Buffer> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'branch', 'items', 'items.product', 'discounts'],
    });

    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    return this.pdfService.generateQuotationPdf(quotation);
  }

  async sendQuotationEmail(id: string, email: string): Promise<void> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'items', 'items.product'],
    });

    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    const pdfBuffer = await this.generatePdf(id);

    const customerName = quotation.customer ? quotation.customer.name : quotation.guestCustomer?.name || 'Cliente';

    await this.mailService.sendMail(
      email || quotation.customer?.email || quotation.guestCustomer?.email || '',
      `Cotización ${quotation.correlative} - Sistema POS`,
      `Estimado(a) ${customerName},\n\nAdjunto encontrará la cotización solicitada.\n\nSaludos,\nEquipo de Ventas`,
      [
        {
          filename: `cotizacion-${quotation.correlative}.pdf`,
          content: pdfBuffer,
        },
      ],
    );
  }

  async generateCorrelative(): Promise<string> {
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
