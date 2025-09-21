import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Unit } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { CreateUnitDto, UnitResponseDto, UpdateUnitDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UnitService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
  ) {}

  async create(dto: CreateUnitDto): Promise<UnitResponseDto> {
    // Verificar si la unidad ya existe por nombre
    const existingUnit = await this.unitRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingUnit) {
      throw new ConflictException(`La unidad '${dto.name}' ya existe`);
    }

    // Verificar si la abreviatura ya existe
    const existingAbbreviation = await this.unitRepository.findOne({
      where: { abbreviation: dto.abbreviation },
      withDeleted: false,
    });

    if (existingAbbreviation) {
      throw new ConflictException(`La abreviatura '${dto.abbreviation}' ya está en uso`);
    }

    const unit = this.unitRepository.create(dto);
    const savedUnit = await this.unitRepository.save(unit);
    return plainToInstance(UnitResponseDto, savedUnit);
  }

  async findAll(): Promise<UnitResponseDto[]> {
    const units = await this.unitRepository.find({
      where: { deletedAt: IsNull() },
      order: { name: 'ASC' },
    });
    return plainToInstance(UnitResponseDto, units);
  }

  async findOne(id: string): Promise<UnitResponseDto> {
    const unit = await this.unitRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!unit) {
      throw new NotFoundException(`Unidad con ID ${id} no encontrada`);
    }

    return plainToInstance(UnitResponseDto, unit);
  }

  async update(id: string, dto: UpdateUnitDto): Promise<UnitResponseDto> {
    const unit = await this.unitRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!unit) {
      throw new NotFoundException(`Unidad con ID ${id} no encontrada`);
    }

    // Verificar si el nuevo nombre ya existe
    if (dto.name && dto.name !== unit.name) {
      const existingUnit = await this.unitRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingUnit) {
        throw new ConflictException(`La unidad '${dto.name}' ya existe`);
      }
    }

    // Verificar si la nueva abreviatura ya existe
    if (dto.abbreviation && dto.abbreviation !== unit.abbreviation) {
      const existingAbbreviation = await this.unitRepository.findOne({
        where: { abbreviation: dto.abbreviation, deletedAt: IsNull() },
      });

      if (existingAbbreviation) {
        throw new ConflictException(`La abreviatura '${dto.abbreviation}' ya está en uso`);
      }
    }

    Object.assign(unit, dto);
    const updatedUnit = await this.unitRepository.save(unit);
    return plainToInstance(UnitResponseDto, updatedUnit);
  }

  async remove(id: string): Promise<{ message: string }> {
    const unit = await this.unitRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!unit) {
      throw new NotFoundException(`Unidad con ID ${id} no encontrada`);
    }

    // Verificar si la unidad está siendo usada en categorías
    const categoriesCount = await this.unitRepository
      .createQueryBuilder('unit')
      .innerJoin('unit.categories', 'category')
      .where('unit.id = :id', { id })
      .andWhere('category.deletedAt IS NULL')
      .getCount();

    if (categoriesCount > 0) {
      throw new ConflictException(
        'No se puede eliminar la unidad porque está siendo usada en categorías',
      );
    }

    // Verificar si la unidad está siendo usada en productos
    const productsCount = await this.unitRepository
      .createQueryBuilder('unit')
      .innerJoin('unit.products', 'product')
      .where('unit.id = :id', { id })
      .andWhere('product.deletedAt IS NULL')
      .getCount();

    if (productsCount > 0) {
      throw new ConflictException(
        'No se puede eliminar la unidad porque está siendo usada en productos',
      );
    }

    await this.unitRepository.softRemove(unit);
    return { message: 'Unidad eliminada exitosamente' };
  }

  async restore(id: string): Promise<UnitResponseDto> {
    const unit = await this.unitRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!unit) {
      throw new NotFoundException(`Unidad con ID ${id} no encontrada`);
    }

    if (!unit.deletedAt) {
      throw new ConflictException(`La unidad con ID ${id} no está eliminada`);
    }

    unit.deletedAt = null;
    const restoredUnit = await this.unitRepository.save(unit);
    return plainToInstance(UnitResponseDto, restoredUnit);
  }

  
}
