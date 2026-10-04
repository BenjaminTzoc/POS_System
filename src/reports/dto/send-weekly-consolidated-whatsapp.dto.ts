import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendWeeklyConsolidatedWhatsAppDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  pdfBase64?: string;
}
