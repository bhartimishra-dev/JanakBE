import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../addresses/entities/address.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CompanyProfile } from '../company-profile/entities/company-profile.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderTracking } from '../orders/entities/order-tracking.entity';
import { Order } from '../orders/entities/order.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Cart, Address, Order, OrderItem, OrderTracking, Coupon, CompanyProfile]),
    NotificationsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
