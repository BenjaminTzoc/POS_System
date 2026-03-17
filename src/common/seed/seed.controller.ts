import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { SeedService } from './seed.service';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('reset')
  @Public() // Hacemos este endpoint público inicialmente para que puedas resetear si pierdes acceso
  async reset() {
    return this.seedService.resetAndSeed();
  }
}
