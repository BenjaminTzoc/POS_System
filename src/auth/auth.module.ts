import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission, Role, User } from './entities';
import { AuthService } from './auth.service';
import {
  PermissionsController,
  RolesController,
  UsersController,
} from './controllers';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { Branch } from 'src/logistics/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Permission, Role, User, Branch]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
  controllers: [PermissionsController, RolesController, UsersController],
})
export class AuthModule {}
