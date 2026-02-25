import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';

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
}
