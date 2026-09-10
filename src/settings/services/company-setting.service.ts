import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySetting } from '../entities/company-setting.entity';
import { UpdateCompanySettingDto } from '../dto/update-company-setting.dto';

@Injectable()
export class CompanySettingService implements OnModuleInit {
  constructor(
    @InjectRepository(CompanySetting)
    private readonly settingRepository: Repository<CompanySetting>,
  ) {}

  async onModuleInit() {
    const count = await this.settingRepository.count();
    if (count === 0) {
      const defaultSetting = this.settingRepository.create({
        companyName: 'CABEN CARNES Y EMBUTIDOS',
        address: 'Calle Ficticia 123, Ciudad',
        phone: '2222-3333',
        nit: '1234567-8',
      });
      await this.settingRepository.save(defaultSetting);
    }
  }

  async getSettings(): Promise<CompanySetting> {
    const settings = await this.settingRepository.find();
    if (settings.length > 0) {
      return settings[0];
    }
    const defaultSetting = this.settingRepository.create({
      companyName: 'CABEN CARNES Y EMBUTIDOS',
      address: 'Calle Ficticia 123, Ciudad',
      phone: '2222-3333',
      nit: '1234567-8',
    });
    return this.settingRepository.save(defaultSetting);
  }

  async updateSettings(dto: UpdateCompanySettingDto): Promise<CompanySetting> {
    const settings = await this.getSettings();
    Object.assign(settings, dto);
    return this.settingRepository.save(settings);
  }
}
