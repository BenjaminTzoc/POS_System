import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentMethod } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { CreatePaymentMethodDto, PaymentMethodResponseDto, UpdatePaymentMethodDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PaymentMethodService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    // Verificar si el nombre ya existe
    const existingName = await this.paymentMethodRepository.findOne({
      where: { name: dto.name },
      withDeleted: false,
    });

    if (existingName) {
      throw new ConflictException(`El método de pago '${dto.name}' ya existe`);
    }

    // Verificar si el código ya existe
    const existingCode = await this.paymentMethodRepository.findOne({
      where: { code: dto.code },
      withDeleted: false,
    });

    if (existingCode) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso`);
    }

    const paymentMethod = this.paymentMethodRepository.create(dto);
    const savedPaymentMethod = await this.paymentMethodRepository.save(paymentMethod);
    return plainToInstance(PaymentMethodResponseDto, savedPaymentMethod);
  }

  async findAll(): Promise<PaymentMethodResponseDto[]> {
    const paymentMethods = await this.paymentMethodRepository.find({
      where: { deletedAt: IsNull() },
      order: { name: 'ASC' },
    });
    return plainToInstance(PaymentMethodResponseDto, paymentMethods);
  }
  
  async findOne(id: string): Promise<PaymentMethodResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!paymentMethod) {
      throw new NotFoundException(`Método de pago con ID ${id} no encontrado`);
    }

    return plainToInstance(PaymentMethodResponseDto, paymentMethod);
  }

  async findByCode(code: string): Promise<PaymentMethodResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { code, deletedAt: IsNull() },
    });

    if (!paymentMethod) {
      throw new NotFoundException(`Método de pago con código ${code} no encontrado`);
    }

    return plainToInstance(PaymentMethodResponseDto, paymentMethod);
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!paymentMethod) {
      throw new NotFoundException(`Método de pago con ID ${id} no encontrado`);
    }

    // Verificar si el nuevo nombre ya existe
    if (dto.name && dto.name !== paymentMethod.name) {
      const existingName = await this.paymentMethodRepository.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });

      if (existingName) {
        throw new ConflictException(`El método de pago '${dto.name}' ya existe`);
      }
    }

    // Verificar si el nuevo código ya existe
    if (dto.code && dto.code !== paymentMethod.code) {
      const existingCode = await this.paymentMethodRepository.findOne({
        where: { code: dto.code, deletedAt: IsNull() },
      });

      if (existingCode) {
        throw new ConflictException(`El código '${dto.code}' ya está en uso`);
      }
    }

    Object.assign(paymentMethod, dto);
    const updatedPaymentMethod = await this.paymentMethodRepository.save(paymentMethod);
    return plainToInstance(PaymentMethodResponseDto, updatedPaymentMethod);
  }

  async remove(id: string): Promise<{ message: string }> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['payments'],
    });

    if (!paymentMethod) {
      throw new NotFoundException(`Método de pago con ID ${id} no encontrado`);
    }

    // Verificar si el método de pago tiene pagos asociados
    if (paymentMethod.payments && paymentMethod.payments.length > 0) {
      throw new ConflictException(
        'No se puede eliminar el método de pago porque tiene pagos asociados',
      );
    }

    await this.paymentMethodRepository.softRemove(paymentMethod);
    return { message: 'Método de pago eliminado exitosamente' };
  }

  async restore(id: string): Promise<PaymentMethodResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!paymentMethod) {
      throw new NotFoundException(`Método de pago con ID ${id} no encontrado`);
    }

    if (!paymentMethod.deletedAt) {
      throw new ConflictException(`El método de pago con ID ${id} no está eliminado`);
    }

    paymentMethod.deletedAt = null;
    const restoredPaymentMethod = await this.paymentMethodRepository.save(paymentMethod);
    return plainToInstance(PaymentMethodResponseDto, restoredPaymentMethod);
  }
}
