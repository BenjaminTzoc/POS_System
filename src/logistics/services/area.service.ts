import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Area } from '../entities';
import { CreateAreaDto, UpdateAreaDto, AreaResponseDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AreaService {
  constructor(
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
  ) {}

  async create(createAreaDto: CreateAreaDto): Promise<AreaResponseDto> {
    const area = this.areaRepository.create({
      ...createAreaDto,
      previousArea: createAreaDto.previousAreaId ? { id: createAreaDto.previousAreaId } : undefined,
    });
    const savedArea = await this.areaRepository.save(area);
    return plainToInstance(AreaResponseDto, savedArea);
  }

  async findAll(includeDeleted: boolean = false): Promise<AreaResponseDto[]> {
    const areas = await this.areaRepository.find({
      where: includeDeleted ? {} : { deletedAt: IsNull() },
      relations: ['previousArea'],
      withDeleted: includeDeleted,
    });
    return plainToInstance(AreaResponseDto, areas);
  }

  async findOne(id: string, includeDeleted: boolean = false): Promise<AreaResponseDto> {
    const area = await this.areaRepository.findOne({
      where: { id },
      relations: ['previousArea'],
      withDeleted: includeDeleted,
    });
    if (!area) {
      throw new NotFoundException(`Área con ID ${id} no encontrada`);
    }
    return plainToInstance(AreaResponseDto, area);
  }

  async update(id: string, updateAreaDto: UpdateAreaDto): Promise<AreaResponseDto> {
    const area = await this.findOne(id);
    const updatedArea = await this.areaRepository.save({
      ...area,
      ...updateAreaDto,
      previousArea: updateAreaDto.previousAreaId ? { id: updateAreaDto.previousAreaId } : (area as any).previousArea,
    });
    return plainToInstance(AreaResponseDto, updatedArea);
  }

  async remove(id: string): Promise<{ message: string }> {
    const area = await this.findOne(id);
    try {
      await this.areaRepository.delete(id);
    } catch (error) {
      if ((error as { code?: string })?.code === '23503') {
        throw new ConflictException('No se puede eliminar el área porque está siendo usada');
      }
      throw error;
    }
    return { message: 'Área eliminada exitosamente' };
  }

  async findNextArea(currentAreaId: string): Promise<Area | null> {
    return await this.areaRepository.findOne({
      where: { previousArea: { id: currentAreaId } },
    });
  }
}
