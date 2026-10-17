import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContactEnquiryStatus } from '../../../common/enums/contact-enquiry-status.enum';

@Entity('contact_enquiries')
export class ContactEnquiry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: ContactEnquiryStatus,
    default: ContactEnquiryStatus.NEW,
  })
  status: ContactEnquiryStatus;

  /** Internal notes from the admin team — never shown to the customer. */
  @Column({ type: 'text', nullable: true })
  adminNotes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
