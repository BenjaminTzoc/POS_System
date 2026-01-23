import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    // Verificar si la unidad ya existe (incluyendo eliminadas)
    const existingUnit = await this.unitRepository.findOne({
      where: { name: dto.name },
      withDeleted: true,
    });

    if (existingUnit) {
      if (existingUnit.deletedAt) {
        throw new ConflictException(
          `La unidad '${dto.name}' ya existe pero está inactiva. Considere reactivarla o contacte con el administrador de su sucursal.`,
        );
      }
      throw new ConflictException(`La unidad '${dto.name}' ya existe`);
    }

    // Verificar si la abreviatura ya existe (incluyendo eliminadas)
    const existingAbbreviation = await this.unitRepository.findOne({
      where: { abbreviation: dto.abbreviation },
      withDeleted: true,
    });

    if (existingAbbreviation) {
      if (existingAbbreviation.deletedAt) {
        throw new ConflictException(
          `La abreviatura '${dto.abbreviation}' ya existe en una unidad inactiva. Considere reactivarla o contacte con el administrador de su sucursal.`,
        );
      }
      throw new ConflictException(
        `La abreviatura '${dto.abbreviation}' ya está en uso`,
      );
    }

    const unit = this.unitRepository.create(dto);
    const savedUnit = await this.unitRepository.save(unit);
    return plainToInstance(UnitResponseDto, savedUnit);
  }

  async findAll(includeDeleted: boolean = false): Promise<UnitResponseDto[]> {
    const units = await this.unitRepository.find({
      withDeleted: includeDeleted,
      order: { name: 'ASC' },
    });
    return plainToInstance(UnitResponseDto, units);
  }

  async findOne(
    id: string,
    includeDeleted: boolean = false,
  ): Promise<UnitResponseDto> {
    const unit = await this.unitRepository.findOne({
      where: { id },
      withDeleted: includeDeleted,
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

    // Verificar si el nuevo nombre ya existe (incluyendo eliminadas)
    if (dto.name && dto.name !== unit.name) {
      const existingUnit = await this.unitRepository.findOne({
        where: { name: dto.name },
        withDeleted: true,
      });

      if (existingUnit) {
        if (existingUnit.deletedAt) {
          throw new ConflictException(
            `No se puede usar el nombre '${dto.name}' porque pertenece a una unidad inactiva. Considere reactivarla o contacte con el administrador.`,
          );
        }
        throw new ConflictException(`La unidad '${dto.name}' ya existe`);
      }
    }

    // Verificar si la nueva abreviatura ya existe (incluyendo eliminadas)
    if (dto.abbreviation && dto.abbreviation !== unit.abbreviation) {
      const existingAbbreviation = await this.unitRepository.findOne({
        where: { abbreviation: dto.abbreviation },
        withDeleted: true,
      });

      if (existingAbbreviation) {
        if (existingAbbreviation.deletedAt) {
          throw new ConflictException(
            `La abreviatura '${dto.abbreviation}' ya pertenece a una unidad inactiva.`,
          );
        }
        throw new ConflictException(
          `La abreviatura '${dto.abbreviation}' ya está en uso`,
        );
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
