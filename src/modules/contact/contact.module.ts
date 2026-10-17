import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactEnquiry } from './entities/contact-enquiry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ContactEnquiry])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
