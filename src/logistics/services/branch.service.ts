import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { BranchResponseDto, CreateBranchDto, UpdateBranchDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async create(dto: CreateBranchDto): Promise<BranchResponseDto> {
    // Verificar si el nombre de sucursal ya existe
    const existingBranch = await this.branchRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingBranch) {
      throw new ConflictException(`La sucursal '${dto.name}' ya existe`);
    }

    const branch = this.branchRepository.create(dto);
    const savedBranch = await this.branchRepository.save(branch);
    return plainToInstance(BranchResponseDto, savedBranch);
  }

  async findAll(): Promise<BranchResponseDto[]> {
    const branches = await this.branchRepository.find({
      where: { deletedAt: IsNull() },
      order: { name: 'ASC' },
    });
    return plainToInstance(BranchResponseDto, branches);
  }

  async findOne(id: string): Promise<BranchResponseDto> {
    const branch = await this.branchRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal con ID ${id} no encontrada`);
    }

    return plainToInstance(BranchResponseDto, branch);
  }

  async update(id: string, dto: UpdateBranchDto): Promise<BranchResponseDto> {
    const branch = await this.branchRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal con ID ${id} no encontrada`);
    }

    // Verificar si el nuevo nombre ya existe
    if (dto.name && dto.name !== branch.name) {
      const existingBranch = await this.branchRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingBranch) {
        throw new ConflictException(`La sucursal '${dto.name}' ya existe`);
      }
    }

    Object.assign(branch, dto);
    const updatedBranch = await this.branchRepository.save(branch);
    return plainToInstance(BranchResponseDto, updatedBranch);
  }

  async remove(id: string): Promise<{ message: string }> {
    const branch = await this.branchRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['inventories', 'movements', 'outgoingTransfers', 'incomingTransfers'],
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal con ID ${id} no encontrada`);
    }

    // Verificar si la sucursal tiene inventarios asociados
    if (branch.inventories && branch.inventories.length > 0) {
      throw new ConflictException(
        'No se puede eliminar la sucursal porque tiene inventarios asociados',
      );
    }

    // Verificar si la sucursal tiene movimientos asociados
    if (branch.movements && branch.movements.length > 0) {
      throw new ConflictException(
        'No se puede eliminar la sucursal porque tiene movimientos asociados',
      );
    }

    // Verificar si la sucursal tiene transferencias asociadas
    if (
      (branch.outgoingTransfers && branch.outgoingTransfers.length > 0) ||
      (branch.incomingTransfers && branch.incomingTransfers.length > 0)
    ) {
      throw new ConflictException(
        'No se puede eliminar la sucursal porque tiene transferencias asociadas',
      );
    }

    await this.branchRepository.softRemove(branch);
    return { message: 'Sucursal eliminada exitosamente' };
  }

  async restore(id: string): Promise<BranchResponseDto> {
    const branch = await this.branchRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal con ID ${id} no encontrada`);
    }

    if (!branch.deletedAt) {
      throw new ConflictException(`La sucursal con ID ${id} no está eliminada`);
    }

    branch.deletedAt = null;
    const restoredBranch = await this.branchRepository.save(branch);
    return plainToInstance(BranchResponseDto, restoredBranch);
  }

  async searchBranches(query: string): Promise<BranchResponseDto[]> {
    const branches = await this.branchRepository
      .createQueryBuilder('branch')
      .where('branch.deletedAt IS NULL')
      .andWhere(
        '(branch.name ILIKE :query OR branch.address ILIKE :query OR branch.email ILIKE :query)',
        { query: `%${query}%` },
      )
      .orderBy('branch.name', 'ASC')
      .getMany();

    return plainToInstance(BranchResponseDto, branches);
  }

  async getBranchesStats(): Promise<{ total: number; active: number; deleted: number }> {
    const total = await this.branchRepository.count();
    const active = await this.branchRepository.count({ where: { deletedAt: IsNull() } });
    const deleted = await this.branchRepository.count({ where: { deletedAt: IsNull() } });

    return { total, active, deleted: total - active };
  }
}
