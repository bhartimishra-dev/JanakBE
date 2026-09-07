import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from '../cart/entities/cart.entity';
import { Coupon } from './entities/coupon.entity';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [TypeOrmModule.forFeature([Coupon, Cart])],
  controllers: [CouponsController],
  providers: [CouponsService],
  exports: [TypeOrmModule],
})
export class CouponsModule {}
