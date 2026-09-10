import { Controller, Get, Post, Body, Param, Put, Delete, ParseUUIDPipe } from '@nestjs/common';
import { BankAccountService } from '../services/bank-account.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from '../dto/bank-account.dto';
import { Permissions } from 'src/auth/decorators';

@Controller('bank-accounts')
export class BankAccountController {
  constructor(private readonly bankAccountService: BankAccountService) {}

  @Get()
  findAll() {
    return this.bankAccountService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankAccountService.findOne(id);
  }

  @Post()
  @Permissions('payment-methods.manage')
  create(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountService.create(dto);
  }

  @Put(':id')
  @Permissions('payment-methods.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBankAccountDto) {
    return this.bankAccountService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('payment-methods.manage')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankAccountService.remove(id);
  }
}
