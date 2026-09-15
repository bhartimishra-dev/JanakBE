import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../company-profile/entities/company-profile.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderCleanupService } from './order-cleanup.service';
import { OrderItem } from './entities/order-item.entity';
import { OrderTracking } from './entities/order-tracking.entity';
import { Order } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Order, OrderItem, OrderTracking, CompanyProfile]),
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderCleanupService],
  exports: [OrdersService],
})
export class OrdersModule {}
