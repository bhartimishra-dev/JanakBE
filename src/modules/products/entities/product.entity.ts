import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockStatus } from '../../../common/enums/stock-status.enum';
import { Brand } from '../../brands/entities/brand.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductDocument } from './product-document.entity';
import { ProductImage } from './product-image.entity';
import { ProductReview } from './product-review.entity';
import { ProductSpec } from './product-spec.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  productCode: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true, length: 150 })
  headline: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  keySpecification: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  originalPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: StockStatus,
    default: StockStatus.IN_STOCK,
  })
  stockStatus: StockStatus;

  @Column({ nullable: true })
  modelNumber: string;

  /** GST HSN/SAC code — required on the tax invoice's line-item and HSN-summary tables. */
  @Column({ nullable: true })
  hsnCode: string;

  @Column({ nullable: true })
  salesRepName: string;

  @Column({ nullable: true })
  salesRepPhone: string;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: false })
  isNewArrival: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  showOnWebsite: boolean;

  @Column({ default: false })
  showOnApp: boolean;

  @ManyToOne(() => Category, (category) => category.products)
  @JoinColumn()
  category: Category;

  @ManyToOne(() => Brand)
  @JoinColumn()
  brand: Brand;

  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  images: ProductImage[];

  @OneToMany(() => ProductSpec, (spec) => spec.product, { cascade: true })
  specs: ProductSpec[];

  @OneToMany(() => ProductDocument, (doc) => doc.product, { cascade: true })
  documents: ProductDocument[];

  @OneToMany(() => ProductReview, (review) => review.product)
  reviews: ProductReview[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
