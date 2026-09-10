import { Body, Controller, Get, Put } from '@nestjs/common';
import { CompanySettingService } from '../services/company-setting.service';
import { CompanySetting } from '../entities/company-setting.entity';
import { UpdateCompanySettingDto } from '../dto/update-company-setting.dto';
import { Public } from 'src/auth/decorators';

@Controller('company-settings')
export class CompanySettingController {
  constructor(private readonly settingService: CompanySettingService) {}

  @Get()
  @Public()
  getSettings(): Promise<CompanySetting> {
    return this.settingService.getSettings();
  }

  @Put()
  @Public()
  updateSettings(@Body() dto: UpdateCompanySettingDto): Promise<CompanySetting> {
    return this.settingService.updateSettings(dto);
  }
}
