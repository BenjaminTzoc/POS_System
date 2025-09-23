import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { PaymentMethodService } from '../services/payment-method.service';
import { CreatePaymentMethodDto, PaymentMethodResponseDto, UpdatePaymentMethodDto } from '../dto';
import { Public } from 'src/auth/decorators';

@Controller('payment-methods')
export class PaymentMethodController {
  constructor(
    private readonly paymentMethodService: PaymentMethodService,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.create(dto);
  }

  @Get()
  @Public()
  findAll(): Promise<PaymentMethodResponseDto[]> {
    return this.paymentMethodService.findAll();
  }

  @Get('code/:code')
  @Public()
  findByCode(@Param('code') code: string): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.findByCode(code);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.findOne(id);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.update(id, dto);
  }

  @Delete(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.paymentMethodService.remove(id);
  }

  @Patch(':id/restore')
  @Public()
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.restore(id);
  }
}
