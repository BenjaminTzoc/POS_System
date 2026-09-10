import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { CreateBankAccountDto, UpdateBankAccountDto } from '../dto/bank-account.dto';

@Injectable()
export class BankAccountService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
  ) {}

  async findAll() {
    return this.bankAccountRepository.find({ where: { isActive: true } });
  }

  async findOne(id: string) {
    const account = await this.bankAccountRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Cuenta bancaria con ID ${id} no encontrada`);
    }
    return account;
  }

  async create(dto: CreateBankAccountDto) {
    const existing = await this.bankAccountRepository.findOne({
      where: { accountNumber: dto.accountNumber },
    });
    if (existing) {
      throw new ConflictException(`La cuenta bancaria con número ${dto.accountNumber} ya está registrada`);
    }
    const account = this.bankAccountRepository.create(dto);
    return this.bankAccountRepository.save(account);
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    const account = await this.findOne(id);
    if (dto.accountNumber && dto.accountNumber !== account.accountNumber) {
      const existing = await this.bankAccountRepository.findOne({
        where: { accountNumber: dto.accountNumber },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`La cuenta bancaria con número ${dto.accountNumber} ya existe`);
      }
    }
    Object.assign(account, dto);
    return this.bankAccountRepository.save(account);
  }

  async remove(id: string) {
    const account = await this.findOne(id);
    account.isActive = false;
    await this.bankAccountRepository.save(account);
    return { message: 'Cuenta bancaria eliminada exitosamente' };
  }
}
