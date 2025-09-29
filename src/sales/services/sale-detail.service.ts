import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Sale, SaleDetail, SaleStatus } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { ProductService } from 'src/logistics/services';
import { CreateSaleDetailDto, SaleDetailResponseDto, UpdateSaleDetailDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class SaleDetailService {
  constructor(
    @InjectRepository(SaleDetail)
    private readonly saleDetailRepository: Repository<SaleDetail>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    private readonly productService: ProductService,
  ) {}

  async create(detailDto: CreateSaleDetailDto, saleId: string): Promise<SaleDetailResponseDto> {
    // Validar que la venta existe y está en estado pendiente
    const sale = await this.saleRepository.findOne({
      where: { id: saleId, deletedAt: IsNull() },
    });

    if (!sale) {
      throw new NotFoundException(`Venta con ID ${saleId} no encontrada`);
    }

    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Solo se pueden agregar detalles a ventas pendientes');
    }

    // Validar que el producto existe
    let product;
    try {
      product = await this.productService.findOne(detailDto.productId);
    } catch (error) {
      throw new BadRequestException(`El producto con ID ${detailDto.productId} no existe`);
    }

    // Calcular montos del detalle
    const lineSubtotal = detailDto.quantity * detailDto.unitPrice;
    const lineDiscount = detailDto.discountAmount || (lineSubtotal * (detailDto.discount || 0) / 100);
    const lineTax = detailDto.taxAmount || (lineSubtotal * (detailDto.taxPercentage || 0) / 100);
    const lineTotal = lineSubtotal - lineDiscount + lineTax;

    const detail = this.saleDetailRepository.create({
      sale: { id: saleId },
      product: { id: detailDto.productId },
      quantity: detailDto.quantity,
      unitPrice: detailDto.unitPrice,
      discount: detailDto.discount || 0,
      discountAmount: lineDiscount,
      taxPercentage: detailDto.taxPercentage || 0,
      taxAmount: lineTax,
      lineTotal: lineTotal,
    });

    const savedDetail = await this.saleDetailRepository.save(detail);

    // Recalcular totales de la venta
    await this.recalculateSaleTotals(saleId);

    return plainToInstance(SaleDetailResponseDto, savedDetail);
  }

  async findAllBySale(saleId: string): Promise<SaleDetailResponseDto[]> {
    const details = await this.saleDetailRepository.find({
      where: { 
        sale: { id: saleId },
        deletedAt: IsNull() 
      },
      relations: ['product', 'product.category', 'product.unit'],
      order: { createdAt: 'ASC' },
    });
    return plainToInstance(SaleDetailResponseDto, details);
  }

  async findOne(id: string): Promise<SaleDetailResponseDto> {
    const detail = await this.saleDetailRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['product', 'product.category', 'product.unit', 'sale'],
    });

    if (!detail) {
      throw new NotFoundException(`Detalle de venta con ID ${id} no encontrado`);
    }

    return plainToInstance(SaleDetailResponseDto, detail);
  }

  async update(id: string, dto: UpdateSaleDetailDto): Promise<SaleDetailResponseDto> {
    const detail = await this.saleDetailRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sale'],
    });

    if (!detail) {
      throw new NotFoundException(`Detalle de venta con ID ${id} no encontrado`);
    }

    // Validar que la venta esté pendiente
    if (detail.sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Solo se pueden modificar detalles de ventas pendientes');
    }

    // Calcular nuevos montos si se actualizan campos relevantes
    const quantity = dto.quantity ?? detail.quantity;
    const unitPrice = dto.unitPrice ?? detail.unitPrice;
    const discount = dto.discount ?? detail.discount;
    const taxPercentage = dto.taxPercentage ?? detail.taxPercentage;

    const lineSubtotal = quantity * unitPrice;
    const lineDiscount = dto.discountAmount ?? (lineSubtotal * discount / 100);
    const lineTax = dto.taxAmount ?? (lineSubtotal * taxPercentage / 100);
    const lineTotal = lineSubtotal - lineDiscount + lineTax;

    Object.assign(detail, {
      quantity: dto.quantity ?? detail.quantity,
      unitPrice: dto.unitPrice ?? detail.unitPrice,
      discount: dto.discount ?? detail.discount,
      discountAmount: dto.discountAmount ?? lineDiscount,
      taxPercentage: dto.taxPercentage ?? detail.taxPercentage,
      taxAmount: dto.taxAmount ?? lineTax,
      lineTotal: dto.lineTotal ?? lineTotal,
    });

    const updatedDetail = await this.saleDetailRepository.save(detail);

    // Recalcular totales de la venta
    await this.recalculateSaleTotals(detail.sale.id);

    return plainToInstance(SaleDetailResponseDto, updatedDetail);
  }

  async remove(id: string): Promise<{ message: string }> {
    const detail = await this.saleDetailRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sale'],
    });

    if (!detail) {
      throw new NotFoundException(`Detalle de venta con ID ${id} no encontrado`);
    }

    // Validar que la venta esté pendiente
    if (detail.sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Solo se pueden eliminar detalles de ventas pendientes');
    }

    await this.saleDetailRepository.softRemove(detail);

    // Recalcular totales de la venta
    await this.recalculateSaleTotals(detail.sale.id);

    return { message: 'Detalle de venta eliminado exitosamente' };
  }

  async getSaleDetailsStats(saleId: string): Promise<{
    totalItems: number;
    totalQuantity: number;
    averagePrice: number;
    totalTax: number;
    totalDiscount: number;
    mostSoldProduct: { productId: string; productName: string; quantity: number } | null;
  }> {
    const details = await this.saleDetailRepository.find({
      where: { 
        sale: { id: saleId },
        deletedAt: IsNull() 
      },
      relations: ['product'],
    });

    if (details.length === 0) {
      return {
        totalItems: 0,
        totalQuantity: 0,
        averagePrice: 0,
        totalTax: 0,
        totalDiscount: 0,
        mostSoldProduct: null,
      };
    }

    const stats = {
      totalItems: details.length,
      totalQuantity: 0,
      averagePrice: 0,
      totalTax: 0,
      totalDiscount: 0,
      mostSoldProduct: null,
    };

    const productQuantities: Map<string, { name: string; quantity: number }> = new Map();

    details.forEach(detail => {
      stats.totalQuantity += detail.quantity;
      stats.totalTax += detail.taxAmount;
      stats.totalDiscount += detail.discountAmount;

      // Calcular producto más vendido
      if (productQuantities.has(detail.product.id)) {
        const existing = productQuantities.get(detail.product.id)!;
        existing.quantity += detail.quantity;
      } else {
        productQuantities.set(detail.product.id, {
          name: detail.product.name,
          quantity: detail.quantity,
        });
      }
    });

    stats.averagePrice = details.reduce((sum, detail) => sum + detail.unitPrice, 0) / details.length;

    // Encontrar el producto más vendido
    if (productQuantities.size > 0) {
      let maxQuantity = 0;
      let mostSold: any = null;

      for (const [productId, data] of productQuantities) {
        if (data.quantity > maxQuantity) {
          maxQuantity = data.quantity;
          mostSold = { productId, productName: data.name, quantity: data.quantity };
        }
      }

      stats.mostSoldProduct = mostSold;
    }

    return stats;
  }

  async getProductSalesStats(productId: string): Promise<{
    totalSold: number;
    totalRevenue: number;
    averagePrice: number;
    salesCount: number;
  }> {
    const details = await this.saleDetailRepository
      .createQueryBuilder('detail')
      .leftJoinAndSelect('detail.sale', 'sale')
      .leftJoinAndSelect('detail.product', 'product')
      .where('detail.product_id = :productId', { productId })
      .andWhere('detail.deletedAt IS NULL')
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .getMany();

    const stats = {
      totalSold: 0,
      totalRevenue: 0,
      averagePrice: 0,
      salesCount: details.length,
    };

    details.forEach(detail => {
      stats.totalSold += detail.quantity;
      stats.totalRevenue += detail.lineTotal;
    });

    stats.averagePrice = stats.totalSold > 0 ? stats.totalRevenue / stats.totalSold : 0;

    return stats;
  }

  private async recalculateSaleTotals(saleId: string): Promise<void> {
    const details = await this.saleDetailRepository.find({
      where: { 
        sale: { id: saleId },
        deletedAt: IsNull() 
      },
    });

    const totals = details.reduce((acc, detail) => ({
      subtotal: acc.subtotal + (detail.quantity * detail.unitPrice),
      discountAmount: acc.discountAmount + detail.discountAmount,
      taxAmount: acc.taxAmount + detail.taxAmount,
    }), { subtotal: 0, discountAmount: 0, taxAmount: 0 });

    const total = totals.subtotal - totals.discountAmount + totals.taxAmount;

    await this.saleRepository.update(saleId, {
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: total,
      pendingAmount: total, // Asumimos que no hay pagos aún al modificar detalles
    });
  }

  async findDetailsWithDiscounts(saleId: string): Promise<SaleDetailResponseDto[]> {
    const details = await this.saleDetailRepository
      .createQueryBuilder('detail')
      .leftJoinAndSelect('detail.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('detail.sale_id = :saleId', { saleId })
      .andWhere('detail.deletedAt IS NULL')
      .andWhere('detail.discount > 0')
      .orderBy('detail.discount', 'DESC')
      .getMany();

    return plainToInstance(SaleDetailResponseDto, details);
  }

  async updateDetailQuantity(id: string, quantity: number): Promise<SaleDetailResponseDto> {
    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    const detail = await this.saleDetailRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sale'],
    });

    if (!detail) {
      throw new NotFoundException(`Detalle de venta con ID ${id} no encontrado`);
    }

    if (detail.sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Solo se pueden modificar detalles de ventas pendientes');
    }

    // Recalcular montos basados en la nueva cantidad
    const lineSubtotal = quantity * detail.unitPrice;
    const lineDiscount = lineSubtotal * (detail.discount / 100);
    const lineTax = lineSubtotal * (detail.taxPercentage / 100);
    const lineTotal = lineSubtotal - lineDiscount + lineTax;

    detail.quantity = quantity;
    detail.discountAmount = lineDiscount;
    detail.taxAmount = lineTax;
    detail.lineTotal = lineTotal;

    const updatedDetail = await this.saleDetailRepository.save(detail);

    // Recalcular totales de la venta
    await this.recalculateSaleTotals(detail.sale.id);

    return plainToInstance(SaleDetailResponseDto, updatedDetail);
  }
}
