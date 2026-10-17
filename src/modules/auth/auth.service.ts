import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { CartService } from '../cart/cart.service';
import { RedisService } from '../../common/services/redis.service';
import { MailService } from '../../common/services/mail.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly redisPrefix: string;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private cartService: CartService,
    private redisService: RedisService,
    private mailService: MailService,
  ) {
    this.redisPrefix = this.configService.get<string>('NODE_ENV', 'development');
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');
    if (await this.usersRepository.exists({ where: { phone: dto.phone } })) {
      throw new ConflictException('Phone number already in use');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      email: dto.email,
      password: hashed,
      phone: dto.phone,
      role: UserRole.CUSTOMER,
    });
    await this.usersRepository.save(user);
    const result = await this.login(user);
    if (dto.guestToken) await this.mergeGuestCartIfValid(dto.guestToken, user);
    return result;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { email },
      select: { id: true, email: true, phone: true, password: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    return user;
  }

  async login(user: User, guestToken?: string) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    if (guestToken) await this.mergeGuestCartIfValid(guestToken, user);

    return {
      accessToken, // used by controller to set cookie, not returned to client
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  private async mergeGuestCartIfValid(guestToken: string, user: User): Promise<void> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(guestToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });
      if (payload.role === UserRole.GUEST && payload.sub) {
        await this.cartService.mergeGuestCart(payload.sub, user);
      }
    } catch {
      // invalid or expired guest token — skip merge silently
    }
  }

  async logout(token: string) {
    const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
    await this.redisService.set(`${this.redisPrefix}:blacklist:${token}`, '1', ONE_YEAR_SECONDS);
    return { message: 'Logged out successfully' };
  }

  async guestLogin() {
    const guestId = randomUUID();
    const payload = { sub: guestId, email: 'guest', role: UserRole.GUEST };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, guestId, user: { role: UserRole.GUEST } };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) return; // don't reveal if email exists

    const token = randomUUID();
    await this.redisService.set(`${this.redisPrefix}:reset:${token}`, user.id, 15 * 60); // 15 minutes
    await this.mailService.sendPasswordReset(email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.redisService.get(`${this.redisPrefix}:reset:${token}`);
    if (!userId) throw new BadRequestException('Invalid or expired reset token');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(userId, { password: hashed });
    await this.redisService.del(`${this.redisPrefix}:reset:${token}`);
  }

  getMe(user: User) {
    if ((user as any).role === UserRole.GUEST) throw new UnauthorizedException('Guests do not have a profile');
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
  }
}
