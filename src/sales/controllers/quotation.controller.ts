import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { QuotationService } from '../services/quotation.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { User as UserDecorator } from 'src/common/decorators/user.decorator';
import { CreateQuotationDto, QuotationResponseDto, UpdateQuotationStatusDto } from '../dto';
import { QuotationStatus } from '../entities';

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

  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuotationStatusDto): Promise<QuotationResponseDto> {
    return this.quotationService.updateStatus(id, dto);
  }

  @Post(':id/convert')
  convert(@Param('id', ParseUUIDPipe) id: string, @UserDecorator() user: any): Promise<{ saleId: string }> {
    return this.quotationService.convertToSale(id, user.id);
  }
}
