import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from '../../../common/enums/order-status.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';
import { OrderTracking } from './order-tracking.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  orderId: string; // JP-YYYY-NNNNN

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gstAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  shippingAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ nullable: true })
  couponCode: string;

  /**
   * Absolute URL of the invoice PDF generated and stored at order-placement
   * time — an immutable historical record, not regenerated on every
   * download. Null for orders placed before this existed; the download
   * endpoint falls back to generating (and backfilling) one on first request.
   */
  @Column({ nullable: true })
  invoiceUrl: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ type: 'jsonb' })
  shippingAddress: Record<string, string>;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  transactionId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  advanceAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balanceAmount: number;

  @Column({ default: false })
  advancePaid: boolean;

  @Column({ default: false })
  balancePaid: boolean;

  @Column({ nullable: true })
  neftReferenceNumber: string;

  @Column({ nullable: true })
  balanceNeftReferenceNumber: string;

  @Column({ default: false })
  requiresGstBill: boolean;

  @Column({ nullable: true })
  salesRepName: string;

  @Column({ nullable: true })
  salesRepPhone: string;

  @Column({ nullable: true })
  estimatedDeliveryStart: Date;

  @Column({ nullable: true })
  estimatedDeliveryEnd: Date;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToOne(() => OrderTracking, (tracking) => tracking.order, {
    cascade: true,
  })
  tracking: OrderTracking;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
