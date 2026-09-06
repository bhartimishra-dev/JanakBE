import {
  AfterLoad,
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
   * lost — @AfterLoad() below falls back to this when `image` is unset.
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

  /**
   * Runs after every load — including as a nested relation (e.g. a product's
   * `category`), not just when queried directly — so `image` is always a
   * usable absolute URL no matter which service loaded this row. Entities
   * aren't part of the Nest DI container, so APP_URL is read from
   * process.env directly rather than via ConfigService.
   */
  @AfterLoad()
  normalizeImage() {
    if (!this.image && this.icon) this.image = this.icon;
    if (this.image && !/^https?:\/\//i.test(this.image)) {
      const baseUrl = process.env.APP_URL || 'http://localhost:3001';
      this.image = `${baseUrl}${this.image.startsWith('/') ? '' : '/'}${this.image}`;
    }
  }
}
