import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
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
import { CreateQuotationDto, ConvertQuotationDto, QuotationResponseDto, UpdateQuotationStatusDto } from '../dto';
import { Branch, Product, Inventory, MovementType, MovementStatus, MovementConcept } from 'src/logistics/entities';
import { PreparationStatus } from '../entities/sale-detail.entity';
import { PdfService } from 'src/common/pdf/pdf.service';
import { MailService } from 'src/common/mail/mail.service';
import { InventoryMovementService } from 'src/logistics/services';
import { CustomerService } from './customer.service';
import { DiscountCodeService } from './discount-code.service';

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
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly customerService: CustomerService,
    private readonly discountCodeService: DiscountCodeService,
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

  async update(id: string, dto: CreateQuotationDto): Promise<QuotationResponseDto> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');

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

      // Update basic fields
      await queryRunner.manager.update(Quotation, id, {
        validUntil,
        notes: dto.notes,
        customer: dto.customerId ? ({ id: dto.customerId } as any) : null,
        guestCustomer: (dto.guestCustomer || null) as any,
        branch,
        applyTax: dto.applyTax ?? true,
      });

      // Clear existing items and adjustments
      await queryRunner.manager.delete(QuotationItem, { quotation: { id } });
      await queryRunner.manager.delete(QuotationDiscount, { quotation: { id } });

      let subtotal = 0;
      let taxAmount = 0;
      let lineDiscounts = 0;

      // Re-create items
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
        const lineTax = (dto.applyTax ?? true) ? (lineAfterDiscount * (itemDto.taxPercentage ?? 12)) / 100 : 0;
        const lineTotal = lineAfterDiscount + lineTax;

        const item = queryRunner.manager.create(QuotationItem, {
          quotation: { id } as any,
          product,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          discount: discountPct,
          discountAmount: lineDiscount,
          discountType: itemDto.discountType || DiscountType.PERCENTAGE,
          taxPercentage: (dto.applyTax ?? true) ? (itemDto.taxPercentage ?? 12) : 0,
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

      // Re-create adjustments
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
            globalAdjustmentsAmount -= amount;
          }

          const adjustment = queryRunner.manager.create(QuotationDiscount, {
            quotation: { id } as any,
            adjustmentType: adjDto.adjustmentType,
            valueType: adjDto.valueType,
            value: adjDto.value,
            amountApplied: amount,
            reason: adjDto.reason || null,
          });

          await queryRunner.manager.save(adjustment);
        }
      }

      const totalDiscounts = lineDiscounts + globalAdjustmentsAmount;
      const taxableBase = subtotal - lineDiscounts;
      const finalTaxAmount = taxableBase > 0 ? taxAmount * ((taxableBase - globalAdjustmentsAmount) / taxableBase) : 0;
      const total = taxableBase - globalAdjustmentsAmount + finalTaxAmount;

      await queryRunner.manager.update(Quotation, id, {
        subtotal,
        taxAmount: finalTaxAmount,
        discountAmount: totalDiscounts,
        total,
      });

      await queryRunner.commitTransaction();
      return this.findOne(id);
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
      .leftJoinAndSelect('customer.category', 'customerCategory')
      .leftJoinAndSelect('q.branch', 'branch')
      .leftJoinAndSelect('q.createdBy', 'createdBy')
      .leftJoinAndSelect('q.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.unit', 'unit')
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
      relations: [
        'customer',
        'customer.category',
        'branch',
        'createdBy',
        'items',
        'items.product',
        'items.product.unit',
        'discounts',
        'sale',
      ],
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

  async convertToSale(id: string, userId: string, dto?: ConvertQuotationDto): Promise<{ saleId: string }> {
    const quotation = await this.quotationRepository.findOne({
      where: { id },
      relations: ['customer', 'branch', 'items', 'items.product', 'items.product.area', 'discounts'],
    });

    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    if (quotation.status === QuotationStatus.CONVERTED) {
      throw new BadRequestException('Esta cotización ya ha sido convertida en una orden de venta');
    }
    if (quotation.status === QuotationStatus.CANCELLED) {
      throw new BadRequestException('No se puede convertir una cotización cancelada');
    }

    const isPreorder = !!dto?.isPreorder;
    if (isPreorder && !dto?.promisedDeliveryDate) {
      throw new BadRequestException('La preorden requiere fecha de entrega prometida (promisedDeliveryDate)');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invoiceNumber = await this.generateInvoiceNumber();

      // Create Sale
      const sale = queryRunner.manager.create(Sale, {
        invoiceNumber,
        status: SaleStatus.PENDING,
        isPreorder,
        promisedDeliveryDate: dto?.promisedDeliveryDate ? new Date(dto.promisedDeliveryDate) : null,
        dueDate: dto?.dueDate ? new Date(dto.dueDate) : null,
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
        deliveryAddress:
          dto?.deliveryAddress?.trim() ||
          quotation.customer?.address?.trim() ||
          quotation.guestCustomer?.address?.trim() ||
          null,
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

        if (!isPreorder && qItem.product.manageStock) {
          await queryRunner.manager.increment(
            Inventory,
            {
              product: { id: qItem.product.id },
              branch: { id: quotation.branch.id },
              deletedAt: IsNull(),
            },
            'reservedStock',
            Number(qItem.quantity),
          );
        }
      }

      // Map Global Adjustments
      if (quotation.discounts?.length) {
        for (const qDisc of quotation.discounts) {
          if (qDisc.adjustmentType === QuotationAdjustmentType.DISCOUNT) {
            const saleDiscount = queryRunner.manager.create(SaleDiscount, {
              sale: savedSale,
              type: qDisc.valueType === QuotationValueType.PERCENTAGE ? 'percent' : 'amount',
              value: qDisc.value,
              amountApplied: qDisc.amountApplied,
              reason: qDisc.reason || 'Descuento transferido desde cotización',
            });
            await queryRunner.manager.save(saleDiscount);
          }
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
    dto.customer = q.customer as any;
    dto.customerId = q.customer?.id || null;
    dto.customerName = q.customer ? q.customer.name : q.guestCustomer?.name || 'Consumidor Final';
    dto.guestCustomer = q.guestCustomer;
    dto.branch = q.branch as any;
    dto.branchId = q.branch?.id || '';
    dto.branchName = q.branch?.name || '';
    dto.createdBy = q.createdBy?.name || 'Sistema';
    dto.createdAt = q.createdAt;
    dto.saleId = q.sale?.id || null;
    dto.items = (q.items || []).map((item) => ({
      id: item.id,
      product: item.product as any,
      productId: item.product?.id,
      productName: item.product?.name,
      productSku: item.product?.sku,
      productImage: item.product?.imageUrl || '',
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

  async uploadMediaToMeta(pdfBuffer: Buffer, fileName: string): Promise<string> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      throw new BadRequestException('Las credenciales de WhatsApp no están configuradas');
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, fileName);
    formData.append('messaging_product', 'whatsapp');

    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Meta Media Upload Error (Quotation):', errText);
      throw new InternalServerErrorException(`Fallo al subir el documento a Meta: ${errText}`);
    }

    const result = (await response.json()) as { id: string };
    return result.id;
  }

  async sendQuotationWhatsApp(id: string, pdfBase64?: string): Promise<{ message: string }> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'branch', 'items', 'items.product', 'discounts'],
    });

    if (!quotation) {
      throw new NotFoundException(`Cotización con ID ${id} no encontrada`);
    }

    const phone = quotation.customer?.phone || quotation.guestCustomer?.phone;
    if (!phone) {
      throw new BadRequestException('El cliente no tiene un número de teléfono asociado');
    }

    let cleanPhone = phone.replace(/\D/g, '');
    const defaultPrefix = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '502';
    if (cleanPhone.length === 8) {
      cleanPhone = defaultPrefix + cleanPhone;
    } else if (cleanPhone.length > 0 && !cleanPhone.startsWith(defaultPrefix)) {
      cleanPhone = defaultPrefix + cleanPhone;
    }

    try {
      let pdfBuffer: Buffer;
      if (pdfBase64) {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
      } else {
        pdfBuffer = await this.pdfService.generateQuotationPdf(quotation);
      }

      const fileName = `Cotizacion_${quotation.correlative}.pdf`;
      const mediaId = await this.uploadMediaToMeta(pdfBuffer, fileName);

      const token = process.env.WHATSAPP_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const customerName = quotation.customer?.name || quotation.guestCustomer?.name || 'Cliente';

      const validUntilDate = new Date(quotation.validUntil);
      const validUntilString = `${validUntilDate.getDate().toString().padStart(2, '0')}/${(validUntilDate.getMonth() + 1).toString().padStart(2, '0')}/${validUntilDate.getFullYear()}`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
          name: 'envio_cotizacion_cliente',
          language: {
            code: 'es_MX',
          },
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    id: mediaId,
                    filename: fileName,
                  },
                },
              ],
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: customerName },
                { type: 'text', text: quotation.correlative },
                { type: 'text', text: `${Number(quotation.total).toFixed(2)}` },
                { type: 'text', text: validUntilString },
              ],
            },
          ],
        },
      };

      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Meta Send Message Error (Quotation):', errText);
        throw new InternalServerErrorException(`Fallo al enviar el mensaje de WhatsApp: ${errText}`);
      }

      return { message: 'WhatsApp enviado exitosamente' };
    } catch (error) {
      console.error('Error in sendQuotationWhatsApp:', error);
      throw error;
    }
  }

  async sendQuotationEmail(id: string, email?: string, pdfBase64?: string): Promise<{ message: string }> {
    const quotation = await this.quotationRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customer', 'branch', 'items', 'items.product', 'discounts'],
    });

    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    const targetEmail = email || quotation.customer?.email || quotation.guestCustomer?.email || '';

    if (!targetEmail) {
      return { message: 'La cotización no tiene un correo electrónico asociado' };
    }

    try {
      let pdfBuffer: Buffer;
      if (pdfBase64) {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
      } else {
        pdfBuffer = await this.pdfService.generateQuotationPdf(quotation);
      }

      const customerName = quotation.customer ? quotation.customer.name : quotation.guestCustomer?.name || 'Cliente';

      await this.mailService.sendMail(
        targetEmail,
        `Cotización ${quotation.correlative} - Sistema POS`,
        `Estimado(a) ${customerName},\n\nAdjunto encontrará la cotización solicitada correspondiente al número ${quotation.correlative}.\n\nSaludos,\nEquipo de Ventas`,
        [
          {
            filename: `Cotizacion_${quotation.correlative}.pdf`,
            content: pdfBuffer,
          },
        ],
      );

      return { message: 'Correo enviado exitosamente' };
    } catch (error) {
      console.error('Error in sendQuotationEmail:', error);
      throw new InternalServerErrorException('Ocurrió un error al procesar o enviar el correo electrónico');
    }
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
