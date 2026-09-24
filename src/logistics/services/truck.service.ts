import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Truck, TruckStatus } from '../entities/truck.entity';
import { CreateTruckDto, TruckResponseDto, UpdateTruckDto } from '../dto/truck.dto';
import { plainToInstance } from 'class-transformer';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class TruckService {
  constructor(
    @InjectRepository(Truck)
    private readonly truckRepository: Repository<Truck>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateTruckDto): Promise<TruckResponseDto> {
    const existing = await this.truckRepository.findOne({
      where: { licensePlate: dto.licensePlate.trim().toUpperCase() },
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException(`Ya existe un camión registrado con la placa ${dto.licensePlate}`);
    }

    let defaultDriver: User | null = null;
    if (dto.defaultDriverId) {
      defaultDriver = await this.userRepository.findOne({
        where: { id: dto.defaultDriverId, deletedAt: IsNull() },
      });
      if (!defaultDriver) {
        throw new NotFoundException(`El piloto/usuario con ID ${dto.defaultDriverId} no existe`);
      }
    }

    const truck = this.truckRepository.create({
      name: dto.name.trim(),
      licensePlate: dto.licensePlate.trim().toUpperCase(),
      brand: dto.brand?.trim(),
      model: dto.model?.trim(),
      year: dto.year,
      capacity: dto.capacity,
      status: dto.status ?? TruckStatus.ACTIVE,
      defaultDriver: defaultDriver ?? undefined,
      notes: dto.notes,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.truckRepository.save(truck);
    return this.findOne(saved.id);
  }

  async findAll(includeDeleted: boolean = false, status?: TruckStatus): Promise<TruckResponseDto[]> {
    const queryBuilder = this.truckRepository
      .createQueryBuilder('truck')
      .leftJoinAndSelect('truck.defaultDriver', 'driver')
      .where(includeDeleted ? '1=1' : 'truck.deletedAt IS NULL');

    if (includeDeleted) {
      queryBuilder.withDeleted();
    }

    if (status) {
      queryBuilder.andWhere('truck.status = :status', { status });
    }

    queryBuilder.orderBy('truck.name', 'ASC');

    const trucks = await queryBuilder.getMany();
    return plainToInstance(TruckResponseDto, trucks);
  }

  async findOne(id: string, includeDeleted: boolean = false): Promise<TruckResponseDto> {
    const truck = await this.truckRepository.findOne({
      where: { id },
      relations: ['defaultDriver'],
      withDeleted: includeDeleted,
    });

    if (!truck) {
      throw new NotFoundException(`Camión con ID ${id} no encontrado`);
    }

    return plainToInstance(TruckResponseDto, truck);
  }

  async update(id: string, dto: UpdateTruckDto): Promise<TruckResponseDto> {
    const truck = await this.truckRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['defaultDriver'],
    });

    if (!truck) {
      throw new NotFoundException(`Camión con ID ${id} no encontrado`);
    }

    if (dto.licensePlate && dto.licensePlate.trim().toUpperCase() !== truck.licensePlate) {
      const plateExists = await this.truckRepository.findOne({
        where: { licensePlate: dto.licensePlate.trim().toUpperCase() },
      });
      if (plateExists && plateExists.id !== id) {
        throw new ConflictException(`Ya existe otro camión con la placa ${dto.licensePlate}`);
      }
      truck.licensePlate = dto.licensePlate.trim().toUpperCase();
    }

    if (dto.defaultDriverId !== undefined) {
      if (dto.defaultDriverId === null || dto.defaultDriverId === '') {
        truck.defaultDriver = null;
      } else {
        const driver = await this.userRepository.findOne({
          where: { id: dto.defaultDriverId, deletedAt: IsNull() },
        });
        if (!driver) {
          throw new NotFoundException(`El piloto con ID ${dto.defaultDriverId} no existe`);
        }
        truck.defaultDriver = driver;
      }
    }

    if (dto.name !== undefined) truck.name = dto.name.trim();
    if (dto.brand !== undefined) truck.brand = dto.brand?.trim();
    if (dto.model !== undefined) truck.model = dto.model?.trim();
    if (dto.year !== undefined) truck.year = dto.year;
    if (dto.capacity !== undefined) truck.capacity = dto.capacity;
    if (dto.status !== undefined) truck.status = dto.status;
    if (dto.notes !== undefined) truck.notes = dto.notes;
    if (dto.isActive !== undefined) truck.isActive = dto.isActive;

    await this.truckRepository.save(truck);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const truck = await this.truckRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!truck) {
      throw new NotFoundException(`Camión con ID ${id} no encontrado`);
    }

    await this.truckRepository.softRemove(truck);
    return { message: 'Camión eliminado exitosamente' };
  }

  async restore(id: string): Promise<TruckResponseDto> {
    const truck = await this.truckRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['defaultDriver'],
    });

    if (!truck) {
      throw new NotFoundException(`Camión con ID ${id} no encontrado`);
    }

    if (!truck.deletedAt) {
      throw new ConflictException(`El camión con ID ${id} no está eliminado`);
    }

    truck.deletedAt = null;
    await this.truckRepository.save(truck);
    return this.findOne(id);
  }

  async search(query: string, includeDeleted: boolean = false): Promise<TruckResponseDto[]> {
    const queryBuilder = this.truckRepository
      .createQueryBuilder('truck')
      .leftJoinAndSelect('truck.defaultDriver', 'driver')
      .where(includeDeleted ? '1=1' : 'truck.deletedAt IS NULL')
      .andWhere(
        '(LOWER(truck.name) LIKE LOWER(:query) OR LOWER(truck.license_plate) LIKE LOWER(:query) OR LOWER(truck.brand) LIKE LOWER(:query) OR LOWER(truck.model) LIKE LOWER(:query))',
        { query: `%${query}%` },
      );

    if (includeDeleted) {
      queryBuilder.withDeleted();
    }

    queryBuilder.orderBy('truck.name', 'ASC');

    const trucks = await queryBuilder.getMany();
    return plainToInstance(TruckResponseDto, trucks);
  }

  async getStats(): Promise<{ total: number; active: number; maintenance: number; inactive: number }> {
    const total = await this.truckRepository.count({ where: { deletedAt: IsNull() } });
    const active = await this.truckRepository.count({ where: { status: TruckStatus.ACTIVE, deletedAt: IsNull() } });
    const maintenance = await this.truckRepository.count({ where: { status: TruckStatus.MAINTENANCE, deletedAt: IsNull() } });
    const inactive = await this.truckRepository.count({ where: { status: TruckStatus.INACTIVE, deletedAt: IsNull() } });

    return { total, active, maintenance, inactive };
  }
}
