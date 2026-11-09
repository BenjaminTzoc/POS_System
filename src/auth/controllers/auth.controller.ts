import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto';
import { Public } from '../decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('token')
  @HttpCode(HttpStatus.OK)
  token(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.issueToken(dto);
  }
}
