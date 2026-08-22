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
    private iciciService: IciciPaymentService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

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
    const frontendUrl = this.configService.get<string>('FRONTEND_URL')?.split(',')[0]?.trim() ?? 'http://localhost:3000';
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
      await this.orderRepository.update(txn.order.id, {
        status: OrderStatus.ADVANCE_PAID,
        advancePaid: true,
        transactionId: payload.txnID,
      });

      if (txn.order.user) {
        await this.notificationsService.create(txn.order.user, {
          title: 'Advance Payment Received',
          message: `Advance payment of ₹${Number(txn.amount).toFixed(2)} received for order ${txn.order.orderId}. Your order is confirmed.`,
          type: NotificationType.PAYMENT_CONFIRMED,
          orderId: txn.order.orderId,
          metadata: { amount: txn.amount, transactionId: payload.txnID },
        });
      }
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

  async confirmNeftAdvance(orderId: string, neftRef: string, adminUser: User) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { user: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    order.advancePaid = true;
    order.neftReferenceNumber = neftRef;
    order.status = OrderStatus.ADVANCE_PAID;
    await this.orderRepository.save(order);

    if (order.user) {
      await this.notificationsService.create(order.user, {
        title: 'Advance Payment Confirmed',
        message: `Your NEFT advance payment of ₹${Number(order.advanceAmount).toFixed(2)} for order ${order.orderId} has been confirmed. UTR: ${neftRef}`,
        type: NotificationType.PAYMENT_CONFIRMED,
        orderId: order.orderId,
        metadata: { amount: order.advanceAmount, neftReferenceNumber: neftRef },
      });
    }

    return order;
  }

  async confirmNeftBalance(orderId: string, neftRef: string, adminUser: User) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { user: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    order.balancePaid = true;
    order.balanceNeftReferenceNumber = neftRef;
    order.status = OrderStatus.BALANCE_PAID;
    await this.orderRepository.save(order);

    if (order.user) {
      await this.notificationsService.create(order.user, {
        title: 'Balance Payment Confirmed',
        message: `Your balance payment of ₹${Number(order.balanceAmount).toFixed(2)} for order ${order.orderId} has been confirmed. UTR: ${neftRef}. Your order will be shipped soon.`,
        type: NotificationType.PAYMENT_CONFIRMED,
        orderId: order.orderId,
        metadata: { amount: order.balanceAmount, balanceNeftReferenceNumber: neftRef },
      });
    }

    return order;
  }

  async checkStatus(merchantTxnNo: string, user: User) {
    const txn = await this.txnRepository.findOne({
      where: { merchantTxnNo, user: { id: user.id } },
    });

    if (!txn) throw new NotFoundException('Transaction not found');

    const iciciStatus = await this.iciciService.checkStatus(merchantTxnNo);

    if (iciciStatus.txnStatus) {
      const isSuccess = iciciStatus.txnStatus === 'SUC';
      txn.status = isSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      txn.responseCode = iciciStatus.responseCode;
      txn.txnResponseCode = iciciStatus.txnResponseCode;
      await this.txnRepository.save(txn);
    }

    return { localStatus: txn.status, iciciResponse: iciciStatus };
  }

  async getMyTransactions(user: User) {
    return this.txnRepository.find({
      where: { user: { id: user.id } },
      relations: { order: true },
      order: { createdAt: 'DESC' },
    });
  }
}
