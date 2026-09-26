import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Customer, CustomerProductPrice } from '../entities';
import { Product } from 'src/logistics/entities';
import {
  AppliedProductPriceDto,
  CustomerProductPriceResponseDto,
  UpdateCustomerProductPriceDto,
  UpsertCustomerProductPriceDto,
} from '../dto/customer-product-price.dto';

@Injectable()
export class CustomerProductPriceService {
  constructor(
    @InjectRepository(CustomerProductPrice)
    private readonly priceRepository: Repository<CustomerProductPrice>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async listByCustomer(customerId: string): Promise<CustomerProductPriceResponseDto[]> {
    await this.assertCustomer(customerId);
    const rows = await this.priceRepository.find({
      where: { customer: { id: customerId }, deletedAt: IsNull() },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getApplied(customerId: string, productId: string): Promise<AppliedProductPriceDto> {
    await this.assertCustomer(customerId);
    const product = await this.productRepository.findOne({
      where: { id: productId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException(`Producto con ID ${productId} no encontrado`);

    const custom = await this.getActivePrice(customerId, productId);
    const listPrice = Number(product.price);
    const price = custom != null ? custom : listPrice;
    return plainToInstance(
      AppliedProductPriceDto,
      {
        productId,
        listPrice,
        price,
        source: custom != null ? 'custom' : 'list',
      },
      { excludeExtraneousValues: true },
    );
  }

  async getActivePrice(customerId: string | undefined | null, productId: string): Promise<number | null> {
    if (!customerId) return null;
    const map = await this.getActivePriceMap(customerId, [productId]);
    return map.get(productId) ?? null;
  }

  async getActivePriceMap(customerId: string | undefined | null, productIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!customerId || !ids.length) return result;

    const now = Date.now();
    const rows = await this.priceRepository.find({
      where: {
        customer: { id: customerId },
        product: { id: In(ids) },
        isActive: true,
        deletedAt: IsNull(),
      },
      relations: ['product'],
    });

    for (const row of rows) {
      if (row.validFrom && row.validFrom.getTime() > now) continue;
      if (row.validUntil && row.validUntil.getTime() < now) continue;
      if (row.product?.id) result.set(row.product.id, Number(row.price));
    }
    return result;
  }

  async upsert(customerId: string, dto: UpsertCustomerProductPriceDto): Promise<CustomerProductPriceResponseDto> {
    await this.assertCustomer(customerId);
    this.assertDateRange(dto.validFrom, dto.validUntil);

    const product = await this.productRepository.findOne({
      where: { id: dto.productId, deletedAt: IsNull() },
    });
    if (!product) throw new NotFoundException(`Producto con ID ${dto.productId} no encontrado`);
    if (product.isMaster) {
      throw new BadRequestException('No se puede asignar precio especial a un producto maestro');
    }

    let row = await this.priceRepository.findOne({
      where: { customer: { id: customerId }, product: { id: dto.productId } },
      relations: ['product'],
      withDeleted: true,
    });

    if (row?.deletedAt) {
      row.deletedAt = null;
    }

    if (!row) {
      row = this.priceRepository.create({
        customer: { id: customerId } as Customer,
        product,
      });
    }

    row.price = dto.price;
    row.isActive = dto.isActive ?? true;
    row.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    row.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    row.product = product;

    const saved = await this.priceRepository.save(row);
    saved.product = product;
    return this.toResponse(saved);
  }

  async update(customerId: string, productId: string, dto: UpdateCustomerProductPriceDto): Promise<CustomerProductPriceResponseDto> {
    const row = await this.priceRepository.findOne({
      where: { customer: { id: customerId }, product: { id: productId }, deletedAt: IsNull() },
      relations: ['product'],
    });
    if (!row) throw new NotFoundException('No hay precio especial para este producto y cliente');

    this.assertDateRange(
      dto.validFrom !== undefined ? dto.validFrom : row.validFrom?.toISOString(),
      dto.validUntil !== undefined ? dto.validUntil : row.validUntil?.toISOString(),
    );

    if (dto.price !== undefined) row.price = dto.price;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.validFrom !== undefined) row.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validUntil !== undefined) row.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    const saved = await this.priceRepository.save(row);
    return this.toResponse(saved);
  }

  async remove(customerId: string, productId: string): Promise<{ message: string }> {
    const row = await this.priceRepository.findOne({
      where: { customer: { id: customerId }, product: { id: productId }, deletedAt: IsNull() },
    });
    if (!row) throw new NotFoundException('No hay precio especial para este producto y cliente');
    await this.priceRepository.softRemove(row);
    return { message: 'Precio especial eliminado' };
  }

  private async assertCustomer(customerId: string): Promise<void> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() },
    });
    if (!customer) throw new NotFoundException(`Cliente con ID ${customerId} no encontrado`);
  }

  private assertDateRange(from?: string | Date | null, until?: string | Date | null) {
    if (!from || !until) return;
    const start = from instanceof Date ? from : new Date(from);
    const end = until instanceof Date ? until : new Date(until);
    if (start > end) {
      throw new BadRequestException('validFrom no puede ser posterior a validUntil');
    }
  }

  private toResponse(row: CustomerProductPrice): CustomerProductPriceResponseDto {
    const listPrice = Number(row.product?.price ?? 0);
    return plainToInstance(
      CustomerProductPriceResponseDto,
      {
        ...row,
        listPrice,
        product: row.product
          ? {
              id: row.product.id,
              name: row.product.name,
              sku: row.product.sku,
              price: listPrice,
            }
          : null,
      },
      { excludeExtraneousValues: true },
    );
  }
}
