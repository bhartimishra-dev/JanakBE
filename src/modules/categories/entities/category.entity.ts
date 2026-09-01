import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  categoryCode: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  image: string;

  /**
   * @deprecated superseded by `image`. Kept (not dropped) so existing rows aren't
   * lost — AdminCategoriesService falls back to this when `image` is unset.
   */
  @Column({ nullable: true })
  icon: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  showOnWebsite: boolean;

  @Column({ default: false })
  showOnApp: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  /** Not persisted — populated via loadRelationCountAndMap when listing categories. */
  productQty?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
