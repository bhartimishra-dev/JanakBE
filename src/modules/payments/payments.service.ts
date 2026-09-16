import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentStage, PaymentStatus } from '../../common/enums/payment-method.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { User } from '../users/entities/user.entity';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Coupon } from '../coupons/entities/coupon.entity';
import { Order } from '../orders/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { IciciPaymentService } from './icici-payment.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private txnRepository: Repository<PaymentTransaction>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private cartItemRepository: Repository<CartItem>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    private iciciService: IciciPaymentService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Consumes the cart and the coupon used for this order — deliberately not
   * done at order-placement time (see checkout.service.ts) so a pending,
   * failed, or cancelled payment leaves the customer's cart exactly as it
   * was, instead of empty with nothing to show for it. Called only once the
   * advance payment has actually succeeded (gateway callback or NEFT
   * confirmation), which is the point the reservation actually "sticks."
   */
  private async finalizeOrderPayment(order: Order): Promise<void> {
    if (!order.user) return;

    const cart = await this.cartRepository.findOne({ where: { user: { id: order.user.id } } });
    if (cart) {
      await this.cartItemRepository.delete({ cart: { id: cart.id } });
      await this.cartRepository.update(cart.id, { coupon: null });
    }

    if (order.couponCode) {
      await this.couponRepository.update({ code: order.couponCode }, { isActive: false });
    }
  }

  async initiatePayment(user: User, dto: InitiatePaymentDto) {
    const order = await this.orderRepository.findOne({
      where: { orderId: dto.orderId, user: { id: user.id } },
    });

    if (!order) throw new NotFoundException('Order not found');

    const merchantTxnNo = `${Date.now()}${order.orderId.replace(/-/g, '')}`;
    const appUrl = this.configService.get<string>('APP_URL');
    const returnUrl = `${appUrl}/api/v1/payments/callback`;

    let request: Record<string, any>;
    let response: Record<string, any>;

    try {
      ({ request, response } = await this.iciciService.initiateSale({
        merchantTxnNo,
        amount: '100.00', // UAT test amount — ICICI minimum is ₹100, real amount: Number(order.advanceAmount).toFixed(2)
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerMobile: dto.customerMobile,
        returnUrl,
        addlParam1: dto.addlParam1,
        addlParam2: dto.addlParam2,
      }));
    } catch (err) {
      this.logger.error(`ICICI initiate failed — ${JSON.stringify(err.response?.data ?? err.message)}`);
      const iciciMsg = err.response?.data?.errorMsg ?? err.message;
      throw new BadRequestException(`Payment gateway error: ${iciciMsg}`);
    }

    this.logger.log(`ICICI response — code: ${response.responseCode}, tranCtx: ${response.tranCtx}, redirectURI: ${response.redirectURI}`);

    const txn = this.txnRepository.create({
      merchantTxnNo,
      tranCtx: response.tranCtx,
      status: PaymentStatus.PENDING,
      amount: order.advanceAmount,
      paymentStage: PaymentStage.ADVANCE,
      iciciRequest: request,
      iciciResponse: response,
      order,
      user,
    });
    await this.txnRepository.save(txn);

    if (response.responseCode !== 'R1000') {
      throw new BadRequestException(
        `Payment initiation failed: ${response.responseCode}`,
      );
    }

    const paymentUrl = `${response.redirectURI}?tranCtx=${response.tranCtx}`;

    return { paymentUrl, merchantTxnNo, tranCtx: response.tranCtx };
  }

  async handleCallback(payload: Record<string, any>) {
    this.logger.log(`Callback received — payload: ${JSON.stringify(payload)}`);
    const frontendUrl = this.configService.get<string>('PAYMENT_REDIRECT_URL') ?? this.configService.get<string>('FRONTEND_URL')?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const { merchantTxnNo } = payload;

    if (!merchantTxnNo) {
      this.logger.warn('Callback received without merchantTxnNo');
      return { success: false, redirectUrl: `${frontendUrl}/payment/failed` };
    }

    const txn = await this.txnRepository.findOne({
      where: { merchantTxnNo },
      relations: { order: { user: true } },
    });

    if (!txn) {
      this.logger.error(`Transaction not found for merchantTxnNo: ${merchantTxnNo}`);
      return { success: false, redirectUrl: `${frontendUrl}/payment/failed` };
    }

    const isSuccess =
      payload.txnStatus === 'SUC' ||
      payload.txnResponseCode === '0000' ||
      payload.responseCode === '0000';

    txn.status = isSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
    txn.iciciTxnId = payload.txnID;
    txn.iciciAuthId = payload.txnAuthID ?? payload.paymentID;
    txn.paymentMode = payload.paymentMode;
    txn.responseCode = payload.responseCode;
    txn.txnResponseCode = payload.txnResponseCode;
    txn.callbackPayload = payload;
    await this.txnRepository.save(txn);

    if (isSuccess) {
      // Small orders where the advance alone covers 100% (balanceAmount: 0)
      // have no NEFT balance step to ever trigger — without this, they'd
      // sit at advance_paid forever despite being fully paid, indistinguishable
      // by status from an order that genuinely still owes a balance.
      const isFullyPaid = Number(txn.order.balanceAmount) === 0;
      await this.orderRepository.update(txn.order.id, {
        status: isFullyPaid ? OrderStatus.BALANCE_PAID : OrderStatus.ADVANCE_PAID,
        advancePaid: true,
        ...(isFullyPaid ? { balancePaid: true } : {}),
        transactionId: payload.txnID,
      });

      await this.finalizeOrderPayment(txn.order);

      if (txn.order.user) {
        await this.notificationsService.create(txn.order.user, {
          title: isFullyPaid ? 'Payment Received — Order Fully Paid' : 'Advance Payment Received',
          message: isFullyPaid
            ? `Payment of ₹${Number(txn.amount).toFixed(2)} received in full for order ${txn.order.orderId}. Your order is confirmed.`
            : `Advance payment of ₹${Number(txn.amount).toFixed(2)} received for order ${txn.order.orderId}. Your order is confirmed.`,
          type: NotificationType.PAYMENT_CONFIRMED,
          orderId: txn.order.orderId,
          metadata: { amount: txn.amount, transactionId: payload.txnID },
        });
      }
    } else {
      await this.cancelOrderForFailedPayment(txn.order);
    }

    this.logger.log(
      `Callback processed — txn: ${merchantTxnNo}, status: ${txn.status}`,
    );

    const orderId = txn.order.orderId;
    const redirectUrl = isSuccess
      ? `${frontendUrl}/payment/callback?status=success&orderId=${orderId}&txnId=${payload.txnID ?? ''}`
      : `${frontendUrl}/payment/callback?status=failed&orderId=${orderId}&code=${payload.txnResponseCode ?? ''}`;

    return { success: isSuccess, redirectUrl };
  }

  // NB: NEFT advance/balance confirmation is handled by AdminOrdersService
  // (PATCH /admin/orders/:id/confirm-advance-neft / confirm-balance-neft) —
  // this class doesn't need its own copies of that logic.

  async checkStatus(merchantTxnNo: string, user: User) {
    const txn = await this.txnRepository.findOne({
      where: { merchantTxnNo, user: { id: user.id } },
      relations: { order: { user: true } },
    });

    if (!txn) throw new NotFoundException('Transaction not found');

    const iciciStatus = await this.iciciService.checkStatus(merchantTxnNo);

    if (iciciStatus.txnStatus) {
      const isSuccess = iciciStatus.txnStatus === 'SUC';
      txn.status = isSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      txn.responseCode = iciciStatus.responseCode;
      txn.txnResponseCode = iciciStatus.txnResponseCode;
      await this.txnRepository.save(txn);
      if (!isSuccess) {
        await this.cancelOrderForFailedPayment(txn.order);
      }
    }

    return { localStatus: txn.status, iciciResponse: iciciStatus };
  }

  /**
   * Marks an order CANCELLED after its advance-payment attempt definitively
   * failed — previously nothing happened to the order at all on failure, so
   * it just sat at pending_advance_payment forever with no way for the
   * customer to tell it hadn't gone through short of trying to pay again.
   *
   * Guarded to only act while the order is still pending_advance_payment, so
   * a stale/duplicate/out-of-order failure callback (a well-known payment
   * gateway integration hazard) can never downgrade an order that a *later*
   * retry attempt already paid successfully.
   */
  private async cancelOrderForFailedPayment(order: Order): Promise<void> {
    if (order.status !== OrderStatus.PENDING_ADVANCE_PAYMENT) return;

    await this.orderRepository.update(order.id, { status: OrderStatus.CANCELLED });

    if (order.user) {
      await this.notificationsService.create(order.user, {
        title: 'Payment Failed — Order Cancelled',
        message: `Your advance payment for order ${order.orderId} could not be completed, so the order has been cancelled. Please place a new order to try again.`,
        type: NotificationType.PAYMENT_FAILED,
        orderId: order.orderId,
      });
    }
  }

  async getMyTransactions(user: User) {
    return this.txnRepository.find({
      where: { user: { id: user.id } },
      relations: { order: true },
      order: { createdAt: 'DESC' },
    });
  }
}
