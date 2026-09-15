import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Order } from './entities/order.entity';

@Injectable()
export class OrderCleanupService {
  private readonly logger = new Logger(OrderCleanupService.name);

  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  /**
   * Auto-cancels orders that have sat at pending_advance_payment for too
   * long with no payment attempt ever completed — previously these piled up
   * forever with no way to distinguish an abandoned checkout from one still
   * in progress (a payment that actually fails is handled separately, and
   * immediately, in PaymentsService.cancelOrderForFailedPayment — this job
   * only catches the "never even tried" case).
   *
   * Timeout is configurable via ORDER_ABANDON_TIMEOUT_HOURS (default 24h)
   * since the right value depends on how long this business wants to give
   * customers to complete the advance payment before releasing the order.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cancelAbandonedOrders(): Promise<void> {
    const timeoutHours = Number(this.configService.get('ORDER_ABANDON_TIMEOUT_HOURS', '24'));
    const cutoff = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);

    const stale = await this.ordersRepository.find({
      where: { status: OrderStatus.PENDING_ADVANCE_PAYMENT, createdAt: LessThan(cutoff) },
      relations: { user: true },
    });

    if (!stale.length) return;

    this.logger.log(`Auto-cancelling ${stale.length} abandoned order(s) older than ${timeoutHours}h`);

    for (const order of stale) {
      await this.ordersRepository.update(order.id, { status: OrderStatus.CANCELLED });
      if (order.user) {
        await this.notificationsService.create(order.user, {
          title: 'Order Cancelled',
          message: `Your order ${order.orderId} was cancelled because the advance payment wasn't completed within ${timeoutHours} hours. Please place a new order to try again.`,
          type: NotificationType.PAYMENT_FAILED,
          orderId: order.orderId,
        });
      }
    }
  }
}
