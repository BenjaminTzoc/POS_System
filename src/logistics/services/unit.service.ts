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
    const existingUnit = await this.unitRepository.findOne({
      where: { name: dto.name },
      withDeleted: true,
    });

    if (existingUnit) {
      throw new ConflictException(`La unidad '${dto.name}' ya existe`);
    }

    const existingAbbreviation = await this.unitRepository.findOne({
      where: { abbreviation: dto.abbreviation },
      withDeleted: true,
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
      order: { name: 'ASC' },
    });
    return plainToInstance(UnitResponseDto, units);
  }

  async findOne(id: string): Promise<UnitResponseDto> {
    const unit = await this.unitRepository.findOne({
      where: { id },
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

    if (dto.name && dto.name !== unit.name) {
      const existingUnit = await this.unitRepository.findOne({
        where: { name: dto.name },
        withDeleted: true,
      });

      if (existingUnit) {
        throw new ConflictException(`La unidad '${dto.name}' ya existe`);
      }
    }

    if (dto.abbreviation && dto.abbreviation !== unit.abbreviation) {
      const existingAbbreviation = await this.unitRepository.findOne({
        where: { abbreviation: dto.abbreviation },
        withDeleted: true,
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

    const categoriesCount = await this.unitRepository.createQueryBuilder('unit').innerJoin('unit.categories', 'category').where('unit.id = :id', { id }).getCount();

    if (categoriesCount > 0) {
      throw new ConflictException('No se puede eliminar la unidad porque está siendo usada en categorías');
    }

    const productsCount = await this.unitRepository.createQueryBuilder('unit').innerJoin('unit.products', 'product').where('unit.id = :id', { id }).getCount();

    if (productsCount > 0) {
      throw new ConflictException('No se puede eliminar la unidad porque está siendo usada en productos');
    }

    try {
      await this.unitRepository.delete(unit.id);
    } catch (error) {
      if ((error as { code?: string })?.code === '23503') {
        throw new ConflictException('No se puede eliminar la unidad porque está siendo usada');
      }
      throw error;
    }
    return { message: 'Unidad eliminada exitosamente' };
  }
}
