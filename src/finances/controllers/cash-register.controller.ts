import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CashRegisterService } from '../services/cash-register.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User as UserDecorator } from '../../common/decorators/user.decorator';
import {
  OpenCashRegisterDto,
  CloseCashRegisterDto,
  CashRegisterResponseDto,
} from '../dto/cash-register.dto';

@Controller('cash-registers')
@UseGuards(JwtAuthGuard)
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @Post('open')
  open(
    @Body() dto: OpenCashRegisterDto,
    @UserDecorator() user: any,
  ): Promise<CashRegisterResponseDto> {
    return this.cashRegisterService.open(dto, user.id);
  }

  @Get('status')
  getStatus(
    @UserDecorator() user: any,
  ): Promise<CashRegisterResponseDto | null> {
    return this.cashRegisterService.getStatus(user.id);
  }

  @Post('close/:id')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashRegisterDto,
    @UserDecorator() user: any,
  ): Promise<CashRegisterResponseDto> {
    return this.cashRegisterService.close(id, dto, user.id);
  }

  @Get('history')
  getHistory(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<CashRegisterResponseDto[]> {
    const sDate = startDate ? new Date(startDate) : undefined;
    const eDate = endDate ? new Date(endDate) : undefined;
    return this.cashRegisterService.getHistory(branchId, sDate, eDate);
  }
}
