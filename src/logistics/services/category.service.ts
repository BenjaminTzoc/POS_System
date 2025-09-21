import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { UnitService } from '.'
import { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly unitService: UnitService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    // Verificar si la categoría ya existe
    const existingCategory = await this.categoryRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingCategory) {
      throw new ConflictException(`La categoría '${dto.name}' ya existe`);
    }

    let defaultUnit: any = null;
    
    // Si se proporciona defaultUnitId, validar que la unidad existe
    if (dto.defaultUnitId) {
      try {
        defaultUnit = await this.unitService.findOne(dto.defaultUnitId);
      } catch (error) {
        throw new BadRequestException(`La unidad con ID ${dto.defaultUnitId} no existe`);
      }
    }

    const category = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      defaultUnit: defaultUnit,
    });

    const savedCategory = await this.categoryRepository.save(category);
    return plainToInstance(CategoryResponseDto, savedCategory);
  }

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['defaultUnit'],
      order: { name: 'ASC' },
    });
    return plainToInstance(CategoryResponseDto, categories);
  }

  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['defaultUnit'],
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    return plainToInstance(CategoryResponseDto, category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['defaultUnit'],
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    // Verificar si el nuevo nombre ya existe
    if (dto.name && dto.name !== category.name) {
      const existingCategory = await this.categoryRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingCategory) {
        throw new ConflictException(`La categoría '${dto.name}' ya existe`);
      }
    }

    // Manejar la unidad por defecto
    let defaultUnit: any = category.defaultUnit;
    
    if (dto.defaultUnitId !== undefined) {
      if (dto.defaultUnitId === null) {
        defaultUnit = null;
      } else {
        try {
          defaultUnit = await this.unitService.findOne(dto.defaultUnitId);
        } catch (error) {
          throw new BadRequestException(`La unidad con ID ${dto.defaultUnitId} no existe`);
        }
      }
    }

    Object.assign(category, {
      name: dto.name ?? category.name,
      description: dto.description ?? category.description,
      defaultUnit: defaultUnit,
    });

    const updatedCategory = await this.categoryRepository.save(category);
    return plainToInstance(CategoryResponseDto, updatedCategory);
  }

  async remove(id: string): Promise<{ message: string }> {
    const category = await this.categoryRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['products'],
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    // Verificar si la categoría tiene productos asociados
    if (category.products && category.products.length > 0) {
      throw new ConflictException(
        'No se puede eliminar la categoría porque tiene productos asociados',
      );
    }

    await this.categoryRepository.softRemove(category);
    return { message: 'Categoría eliminada exitosamente' };
  }

  async restore(id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['defaultUnit'],
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    if (!category.deletedAt) {
      throw new ConflictException(`La categoría con ID ${id} no está eliminada`);
    }

    category.deletedAt = null;
    const restoredCategory = await this.categoryRepository.save(category);
    return plainToInstance(CategoryResponseDto, restoredCategory);
  }
}
