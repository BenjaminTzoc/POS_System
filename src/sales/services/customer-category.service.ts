import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CustomerCategory } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { CreateCustomerCategoryDto, CustomerCategoryResponseDto, UpdateCustomerCategoryDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CustomerCategoryService {
  constructor(
    @InjectRepository(CustomerCategory)
    private readonly customerCategoryRepository: Repository<CustomerCategory>,
  ) {}

  async create(dto: CreateCustomerCategoryDto): Promise<CustomerCategoryResponseDto> {
    // Verificar si el nombre ya existe
    const existingCategory = await this.customerCategoryRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingCategory) {
      throw new ConflictException(`La categoría de cliente '${dto.name}' ya existe`);
    }

    // Validar que el porcentaje de descuento sea válido
    if (dto.discountPercentage && (dto.discountPercentage < 0 || dto.discountPercentage > 100)) {
      throw new BadRequestException('El porcentaje de descuento debe estar entre 0 y 100');
    }

    const category = this.customerCategoryRepository.create(dto);
    const savedCategory = await this.customerCategoryRepository.save(category);
    return plainToInstance(CustomerCategoryResponseDto, savedCategory);
  }

  async findAll(): Promise<CustomerCategoryResponseDto[]> {
    const categories = await this.customerCategoryRepository.find({
      where: { deletedAt: IsNull() },
      order: { minPurchaseAmount: 'ASC' },
    });
    return plainToInstance(CustomerCategoryResponseDto, categories);
  }

  async findOne(id: string): Promise<CustomerCategoryResponseDto> {
    const category = await this.customerCategoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!category) {
      throw new NotFoundException(`Categoría de cliente con ID ${id} no encontrada`);
    }

    return plainToInstance(CustomerCategoryResponseDto, category);
  }

  async findByName(name: string): Promise<CustomerCategoryResponseDto> {
    const category = await this.customerCategoryRepository.findOne({
      where: { name, deletedAt: IsNull() },
    });

    if (!category) {
      throw new NotFoundException(`Categoría de cliente '${name}' no encontrada`);
    }

    return plainToInstance(CustomerCategoryResponseDto, category);
  }

  async update(id: string, dto: UpdateCustomerCategoryDto): Promise<CustomerCategoryResponseDto> {
    const category = await this.customerCategoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!category) {
      throw new NotFoundException(`Categoría de cliente con ID ${id} no encontrada`);
    }

    // Verificar si el nuevo nombre ya existe
    if (dto.name && dto.name !== category.name) {
      const existingCategory = await this.customerCategoryRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingCategory) {
        throw new ConflictException(`La categoría de cliente '${dto.name}' ya existe`);
      }
    }

    // Validar que el porcentaje de descuento sea válido
    if (dto.discountPercentage && (dto.discountPercentage < 0 || dto.discountPercentage > 100)) {
      throw new BadRequestException('El porcentaje de descuento debe estar entre 0 y 100');
    }

    Object.assign(category, dto);
    const updatedCategory = await this.customerCategoryRepository.save(category);
    return plainToInstance(CustomerCategoryResponseDto, updatedCategory);
  }

  async remove(id: string): Promise<{ message: string }> {
    const category = await this.customerCategoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['customers'],
    });

    if (!category) {
      throw new NotFoundException(`Categoría de cliente con ID ${id} no encontrada`);
    }

    // Verificar si la categoría tiene clientes asociados
    if (category.customers && category.customers.length > 0) {
      throw new ConflictException(
        'No se puede eliminar la categoría porque tiene clientes asociados',
      );
    }

    await this.customerCategoryRepository.softRemove(category);
    return { message: 'Categoría de cliente eliminada exitosamente' };
  }

  async restore(id: string): Promise<CustomerCategoryResponseDto> {
    const category = await this.customerCategoryRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!category) {
      throw new NotFoundException(`Categoría de cliente con ID ${id} no encontrada`);
    }

    if (!category.deletedAt) {
      throw new ConflictException(`La categoría de cliente con ID ${id} no está eliminada`);
    }

    category.deletedAt = null;
    const restoredCategory = await this.customerCategoryRepository.save(category);
    return plainToInstance(CustomerCategoryResponseDto, restoredCategory);
  }

  async findCategoryByPurchaseAmount(purchaseAmount: number): Promise<CustomerCategoryResponseDto | null> {
    const category = await this.customerCategoryRepository
      .createQueryBuilder('category')
      .where('category.deletedAt IS NULL')
      .andWhere('category.isActive = :isActive', { isActive: true })
      .andWhere('category.minPurchaseAmount <= :purchaseAmount', { purchaseAmount })
      .orderBy('category.minPurchaseAmount', 'DESC')
      .getOne();

    return category ? plainToInstance(CustomerCategoryResponseDto, category) : null;
  }
}
