import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SalesRepEnquiryStatus } from '../../../common/enums/sales-rep-enquiry-status.enum';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per "Contact sales rep" click on a product. Product, sales-rep and
 * customer details are snapshotted at click time so the record stays accurate
 * even if the product is later edited or deleted.
 */
@Entity('sales_rep_enquiries')
export class SalesRepEnquiry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  product: Product | null;

  @Column()
  productName: string;

  @Column({ type: 'varchar', nullable: true })
  productCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  modelNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  brandName: string | null;

  @Column({ type: 'varchar', nullable: true })
  categoryName: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price: number | null;

  @Column({ type: 'varchar', nullable: true })
  salesRepName: string | null;

  @Column({ type: 'varchar', nullable: true })
  salesRepPhone: string | null;

  /** Logged-in customer who clicked; null for guests/anonymous visitors. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  user: User | null;

  /** Guest JWT subject, so repeat clicks from the same guest can be grouped. */
  @Column({ type: 'varchar', nullable: true })
  guestId: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerPhone: string | null;

  @Column({
    type: 'enum',
    enum: SalesRepEnquiryStatus,
    default: SalesRepEnquiryStatus.NEW,
  })
  status: SalesRepEnquiryStatus;

  /** Internal notes from the admin team — never shown to the customer. */
  @Column({ type: 'text', nullable: true })
  adminNotes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
