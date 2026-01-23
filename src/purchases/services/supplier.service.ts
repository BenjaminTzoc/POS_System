import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Supplier } from '../entities';
import { IsNull, Repository } from 'typeorm';
import {
  CreateSupplierDto,
  SupplierResponseDto,
  UpdateSupplierDto,
} from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto): Promise<SupplierResponseDto> {
    // Verificar si el NIT ya existe (incluyendo eliminados)
    const existingNit = await this.supplierRepository.findOne({
      where: { nit: dto.nit },
      withDeleted: true,
    });

    if (existingNit) {
      if (existingNit.deletedAt) {
        throw new ConflictException(
          `El NIT '${dto.nit}' pertenece a un proveedor inactivo. Considere reactivarlo o contacte con el administrador.`,
        );
      }
      throw new ConflictException(`El NIT ${dto.nit} ya está registrado`);
    }

    const supplier = this.supplierRepository.create(dto);
    const savedSupplier = await this.supplierRepository.save(supplier);
    return plainToInstance(SupplierResponseDto, savedSupplier);
  }

  async findAll(
    includeDeleted: boolean = false,
  ): Promise<SupplierResponseDto[]> {
    const suppliers = await this.supplierRepository.find({
      withDeleted: includeDeleted,
      order: { name: 'ASC' },
    });
    return plainToInstance(SupplierResponseDto, suppliers);
  }

  async findOne(
    id: string,
    includeDeleted: boolean = false,
  ): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findOne({
      where: { id },
      withDeleted: includeDeleted,
    });

    if (!supplier) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    return plainToInstance(SupplierResponseDto, supplier);
  }

  async findByNit(nit: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findOne({
      where: { nit, deletedAt: IsNull() },
    });

    if (!supplier) {
      throw new NotFoundException(`Proveedor con NIT ${nit} no encontrado`);
    }

    return plainToInstance(SupplierResponseDto, supplier);
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!supplier) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo NIT ya existe (incluyendo eliminados)
    if (dto.nit && dto.nit !== supplier.nit) {
      const existingNit = await this.supplierRepository.findOne({
        where: { nit: dto.nit },
        withDeleted: true,
      });

      if (existingNit) {
        if (existingNit.deletedAt) {
          throw new ConflictException(
            `El NIT '${dto.nit}' pertenece a un proveedor inactivo. Considere reactivarlo o contacte con el administrador.`,
          );
        }
        throw new ConflictException(`El NIT ${dto.nit} ya está registrado`);
      }
    }

    Object.assign(supplier, dto);
    const updatedSupplier = await this.supplierRepository.save(supplier);
    return plainToInstance(SupplierResponseDto, updatedSupplier);
  }

  async remove(id: string): Promise<{ message: string }> {
    const supplier = await this.supplierRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['purchases'],
    });

    if (!supplier) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    // Verificar si el proveedor tiene compras asociadas
    if (supplier.purchases && supplier.purchases.length > 0) {
      throw new ConflictException(
        'No se puede eliminar el proveedor porque tiene compras asociadas',
      );
    }

    await this.supplierRepository.softRemove(supplier);
    return { message: 'Proveedor eliminado exitosamente' };
  }

  async restore(id: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!supplier) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    if (!supplier.deletedAt) {
      throw new ConflictException(
        `El proveedor con ID ${id} no está eliminado`,
      );
    }

    supplier.deletedAt = null;
    const restoredSupplier = await this.supplierRepository.save(supplier);
    return plainToInstance(SupplierResponseDto, restoredSupplier);
  }

  async searchSuppliers(
    query: string,
    includeDeleted: boolean = false,
  ): Promise<SupplierResponseDto[]> {
    const queryBuilder = this.supplierRepository.createQueryBuilder('supplier');

    if (!includeDeleted) {
      queryBuilder.where('supplier.deletedAt IS NULL');
    } else {
      queryBuilder.withDeleted();
    }

    const suppliers = await queryBuilder
      .andWhere(
        '(supplier.name ILIKE :query OR supplier.nit ILIKE :query OR supplier.contactName ILIKE :query OR supplier.email ILIKE :query)',
        { query: `%${query}%` },
      )
      .orderBy('supplier.name', 'ASC')
      .getMany();

    return plainToInstance(SupplierResponseDto, suppliers);
  }

  async getSuppliersStats(): Promise<{
    total: number;
    active: number;
    deleted: number;
  }> {
    const total = await this.supplierRepository.count();
    const active = await this.supplierRepository.count({
      where: { deletedAt: IsNull() },
    });
    const deleted = total - active;

    return { total, active, deleted };
  }
}
