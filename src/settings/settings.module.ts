import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanySetting } from './entities/company-setting.entity';
import { CompanySettingService } from './services/company-setting.service';
import { CompanySettingController } from './controllers/company-setting.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompanySetting])],
  controllers: [CompanySettingController],
  providers: [CompanySettingService],
  exports: [CompanySettingService],
})
export class SettingsModule {}
