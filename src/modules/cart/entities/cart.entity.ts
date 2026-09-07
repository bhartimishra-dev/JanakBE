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
import { Coupon } from '../../coupons/entities/coupon.entity';
import { User } from '../../users/entities/user.entity';
import { CartItem } from './cart-item.entity';
import { SavedItem } from './saved-item.entity';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: true } as any)
  @JoinColumn()
  user: User | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  guestId: string | null;

  /**
   * The coupon currently applied to this cart, if any. Persisted so a plain
   * `GET /cart` (and every item add/update/remove, which all re-read the
   * cart) keeps reflecting the discount — previously `POST /cart/coupon`
   * computed a discount for its own response only and never saved it, so any
   * later cart read silently reverted to discountAmount: 0.
   */
  @ManyToOne(() => Coupon, { nullable: true, onDelete: 'SET NULL' } as any)
  @JoinColumn()
  coupon: Coupon | null;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true })
  items: CartItem[];

  @OneToMany(() => SavedItem, (item) => item.cart, { cascade: true })
  savedItems: SavedItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
