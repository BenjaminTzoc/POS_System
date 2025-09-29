import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DiscountCode, DiscountScope, DiscountType } from '../entities';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CustomerCategoryService, CustomerService } from '.';
import { ProductService } from 'src/logistics/services';
import { CreateDiscountCodeDto, DiscountCodeResponseDto, UpdateDiscountCodeDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class DiscountCodeService {
  constructor(
    @InjectRepository(DiscountCode)
    private readonly discountCodeRepository: Repository<DiscountCode>,
    private readonly customerCategoryService: CustomerCategoryService,
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
  ) {}

  async create(dto: CreateDiscountCodeDto): Promise<DiscountCodeResponseDto> {
    // Verificar si el código ya existe
    const existingCode = await this.discountCodeRepository.findOne({
      where: { code: dto.code },
      withDeleted: false,
    });

    if (existingCode) {
      throw new ConflictException(`El código de descuento '${dto.code}' ya existe`);
    }

    // Validar fechas
    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);
    
    if (validFrom >= validUntil) {
      throw new BadRequestException('La fecha de inicio debe ser anterior a la fecha de vencimiento');
    }

    if (validUntil < new Date()) {
      throw new BadRequestException('La fecha de vencimiento no puede ser en el pasado');
    }

    // Validar según el scope
    await this.validateScopeRequirements(dto);

    // Validar valores según el tipo
    await this.validateDiscountValues(dto);

    const discountCode = this.discountCodeRepository.create({
      ...dto,
      validFrom,
      validUntil,
    });

    const savedDiscountCode = await this.discountCodeRepository.save(discountCode);
    return plainToInstance(DiscountCodeResponseDto, savedDiscountCode);
  }

  async findAll(): Promise<DiscountCodeResponseDto[]> {
    const discountCodes = await this.discountCodeRepository.find({
      where: { deletedAt: IsNull() },
      order: { validFrom: 'DESC' },
    });
    return plainToInstance(DiscountCodeResponseDto, discountCodes);
  }

  async findActive(): Promise<DiscountCodeResponseDto[]> {
    const now = new Date();
    const discountCodes = await this.discountCodeRepository.find({
      where: {
        isActive: true,
        validFrom: LessThanOrEqual(now),
        validUntil: MoreThanOrEqual(now),
        deletedAt: IsNull(),
      },
      order: { validFrom: 'DESC' },
    });
    return plainToInstance(DiscountCodeResponseDto, discountCodes);
  }

  async findOne(id: string): Promise<DiscountCodeResponseDto> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento con ID ${id} no encontrado`);
    }

    return plainToInstance(DiscountCodeResponseDto, discountCode);
  }

  async findByCode(code: string): Promise<DiscountCodeResponseDto> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { code, deletedAt: IsNull() },
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento '${code}' no encontrado`);
    }

    return plainToInstance(DiscountCodeResponseDto, discountCode);
  }

  async update(id: string, dto: UpdateDiscountCodeDto): Promise<DiscountCodeResponseDto> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo código ya existe
    if (dto.code && dto.code !== discountCode.code) {
      const existingCode = await this.discountCodeRepository.findOne({
        where: { code: dto.code, deletedAt: IsNull() },
      });

      if (existingCode) {
        throw new ConflictException(`El código de descuento '${dto.code}' ya existe`);
      }
    }

    // Validar fechas si se proporcionan
    if (dto.validFrom || dto.validUntil) {
      const validFrom = dto.validFrom ? new Date(dto.validFrom) : discountCode.validFrom;
      const validUntil = dto.validUntil ? new Date(dto.validUntil) : discountCode.validUntil;

      if (validFrom >= validUntil) {
        throw new BadRequestException('La fecha de inicio debe ser anterior a la fecha de vencimiento');
      }
    }

    // Validar según el scope si se cambia
    if (dto.scope || dto.customerCategoryId || dto.productId || dto.customerId) {
      const validationDto = {
        scope: dto.scope ?? discountCode.scope,
        customerCategoryId: dto.customerCategoryId ?? discountCode.customerCategoryId,
        productId: dto.productId ?? discountCode.productId,
        customerId: dto.customerId ?? discountCode.customerId,
      };
      await this.validateScopeRequirements(validationDto);
    }

    // Validar valores si se cambian
    if (dto.type || dto.value) {
      const validationDto = {
        type: dto.type ?? discountCode.type,
        value: dto.value ?? discountCode.value,
        maxDiscountAmount: dto.maxDiscountAmount ?? discountCode.maxDiscountAmount,
      };
      await this.validateDiscountValues(validationDto);
    }

    Object.assign(discountCode, dto);
    
    // Actualizar fechas si se proporcionan
    if (dto.validFrom) discountCode.validFrom = new Date(dto.validFrom);
    if (dto.validUntil) discountCode.validUntil = new Date(dto.validUntil);

    const updatedDiscountCode = await this.discountCodeRepository.save(discountCode);
    return plainToInstance(DiscountCodeResponseDto, updatedDiscountCode);
  }

  async remove(id: string): Promise<{ message: string }> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sales'],
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento con ID ${id} no encontrado`);
    }

    // Verificar si el código de descuento tiene ventas asociadas
    if (discountCode.sales && discountCode.sales.length > 0) {
      throw new ConflictException(
        'No se puede eliminar el código de descuento porque tiene ventas asociadas',
      );
    }

    await this.discountCodeRepository.softRemove(discountCode);
    return { message: 'Código de descuento eliminado exitosamente' };
  }

  async restore(id: string): Promise<DiscountCodeResponseDto> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento con ID ${id} no encontrado`);
    }

    if (!discountCode.deletedAt) {
      throw new ConflictException(`El código de descuento con ID ${id} no está eliminado`);
    }

    discountCode.deletedAt = null;
    const restoredDiscountCode = await this.discountCodeRepository.save(discountCode);
    return plainToInstance(DiscountCodeResponseDto, restoredDiscountCode);
  }

  async toggleStatus(id: string): Promise<DiscountCodeResponseDto> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento con ID ${id} no encontrado`);
    }

    discountCode.isActive = !discountCode.isActive;
    const updatedDiscountCode = await this.discountCodeRepository.save(discountCode);
    return plainToInstance(DiscountCodeResponseDto, updatedDiscountCode);
  }

  async validateDiscountCode(
    code: string, 
    customerId?: string, 
    productId?: string, 
    purchaseAmount: number = 0
  ): Promise<{ isValid: boolean; discountAmount: number; message?: string }> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { code, deletedAt: IsNull() },
    });

    if (!discountCode) {
      return { isValid: false, discountAmount: 0, message: 'Código de descuento no encontrado' };
    }

    // Validar estado activo
    if (!discountCode.isActive) {
      return { isValid: false, discountAmount: 0, message: 'Código de descuento inactivo' };
    }

    // Validar fechas de vigencia
    const now = new Date();
    if (now < discountCode.validFrom) {
      return { isValid: false, discountAmount: 0, message: 'Código de descuento no vigente' };
    }

    if (now > discountCode.validUntil) {
      return { isValid: false, discountAmount: 0, message: 'Código de descuento vencido' };
    }

    // Validar límite de uso
    if (discountCode.usageLimit && discountCode.usedCount >= discountCode.usageLimit) {
      return { isValid: false, discountAmount: 0, message: 'Límite de uso alcanzado' };
    }

    // Validar monto mínimo de compra
    if (discountCode.minPurchaseAmount && purchaseAmount < discountCode.minPurchaseAmount) {
      return { 
        isValid: false, 
        discountAmount: 0, 
        message: `Monto mínimo de compra no alcanzado (Q${discountCode.minPurchaseAmount})` 
      };
    }

    // Validar scope específico
    const scopeValidation = await this.validateDiscountScope(discountCode, customerId, productId);
    if (!scopeValidation.isValid) {
      return { isValid: false, discountAmount: 0, message: scopeValidation.message };
    }

    // Calcular monto de descuento
    const discountAmount = this.calculateDiscountAmount(discountCode, purchaseAmount);

    return { isValid: true, discountAmount };
  }

  async applyDiscountCode(code: string, saleId: string): Promise<DiscountCodeResponseDto> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { code, deletedAt: IsNull() },
    });

    if (!discountCode) {
      throw new NotFoundException(`Código de descuento '${code}' no encontrado`);
    }

    // Incrementar contador de uso
    discountCode.usedCount += 1;
    const updatedDiscountCode = await this.discountCodeRepository.save(discountCode);

    return plainToInstance(DiscountCodeResponseDto, updatedDiscountCode);
  }

  async getDiscountCodeStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    deleted: number;
    byScope: Record<DiscountScope, number>;
    byType: Record<DiscountType, number>;
    totalUsage: number;
  }> {
    const discountCodes = await this.discountCodeRepository.find({
      where: { deletedAt: IsNull() },
    });

    const now = new Date();
    const stats = {
      total: discountCodes.length,
      active: 0,
      expired: 0,
      deleted: 0,
      byScope: {
        [DiscountScope.GLOBAL]: 0,
        [DiscountScope.CATEGORY]: 0,
        [DiscountScope.PRODUCT]: 0,
        [DiscountScope.CUSTOMER]: 0,
      },
      byType: {
        [DiscountType.PERCENTAGE]: 0,
        [DiscountType.FIXED_AMOUNT]: 0,
      },
      totalUsage: 0,
    };

    discountCodes.forEach(code => {
      stats.totalUsage += code.usedCount;
      stats.byScope[code.scope]++;
      stats.byType[code.type]++;

      if (code.isActive && now >= code.validFrom && now <= code.validUntil) {
        stats.active++;
      } else if (now > code.validUntil) {
        stats.expired++;
      }
    });

    // Obtener count de eliminados
    const totalCount = await this.discountCodeRepository.count();
    stats.deleted = totalCount - discountCodes.length;

    return stats;
  }

  private async validateScopeRequirements(dto: Partial<CreateDiscountCodeDto>): Promise<void> {
    switch (dto.scope) {
      case DiscountScope.CATEGORY:
        if (!dto.customerCategoryId) {
          throw new BadRequestException('El scope CATEGORY requiere customerCategoryId');
        }
        await this.customerCategoryService.findOne(dto.customerCategoryId);
        break;

      case DiscountScope.PRODUCT:
        if (!dto.productId) {
          throw new BadRequestException('El scope PRODUCT requiere productId');
        }
        await this.productService.findOne(dto.productId);
        break;

      case DiscountScope.CUSTOMER:
        if (!dto.customerId) {
          throw new BadRequestException('El scope CUSTOMER requiere customerId');
        }
        await this.customerService.findOne(dto.customerId);
        break;

      case DiscountScope.GLOBAL:
        // No requiere validaciones adicionales
        break;

      default:
        throw new BadRequestException('Scope de descuento no válido');
    }
  }

  private async validateDiscountValues(dto: Partial<CreateDiscountCodeDto>): Promise<void> {
    if (dto.type === DiscountType.PERCENTAGE) {
      if (Number(dto.value) < 0 || Number(dto.value) > 100) {
        throw new BadRequestException('El porcentaje de descuento debe estar entre 0 y 100');
      }
    } else if (dto.type === DiscountType.FIXED_AMOUNT) {
      if (Number(dto.value) <= 0) {
        throw new BadRequestException('El monto fijo de descuento debe ser mayor a 0');
      }
    }
  }

  private async validateDiscountScope(
    discountCode: DiscountCode, 
    customerId?: string, 
    productId?: string
  ): Promise<{ isValid: boolean; message?: string }> {
    switch (discountCode.scope) {
      case DiscountScope.CATEGORY:
        if (!customerId) {
          return { isValid: false, message: 'Cliente requerido para este descuento' };
        }
        const customer = await this.customerService.findOne(customerId);
        if (!customer.category || customer.category.id !== discountCode.customerCategoryId) {
          return { isValid: false, message: 'El cliente no pertenece a la categoría requerida' };
        }
        break;

      case DiscountScope.PRODUCT:
        if (!productId) {
          return { isValid: false, message: 'Producto requerido para este descuento' };
        }
        if (productId !== discountCode.productId) {
          return { isValid: false, message: 'Descuento no aplicable a este producto' };
        }
        break;

      case DiscountScope.CUSTOMER:
        if (!customerId) {
          return { isValid: false, message: 'Cliente requerido para este descuento' };
        }
        if (customerId !== discountCode.customerId) {
          return { isValid: false, message: 'Descuento no aplicable a este cliente' };
        }
        break;

      case DiscountScope.GLOBAL:
        // Aplicable a todos
        break;
    }

    return { isValid: true };
  }

  private calculateDiscountAmount(discountCode: DiscountCode, purchaseAmount: number): number {
    let discountAmount = 0;

    if (discountCode.type === DiscountType.PERCENTAGE) {
      discountAmount = purchaseAmount * (discountCode.value / 100);
    } else if (discountCode.type === DiscountType.FIXED_AMOUNT) {
      discountAmount = discountCode.value;
    }

    // Aplicar límite máximo de descuento si existe
    if (discountCode.maxDiscountAmount && discountAmount > discountCode.maxDiscountAmount) {
      discountAmount = discountCode.maxDiscountAmount;
    }

    // No permitir descuento mayor al monto de compra
    if (discountAmount > purchaseAmount) {
      discountAmount = purchaseAmount;
    }

    return Number(discountAmount.toFixed(2));
  }
}
