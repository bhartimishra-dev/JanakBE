import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CouponDiscountType } from '../../../common/enums/coupon-discount-type.enum';
import { Product } from '../../products/entities/product.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { User } from '../../users/entities/user.entity';

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'enum', enum: CouponDiscountType, default: CouponDiscountType.PERCENTAGE })
  discountType: CouponDiscountType;

  /**
   * Meaning depends on discountType: percent (0-100) for PERCENTAGE, ₹ amount for FLAT.
   * For FREE_ITEM, this holds the additionalDiscountType amount (unused when that's unset).
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  discountValue: number;

  /** Kept for backward compatibility with existing percentage-only coupons/reads. */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent: number;

  /** Caps the computed discount amount for PERCENTAGE (and FREE_ITEM + percentage add-on) coupons. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxDiscountAmount: number;

  /** Optional flat/percentage discount stacked on top of a FREE_ITEM coupon. Null/unset means none. */
  @Column({ type: 'enum', enum: CouponDiscountType, nullable: true })
  additionalDiscountType: CouponDiscountType;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  minimumOrderValue: number;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn()
  freeProduct: Product;

  /** Public coupons are usable by anyone; non-public ones are scoped to a single quote/customer. */
  @Column({ default: true })
  isPublic: boolean;

  @ManyToOne(() => Quote, { nullable: true })
  @JoinColumn()
  quote: Quote;

  /** Restricts usage to this customer only — set automatically for quote-linked coupons. */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
