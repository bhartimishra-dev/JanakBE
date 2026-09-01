import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MediaType } from '../../../common/enums/media-type.enum';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: MediaType, default: MediaType.IMAGE })
  type: MediaType;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  product: Product;
}
