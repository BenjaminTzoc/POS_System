import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { QuotationService } from '../services/quotation.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User as UserDecorator } from 'src/common/decorators/user.decorator';
import { CreateQuotationDto, QuotationResponseDto, UpdateQuotationStatusDto } from '../dto';
import { QuotationStatus } from '../entities';
import type { Response } from 'express';

@Controller('quotations')
@UseGuards(JwtAuthGuard)
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Post()
  create(@Body() dto: CreateQuotationDto, @UserDecorator() user: any): Promise<QuotationResponseDto> {
    return this.quotationService.create(dto, user.id);
  }

  @Get()
  findAll(@Query('status') status?: QuotationStatus, @Query('customerId') customerId?: string, @Query('branchId') branchId?: string, @Query('search') search?: string): Promise<QuotationResponseDto[]> {
    return this.quotationService.findAll({
      status,
      customerId,
      branchId,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationResponseDto> {
    return this.quotationService.findOne(id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const buffer = await this.quotationService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=cotizacion-${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post(':id/send-email')
  async sendEmail(@Param('id', ParseUUIDPipe) id: string, @Body('email') email: string): Promise<{ message: string }> {
    await this.quotationService.sendQuotationEmail(id, email);
    return { message: 'Correo enviado exitosamente' };
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuotationStatusDto): Promise<QuotationResponseDto> {
    return this.quotationService.updateStatus(id, dto);
  }

  @Post(':id/convert')
  convert(@Param('id', ParseUUIDPipe) id: string, @UserDecorator() user: any): Promise<{ saleId: string }> {
    return this.quotationService.convertToSale(id, user.id);
  }
}
