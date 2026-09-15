import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { Order } from '../orders/entities/order.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { IciciPaymentService } from './icici-payment.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentTransaction, Order, Cart, CartItem, Coupon]),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, IciciPaymentService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
