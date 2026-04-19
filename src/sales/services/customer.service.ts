import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Customer } from '../entities';
import { IsNull, Repository } from 'typeorm';
import { CustomerCategoryService } from '.';
import { CreateCustomerDto, CustomerResponseDto, UpdateCustomerDto } from '../dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly customerCategoryService: CustomerCategoryService,
  ) {}

  async getOrCreateConsumidorFinal(): Promise<Customer> {
    let customer = await this.customerRepository.findOne({
      where: { nit: 'C/F' },
      withDeleted: false,
    });

    if (!customer) {
      const categories = await this.customerCategoryService.findAll();
      const defaultCategory = categories.length > 0 ? categories[0] : null;

      customer = this.customerRepository.create({
        name: 'Consumidor Final',
        nit: 'C/F',
        address: 'Ciudad',
        loyaltyPoints: 0,
        totalPurchases: 0,
        creditLimit: defaultCategory?.defaultCreditLimit || 0,
        category: defaultCategory ? ({ id: defaultCategory.id } as any) : null,
      });
      customer = await this.customerRepository.save(customer);
    }

    return customer;
  }

  async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    const existingNit = await this.customerRepository.findOne({
      where: { nit: dto.nit },
      withDeleted: false,
    });

    if (existingNit) {
      throw new ConflictException(`El NIT ${dto.nit} ya está registrado`);
    }

    let category: any = null;

    if (dto.categoryId) {
      try {
        category = await this.customerCategoryService.findOne(dto.categoryId);
      } catch (error) {
        throw new BadRequestException(`La categoría de cliente con ID ${dto.categoryId} no existe`);
      }
    }

    const customer = this.customerRepository.create({
      name: dto.name,
      nit: dto.nit,
      contactName: dto.contactName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      loyaltyPoints: dto.loyaltyPoints || 0,
      creditLimit: dto.creditLimit ?? (category?.defaultCreditLimit || 0),
      category: category,
    });

    const savedCustomer = await this.customerRepository.save(customer);
    return plainToInstance(CustomerResponseDto, savedCustomer);
  }

  async findAll(includeDeleted: boolean = false): Promise<CustomerResponseDto[]> {
    const customers = await this.customerRepository.find({
      where: includeDeleted ? {} : { deletedAt: IsNull() },
      withDeleted: includeDeleted,
      relations: ['category'],
      order: { name: 'ASC' },
    });
    return plainToInstance(CustomerResponseDto, customers);
  }

  async findOne(id: string, includeDeleted: boolean = false): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id, deletedAt: includeDeleted ? undefined : IsNull() },
      withDeleted: includeDeleted,
      relations: ['category'],
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }

    return plainToInstance(CustomerResponseDto, customer);
  }

  async findByNit(nit: string, includeDeleted: boolean = false): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { nit, deletedAt: includeDeleted ? undefined : IsNull() },
      withDeleted: includeDeleted,
      relations: ['category'],
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con NIT ${nit} no encontrado`);
    }

    return plainToInstance(CustomerResponseDto, customer);
  }

  async findByCategory(categoryId: string, includeDeleted: boolean = false): Promise<CustomerResponseDto[]> {
    const customers = await this.customerRepository.find({
      where: {
        category: { id: categoryId },
        deletedAt: includeDeleted ? undefined : IsNull(),
      },
      withDeleted: includeDeleted,
      relations: ['category'],
      order: { name: 'ASC' },
    });
    return plainToInstance(CustomerResponseDto, customers);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['category'],
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }

    if (dto.nit && dto.nit !== customer.nit) {
      const existingNit = await this.customerRepository.findOne({
        where: { nit: dto.nit, deletedAt: IsNull() },
      });

      if (existingNit) {
        throw new ConflictException(`El NIT ${dto.nit} ya está registrado`);
      }
    }

    let category: any = customer.category;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        category = null;
      } else {
        try {
          category = await this.customerCategoryService.findOne(dto.categoryId);
        } catch (error) {
          throw new BadRequestException(`La categoría de cliente con ID ${dto.categoryId} no existe`);
        }
      }
    }

    let finalCreditLimit = dto.creditLimit ?? customer.creditLimit;
    if (dto.categoryId !== undefined && dto.creditLimit === undefined && category) {
      if (!customer.category || customer.category.id !== category.id) {
        finalCreditLimit = category.defaultCreditLimit || 0;
      }
    }

    Object.assign(customer, {
      name: dto.name ?? customer.name,
      nit: dto.nit ?? customer.nit,
      contactName: dto.contactName ?? customer.contactName,
      email: dto.email ?? customer.email,
      phone: dto.phone ?? customer.phone,
      address: dto.address ?? customer.address,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : customer.birthDate,
      loyaltyPoints: dto.loyaltyPoints ?? customer.loyaltyPoints,
      creditLimit: finalCreditLimit,
      category: category,
    });

    const updatedCustomer = await this.customerRepository.save(customer);
    return plainToInstance(CustomerResponseDto, updatedCustomer);
  }

  async remove(id: string): Promise<{ message: string }> {
    const customer = await this.customerRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['sales'],
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }

    if (customer.sales && customer.sales.length > 0) {
      throw new ConflictException('No se puede eliminar el cliente porque tiene ventas asociadas');
    }

    await this.customerRepository.softRemove(customer);
    return { message: 'Cliente eliminado exitosamente' };
  }

  async restore(id: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['category'],
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }

    if (!customer.deletedAt) {
      throw new ConflictException(`El cliente con ID ${id} no está eliminado`);
    }

    customer.deletedAt = null;
    const restoredCustomer = await this.customerRepository.save(customer);
    return plainToInstance(CustomerResponseDto, restoredCustomer);
  }

  async searchCustomers(query: string, includeDeleted: boolean = false): Promise<CustomerResponseDto[]> {
    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.category', 'category')
      .where(includeDeleted ? '1=1' : 'customer.deletedAt IS NULL')
      .andWhere('(customer.name ILIKE :query OR customer.nit ILIKE :query OR customer.contactName ILIKE :query OR customer.email ILIKE :query)', { query: `%${query}%` })
      .orderBy('customer.name', 'ASC');

    if (includeDeleted) {
      queryBuilder.withDeleted();
    }

    const customers = await queryBuilder.getMany();

    return plainToInstance(CustomerResponseDto, customers);
  }

  async addLoyaltyPoints(customerId: string, points: number): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${customerId} no encontrado`);
    }

    if (points <= 0) {
      throw new BadRequestException('Los puntos de lealtad deben ser mayores a 0');
    }

    customer.loyaltyPoints += points;
    const updatedCustomer = await this.customerRepository.save(customer);

    await this.recalculateCustomerCategory(updatedCustomer.id);

    return plainToInstance(CustomerResponseDto, updatedCustomer);
  }

  async redeemLoyaltyPoints(customerId: string, points: number): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${customerId} no encontrado`);
    }

    if (points <= 0) {
      throw new BadRequestException('Los puntos a redimir deben ser mayores a 0');
    }

    if (customer.loyaltyPoints < points) {
      throw new BadRequestException('El cliente no tiene suficientes puntos para redimir');
    }

    customer.loyaltyPoints -= points;
    const updatedCustomer = await this.customerRepository.save(customer);
    return plainToInstance(CustomerResponseDto, updatedCustomer);
  }

  async updatePurchaseStats(customerId: string, amount: number): Promise<void> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente con ID ${customerId} no encontrado`);
    }

    customer.totalPurchases = Number(customer.totalPurchases) + Number(amount);
    customer.lastPurchaseDate = new Date();

    await this.customerRepository.save(customer);

    await this.recalculateCustomerCategory(customerId);
  }

  async getCustomerStats(): Promise<{
    total: number;
    withCategory: number;
    withoutCategory: number;
    deleted: number;
    totalLoyaltyPoints: number;
  }> {
    const customers = await this.customerRepository.find({
      where: { deletedAt: IsNull() },
    });

    const stats = {
      total: customers.length,
      withCategory: 0,
      withoutCategory: 0,
      deleted: 0,
      totalLoyaltyPoints: 0,
    };

    customers.forEach((customer) => {
      stats.totalLoyaltyPoints += customer.loyaltyPoints;

      if (customer.category) {
        stats.withCategory++;
      } else {
        stats.withoutCategory++;
      }
    });

    const totalCount = await this.customerRepository.count();
    stats.deleted = totalCount - customers.length;

    return stats;
  }

  private async recalculateCustomerCategory(customerId: string): Promise<void> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() },
      relations: ['category'],
    });

    if (!customer) return;

    const appropriateCategory = await this.customerCategoryService.findCategoryByPurchaseAmount(customer.totalPurchases);

    if (appropriateCategory && (!customer.category || customer.category.id !== appropriateCategory.id)) {
      if (Number(customer.creditLimit) < Number(appropriateCategory.defaultCreditLimit)) {
        customer.creditLimit = appropriateCategory.defaultCreditLimit;
      }

      customer.category = { id: appropriateCategory.id } as any;
      await this.customerRepository.save(customer);
    }
  }

  async getTopCustomers(limit: number = 10): Promise<CustomerResponseDto[]> {
    const customers = await this.customerRepository.createQueryBuilder('customer').leftJoinAndSelect('customer.category', 'category').where('customer.deletedAt IS NULL').orderBy('customer.totalPurchases', 'DESC').addOrderBy('customer.loyaltyPoints', 'DESC').limit(limit).getMany();

    return plainToInstance(CustomerResponseDto, customers);
  }
}
