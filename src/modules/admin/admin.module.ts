import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from '../brands/entities/brand.entity';
import { Cart } from '../cart/entities/cart.entity';
import { Category } from '../categories/entities/category.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrderTracking } from '../orders/entities/order-tracking.entity';
import { Order } from '../orders/entities/order.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { QuoteItem } from '../quotes/entities/quote-item.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductSpec } from '../products/entities/product-spec.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { ApiLog } from '../api-logs/entities/api-log.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminCouponsController } from './coupons/admin-coupons.controller';
import { AdminCouponsService } from './coupons/admin-coupons.service';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminOrdersService } from './orders/admin-orders.service';
import { AdminProductsController } from './products/admin-products.controller';
import { AdminProductsService } from './products/admin-products.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Product, ProductImage, ProductSpec, Category, Brand,
      Order, OrderItem, OrderTracking,
      Quote, QuoteItem,
      Coupon,
      User, ApiLog, Cart,
    ]),
    NotificationsModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminProductsController,
    AdminOrdersController,
    AdminCouponsController,
    AdminUsersController,
  ],
  providers: [
    AdminDashboardService,
    AdminProductsService,
    AdminOrdersService,
    AdminCouponsService,
    AdminUsersService,
  ],
})
export class AdminModule {}
